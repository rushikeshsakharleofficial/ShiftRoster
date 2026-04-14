from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, get_jwt_secret, serialize_doc, JWT_ALGORITHM,
    generate_totp_secret, get_totp_uri, verify_totp_code,
    generate_qr_base64, create_mfa_temp_token, verify_mfa_temp_token
)
import jwt

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class VerifyMfaRequest(BaseModel):
    mfa_token: str
    code: str


class SetupMfaRequest(BaseModel):
    password: str  # Re-verify password before enabling MFA


class ConfirmMfaRequest(BaseModel):
    code: str
    secret: str


class DisableMfaRequest(BaseModel):
    password: str
    code: str  # Require a valid TOTP code to disable


def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")


@router.post("/login")
async def login(data: LoginRequest, request: Request, response: Response):
    email = data.email.strip().lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"

    # Brute force check
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        lockout_until = attempt.get("locked_until")
        if lockout_until and datetime.now(timezone.utc) < lockout_until:
            raise HTTPException(status_code=429, detail="Too many login attempts. Try again in 15 minutes.")
        else:
            await db.login_attempts.delete_one({"identifier": identifier})

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {
                "$inc": {"count": 1},
                "$set": {"locked_until": datetime.now(timezone.utc) + __import__('datetime').timedelta(minutes=15)},
                "$setOnInsert": {"created_at": datetime.now(timezone.utc)},
            },
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.get("status") == "inactive":
        raise HTTPException(status_code=403, detail="Account is deactivated")

    # Clear failed attempts on success
    await db.login_attempts.delete_many({"identifier": identifier})

    user_id = str(user["_id"])

    # Check if MFA is enabled
    if user.get("mfa_enabled"):
        mfa_token = create_mfa_temp_token(user_id)
        return {"mfa_required": True, "mfa_token": mfa_token}

    # Check if MFA is mandated but not set up yet
    if user.get("mfa_mandated") and not user.get("mfa_enabled"):
        mfa_token = create_mfa_temp_token(user_id)
        return {"mfa_setup_required": True, "mfa_token": mfa_token}

    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    set_auth_cookies(response, access_token, refresh_token)

    user_data = serialize_doc(user)
    user_data.pop("password_hash", None)
    user_data.pop("mfa_secret", None)
    user_data["access_token"] = access_token
    user_data["refresh_token"] = refresh_token
    return user_data


@router.post("/verify-mfa")
async def verify_mfa(data: VerifyMfaRequest, response: Response):
    """Verify TOTP code after login credentials have been validated."""
    user_id = verify_mfa_temp_token(data.mfa_token)
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    mfa_secret = user.get("mfa_secret")
    if not mfa_secret:
        raise HTTPException(status_code=400, detail="MFA not configured")

    if not verify_totp_code(mfa_secret, data.code):
        raise HTTPException(status_code=401, detail="Invalid MFA code")

    access_token = create_access_token(user_id, user["email"])
    refresh_token = create_refresh_token(user_id)
    set_auth_cookies(response, access_token, refresh_token)

    user_data = serialize_doc(user)
    user_data.pop("password_hash", None)
    user_data.pop("mfa_secret", None)
    user_data["access_token"] = access_token
    user_data["refresh_token"] = refresh_token
    return user_data


@router.post("/setup-mfa")
async def setup_mfa(data: SetupMfaRequest, request: Request):
    """Generate a TOTP secret and QR code for MFA setup. Requires current password."""
    from auth_utils import get_current_user

    # Support both authenticated users and mfa_token flow
    mfa_token = request.headers.get("X-MFA-Token")
    if mfa_token:
        user_id = verify_mfa_temp_token(mfa_token)
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
    else:
        user = await get_current_user(request)
        user = await db.users.find_one({"_id": ObjectId(user["id"])})

    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid password")

    secret = generate_totp_secret()
    uri = get_totp_uri(secret, user["email"])
    qr_base64 = generate_qr_base64(uri)

    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_base64}",
        "manual_entry_key": secret,
    }


@router.post("/confirm-mfa")
async def confirm_mfa(data: ConfirmMfaRequest, request: Request, response: Response):
    """Confirm MFA setup by verifying a code, then enable MFA."""
    from auth_utils import get_current_user

    mfa_token = request.headers.get("X-MFA-Token")
    if mfa_token:
        user_id = verify_mfa_temp_token(mfa_token)
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
    else:
        user = await get_current_user(request)
        user = await db.users.find_one({"_id": ObjectId(user["id"])})

    if not verify_totp_code(data.secret, data.code):
        raise HTTPException(status_code=400, detail="Invalid code. Please try again.")

    user_id = str(user["_id"])
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {
            "mfa_enabled": True,
            "mfa_secret": data.secret,
            "updated_at": datetime.now(timezone.utc),
        }}
    )

    # If this was a mandated setup flow, issue tokens
    if mfa_token:
        access_token = create_access_token(user_id, user["email"])
        refresh_token = create_refresh_token(user_id)
        set_auth_cookies(response, access_token, refresh_token)

        user_data = serialize_doc(user)
        user_data.pop("password_hash", None)
        user_data.pop("mfa_secret", None)
        user_data["mfa_enabled"] = True
        user_data["access_token"] = access_token
        user_data["refresh_token"] = refresh_token
        return user_data

    return {"message": "MFA enabled successfully", "mfa_enabled": True}


@router.post("/disable-mfa")
async def disable_mfa(data: DisableMfaRequest, request: Request):
    """Disable MFA. Requires password and a valid TOTP code."""
    from auth_utils import get_current_user
    current = await get_current_user(request)
    user = await db.users.find_one({"_id": ObjectId(current["id"])})

    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid password")

    if not user.get("mfa_secret"):
        raise HTTPException(status_code=400, detail="MFA is not enabled")

    if user.get("mfa_mandated"):
        raise HTTPException(status_code=403, detail="MFA is mandated by your organization. Contact an admin to remove the mandate.")

    if not verify_totp_code(user["mfa_secret"], data.code):
        raise HTTPException(status_code=401, detail="Invalid MFA code")

    await db.users.update_one(
        {"_id": ObjectId(current["id"])},
        {"$set": {"mfa_enabled": False, "mfa_secret": None, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"message": "MFA disabled", "mfa_enabled": False}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}


@router.get("/me")
async def get_me(request: Request):
    from auth_utils import get_current_user
    user = await get_current_user(request)
    return user


@router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        access_token = create_access_token(str(user["_id"]), user["email"])
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
        return {"message": "Token refreshed", "access_token": access_token}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
