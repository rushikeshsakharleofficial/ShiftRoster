from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, get_jwt_secret, serialize_doc, JWT_ALGORITHM
)
import jwt
import secrets

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    phone: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    # Keep cookies as fallback
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")


@router.post("/register")
async def register(data: RegisterRequest, request: Request, response: Response):
    email = data.email.strip().lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Get the default org
    org = await db.organizations.find_one()
    if not org:
        raise HTTPException(status_code=500, detail="No organization configured")

    user_doc = {
        "org_id": str(org["_id"]),
        "email": email,
        "password_hash": hash_password(data.password),
        "full_name": data.full_name,
        "phone": data.phone,
        "avatar_url": "",
        "system_role": "employee",
        "employee_level": "L1",
        "department_id": None,
        "position_id": None,
        "hourly_rate": None,
        "employment_type": "full_time",
        "skills": [],
        "status": "active",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    set_auth_cookies(response, access_token, refresh_token)

    return {
        "id": user_id,
        "email": email,
        "full_name": data.full_name,
        "system_role": "employee",
        "employee_level": "L1",
    }


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
        # Track failed attempt
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
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    set_auth_cookies(response, access_token, refresh_token)

    user_data = serialize_doc(user)
    user_data.pop("password_hash", None)
    user_data["access_token"] = access_token
    user_data["refresh_token"] = refresh_token
    return user_data


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
