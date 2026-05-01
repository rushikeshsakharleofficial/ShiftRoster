from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from urllib.parse import urlencode
from bson import ObjectId
from db import db
from auth_utils import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, get_jwt_secret, serialize_doc, JWT_ALGORITHM,
    generate_totp_secret, get_totp_uri, verify_totp_code,
    generate_qr_base64, create_mfa_temp_token, verify_mfa_temp_token,
    create_notification, log_audit
)
from ldap_service import authenticate_user as authenticate_ldap_user
import jwt
import secrets
import hashlib
import os
import logging
import random
import string

logger = logging.getLogger(__name__)

# Secure cookies over HTTPS — set SECURE_COOKIES=true in production
_SECURE_COOKIES = os.getenv("SECURE_COOKIES", "false").lower() == "true"
# Public-facing app URL — used in reset links; never derived from request headers
_APP_URL = os.getenv("APP_URL", "http://localhost")

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str
    remember_me: bool = False


class VerifyMfaRequest(BaseModel):
    mfa_token: str
    code: str
    remember_me: bool = False


class SetupMfaRequest(BaseModel):
    password: str  # Re-verify password before enabling MFA


class ConfirmMfaRequest(BaseModel):
    code: str
    secret: str


class DisableMfaRequest(BaseModel):
    password: str
    code: str  # Require a valid TOTP code to disable


def set_auth_cookies(response: Response, access_token: str, refresh_token: str, remember_me: bool = False):
    refresh_max_age = 2592000 if remember_me else 604800  # 30 days or 7 days
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=_SECURE_COOKIES, samesite="lax", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=_SECURE_COOKIES, samesite="lax", max_age=refresh_max_age, path="/")
    response.set_cookie(key="remember_me", value="1" if remember_me else "0", httponly=False, secure=_SECURE_COOKIES, samesite="lax", max_age=refresh_max_age, path="/")


@router.post("/login")
async def login(data: LoginRequest, request: Request, response: Response):
    raw = data.email.strip()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{raw.lower()}"

    # Brute force check
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        lockout_until = attempt.get("locked_until")
        # Ensure lockout_until is aware for comparison
        if lockout_until:
            if lockout_until.tzinfo is None:
                lockout_until = lockout_until.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) < lockout_until:
                raise HTTPException(status_code=429, detail="Too many login attempts. Try again in 15 minutes.")
            else:
                await db.login_attempts.delete_one({"identifier": identifier})

    # Accept email OR username
    if "@" in raw:
        user = await db.users.find_one({"email": raw.lower()})
    else:
        user = await db.users.find_one({"username": raw.lower()})

    valid_credentials = False
    if user:
        if user.get("auth_provider", "local") == "ldap":
            ldap_username = user.get("username") or raw.lower()
            try:
                valid_credentials = await authenticate_ldap_user(
                    user["org_id"],
                    ldap_username,
                    data.password,
                    user.get("ldap_dn", ""),
                )
            except HTTPException:
                valid_credentials = False
        elif user.get("password_hash"):
            valid_credentials = verify_password(data.password, user["password_hash"])

    if not user or not valid_credentials:
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {
                "$inc": {"count": 1},
                "$set": {"locked_until": datetime.now(timezone.utc) + __import__('datetime').timedelta(minutes=15)},
                "$setOnInsert": {"created_at": datetime.now(timezone.utc)},
            },
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Invalid email/username or password")

    if user.get("status") == "inactive":
        raise HTTPException(status_code=403, detail="Account is deactivated")

    # Clear failed attempts on success
    await db.login_attempts.delete_many({"identifier": identifier})

    user_id = str(user["_id"])

    # Check if MFA is enabled
    if user.get("mfa_enabled"):
        mfa_token = create_mfa_temp_token(user_id)
        return {"mfa_required": True, "mfa_token": mfa_token, "remember_me": data.remember_me}

    # Check if MFA is mandated but not set up yet
    if user.get("mfa_mandated") and not user.get("mfa_enabled"):
        mfa_token = create_mfa_temp_token(user_id)
        return {"mfa_setup_required": True, "mfa_token": mfa_token, "remember_me": data.remember_me}

    access_token = create_access_token(user_id, user["email"])
    refresh_token = create_refresh_token(user_id)
    set_auth_cookies(response, access_token, refresh_token, remember_me=data.remember_me)

    user_data = serialize_doc(user)
    user_data.pop("password_hash", None)
    user_data.pop("mfa_secret", None)
    # Tokens are now only in HTTP-only cookies for better security
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

    totp_valid = verify_totp_code(mfa_secret, data.code)
    backup_valid = False
    if not totp_valid:
        # Normalise code: strip dashes/spaces, uppercase, then reformat as XXXXXXXX-XXXXXXXX
        code_clean = data.code.upper().replace("-", "").replace(" ", "")
        formatted = (code_clean[:8] + "-" + code_clean[8:]) if len(code_clean) == 16 else data.code.upper()
        code_hash = hashlib.sha256(formatted.encode()).hexdigest()
        if code_hash in user.get("mfa_backup_codes", []):
            backup_valid = True
            remaining = [c for c in user.get("mfa_backup_codes", []) if c != code_hash]
            await db.users.update_one({"_id": user["_id"]}, {"$set": {"mfa_backup_codes": remaining}})

    if not totp_valid and not backup_valid:
        raise HTTPException(status_code=401, detail="Invalid MFA code")

    access_token = create_access_token(user_id, user["email"])
    refresh_token = create_refresh_token(user_id)
    set_auth_cookies(response, access_token, refresh_token, remember_me=data.remember_me)

    user_data = serialize_doc(user)
    user_data.pop("password_hash", None)
    user_data.pop("mfa_secret", None)
    # Tokens are now only in HTTP-only cookies for better security
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


class RecoveryRequest(BaseModel):
    email: str
    message: Optional[str] = None


@router.post("/forgot-password")
async def forgot_password_request(data: RecoveryRequest, request: Request):
    """User forgot password. Send email if SMTP is up, else alert manager."""
    from auth_utils import generate_setup_token, hash_setup_token
    from email_utils import send_email
    from datetime import timedelta

    # Rate limit: 3 attempts per IP+email per hour to prevent enumeration + SMTP DoS
    ip = request.client.host if request.client else "unknown"
    email_normalized = data.email.lower().strip()
    rate_key = f"{ip}:{email_normalized}"
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(hours=1)

    attempt = await db.password_reset_attempts.find_one({"identifier": rate_key})
    if attempt and attempt.get("first_attempt_at", now) > window_start:
        if attempt.get("count", 0) >= 3:
            # Silent fail (same response as success) to avoid enumeration leak
            return {"message": "If this account exists, instructions have been sent."}
        await db.password_reset_attempts.update_one(
            {"identifier": rate_key},
            {"$inc": {"count": 1}, "$set": {"last_attempt_at": now}}
        )
    else:
        await db.password_reset_attempts.update_one(
            {"identifier": rate_key},
            {"$set": {"identifier": rate_key, "count": 1, "first_attempt_at": now, "last_attempt_at": now}},
            upsert=True
        )

    user = await db.users.find_one({"email": email_normalized})
    if not user:
        return {"message": "If this account exists, instructions have been sent."}

    org = await db.organizations.find_one({"_id": ObjectId(user["org_id"])})
    token = generate_setup_token()
    expires = datetime.now(timezone.utc) + timedelta(hours=2) # Shorter window for resets
    
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {
            "password_setup_token": hash_setup_token(token),
            "password_setup_expires": expires,
            "updated_at": datetime.now(timezone.utc)
        }}
    )

    reset_link = f"{_APP_URL}/setup-password?token={token}"
    
    smtp_success = False
    if org.get("smtp_enabled"):
        html = f"""
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
            <h2 style="color: #4f46e5;">Password Reset Request</h2>
            <p>Hello {user['full_name']},</p>
            <p>We received a request to reset your ShiftMaster password.</p>
            <div style="margin: 30px 0;">
                <a href="{reset_link}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
            </div>
            <p>This link will expire in 2 hours. If you did not request this, please ignore this email.</p>
        </div>
        """
        smtp_success = await send_email(org, user["email"], "Password Reset Request", html)

    # Notify managers regardless, so they can manually provide the link if needed
    managers = await db.users.find({
        "org_id": user["org_id"], 
        "system_role": {"$in": ["admin", "manager"]}
    }).to_list(10)

    for mgr in managers:
        await create_notification(
            user_id=str(mgr["_id"]),
            ntype="security",
            title="Password Reset Request",
            body=f"{user['full_name']} requested a password reset. {'Reset email sent to user.' if smtp_success else 'No SMTP configured — send user a new invitation from admin settings.'}",
            link=f"/settings?tab=security"
        )

    return {"message": "If this account exists, instructions have been sent."}

@router.post("/mfa-recovery-request")
async def request_mfa_recovery(data: RecoveryRequest):
    """User has lost MFA access. Send alert to their manager/admin."""
    user = await db.users.find_one({"email": data.email.lower().strip()})
    if not user:
        # Don't leak user existence
        return {"message": "If this account exists, a recovery request has been sent to your manager."}
    
    if not user.get("mfa_enabled"):
        return {"message": "MFA is not enabled for this account."}

    # Find managers
    managers = []
    if user.get("department_id"):
        # Users in a department report to their department managers
        # (Simplified: list all managers in the org for now, or specific ones)
        cursor = db.users.find({"org_id": user["org_id"], "system_role": {"$in": ["manager", "admin"]}})
        managers = await cursor.to_list(20)
    else:
        # No department? Report to admins
        cursor = db.users.find({"org_id": user["org_id"], "system_role": "admin"})
        managers = await cursor.to_list(20)

    for mgr in managers:
        await create_notification(
            user_id=str(mgr["_id"]),
            ntype="mfa_recovery",
            title="MFA Recovery Request",
            body=f"User {user['full_name']} (@{user['username']}) is requesting an MFA reset. Reason: {data.message or 'Lost access'}",
            link=f"/settings?tab=security&reset_user={user['_id']}"
        )
        
        # Log audit
        await log_audit(
            org_id=user["org_id"],
            actor_id=str(user["_id"]),
            action="mfa_recovery_requested",
            entity="user",
            entity_id=str(user["_id"]),
            diff={"manager_id": str(mgr["_id"])}
        )

    return {"message": "If this account exists, a recovery request has been sent to your manager."}



@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}


@router.post("/admin/reset-user-mfa/{user_id}")
async def admin_reset_mfa(user_id: str, request: Request):
    """Admin/Manager resets a user's MFA."""
    from auth_utils import get_current_user
    current = await get_current_user(request)
    
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can reset user MFA")

    user = await db.users.find_one({"_id": ObjectId(user_id), "org_id": current["org_id"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "mfa_enabled": False, 
            "mfa_secret": None, 
            "mfa_backup_codes": [],
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    await log_audit(
        org_id=current["org_id"],
        actor_id=current["id"],
        action="mfa_reset_by_admin",
        entity="user",
        entity_id=user_id,
        diff={"user_email": user["email"]}
    )
    
    await create_notification(
        user_id=user_id,
        ntype="system",
        title="MFA Reset",
        body=f"Your MFA has been reset by {current['full_name']}. Please set it up again next time you log in."
    )

    return {"message": f"MFA for {user['full_name']} has been reset."}


class SetupPasswordRequest(BaseModel):
    token: str
    password: str


@router.post("/setup-password")
async def setup_password(data: SetupPasswordRequest):
    """New user sets their password for the first time using a secure token."""
    from auth_utils import hash_password, hash_setup_token, validate_password

    hashed_token = hash_setup_token(data.token)

    # Lookup user first to get org_id for policy check
    user_lookup = await db.users.find_one({
        "password_setup_token": hashed_token,
        "password_setup_expires": {"$gt": datetime.now(timezone.utc)}
    })
    if not user_lookup:
        raise HTTPException(status_code=400, detail="Invalid or expired setup token")

    # Enforce org-specific password policy
    await validate_password(db, user_lookup.get("org_id"), data.password)

    # Atomic find-and-update still protects against TOCTOU (token match required)
    user = await db.users.find_one_and_update(
        {
            "password_setup_token": hashed_token,
            "password_setup_expires": {"$gt": datetime.now(timezone.utc)}
        },
        {"$set": {
            "password_hash": hash_password(data.password),
            "password_setup_token": None,
            "password_setup_expires": None,
            "status": "active",
            "updated_at": datetime.now(timezone.utc)
        }}
    )

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired setup token")

    await log_audit(user["org_id"], str(user["_id"]), "setup_password", "user", str(user["_id"]))

    return {"message": "Password set successfully. You can now log in."}




@router.get("/me")
async def get_me(request: Request):
    from auth_utils import get_current_user
    user = await get_current_user(request)
    return user


@router.post("/generate-backup-codes")
async def generate_backup_codes(request: Request):
    from auth_utils import get_current_user
    current = await get_current_user(request)
    user = await db.users.find_one({"_id": ObjectId(current["id"])})
    if not user or not user.get("mfa_enabled"):
        raise HTTPException(status_code=400, detail="MFA must be enabled to generate backup codes")

    # Generate 8 backup codes in XXXXXXXX-XXXXXXXX format
    codes = [secrets.token_hex(4).upper() + "-" + secrets.token_hex(4).upper() for _ in range(8)]
    hashed = [hashlib.sha256(c.encode()).hexdigest() for c in codes]

    await db.users.update_one(
        {"_id": ObjectId(current["id"])},
        {"$set": {"mfa_backup_codes": hashed, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"backup_codes": codes}


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

        # Rotate both access and refresh tokens (prevents long-lived token reuse)
        access_token = create_access_token(str(user["_id"]), user["email"])
        new_refresh_token = create_refresh_token(str(user["_id"]))

        remember_me = request.cookies.get("remember_me") == "1"
        refresh_max_age = 2592000 if remember_me else 604800

        response.set_cookie(
            key="access_token", value=access_token,
            httponly=True, secure=_SECURE_COOKIES, samesite="lax",
            max_age=3600, path="/"
        )
        response.set_cookie(
            key="refresh_token", value=new_refresh_token,
            httponly=True, secure=_SECURE_COOKIES, samesite="lax",
            max_age=refresh_max_age, path="/"
        )
        return {"message": "Token refreshed"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


# ──────────────────────────────────────────
# Slack OIDC
# ──────────────────────────────────────────

@router.get("/slack/config")
async def slack_config():
    """Public: whether Slack SSO is enabled and the client_id (no secret)."""
    org = await db.organizations.find_one({})
    if not org:
        return {"enabled": False, "client_id": ""}
    slack = org.get("slack_oidc") or {}
    enabled = bool(slack.get("enabled"))
    return {
        "enabled": enabled,
        "client_id": slack.get("client_id", "") if enabled else "",
    }


@router.get("/slack/login")
async def slack_login():
    """Redirect to Slack's OIDC authorize endpoint."""
    import time
    org = await db.organizations.find_one({})
    if not org:
        raise HTTPException(status_code=503, detail="No organization configured")
    slack = org.get("slack_oidc") or {}
    if not slack.get("enabled"):
        raise HTTPException(status_code=400, detail="Slack SSO is not enabled")

    client_id = slack.get("client_id", "").strip()
    instance_base_url = (slack.get("instance_base_url") or "").rstrip("/")
    allowed_workspace = (slack.get("allowed_workspace") or "").strip()
    if not client_id or not instance_base_url:
        raise HTTPException(status_code=400, detail="Slack SSO missing client_id or instance_base_url")
    if not allowed_workspace:
        raise HTTPException(status_code=400, detail="Slack SSO requires Allowed Workspace Domain to be configured before accepting logins")

    redirect_uri = f"{instance_base_url}/api/auth/slack/callback"

    state_payload = {
        "csrf_nonce": secrets.token_hex(16),
        "org_id": str(org["_id"]),
        "exp": int(time.time()) + 300,
        "type": "slack_state",
    }
    state = jwt.encode(state_payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

    params = urlencode({
        "client_id": client_id,
        "scope": "openid profile email",
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": state,
    })
    return RedirectResponse(url=f"https://slack.com/openid/connect/authorize?{params}")


@router.get("/slack/callback")
async def slack_callback(
    request: Request,
    code: str = None,
    state: str = None,
    error: str = None,
):
    """Slack returns here after user grants permission."""
    import httpx

    def fail(reason: str):
        return RedirectResponse(url=f"/login?error={reason}")

    if error:
        return fail("slack_denied")
    if not code or not state:
        return fail("slack_invalid")

    # Verify state JWT (CSRF + org_id)
    try:
        state_payload = jwt.decode(state, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if state_payload.get("type") != "slack_state":
            raise ValueError("wrong type")
    except Exception:
        return fail("slack_state_invalid")

    org_id = state_payload.get("org_id")
    org = await db.organizations.find_one({"_id": ObjectId(org_id)})
    if not org:
        return fail("slack_org_not_found")

    slack = org.get("slack_oidc") or {}
    if not slack.get("enabled"):
        return fail("slack_disabled")

    client_id = slack.get("client_id", "").strip()
    instance_base_url = (slack.get("instance_base_url") or "").rstrip("/")

    from slack_service import decrypt_client_secret
    client_secret = decrypt_client_secret(slack.get("client_secret", ""))

    if not client_id or not client_secret or not instance_base_url:
        return fail("slack_not_configured")

    redirect_uri = f"{instance_base_url}/api/auth/slack/callback"

    # Exchange code for tokens
    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.post(
            "https://slack.com/api/openid.connect.token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    token_data = token_resp.json()
    if not token_data.get("ok"):
        logger.warning("Slack token exchange failed: %s", token_data.get("error"))
        return fail("slack_token_failed")

    slack_access_token = token_data.get("access_token")

    # Fetch userInfo
    async with httpx.AsyncClient(timeout=10) as client:
        userinfo_resp = await client.get(
            "https://slack.com/api/openid.connect.userInfo",
            headers={"Authorization": f"Bearer {slack_access_token}"},
        )
    userinfo = userinfo_resp.json()
    if not userinfo.get("ok"):
        return fail("slack_userinfo_failed")

    email = (userinfo.get("email") or "").lower().strip()
    name = userinfo.get("name") or userinfo.get("real_name") or email
    team_domain = (
        userinfo.get("https://slack.com/team_domain")
        or userinfo.get("https://slack.com/team_name", "")
    )

    if not email:
        return fail("slack_no_email")

    # Workspace restriction
    allowed_workspace = (slack.get("allowed_workspace") or "").strip().lower()
    if not allowed_workspace:
        # Organization must configure workspace restriction before Slack SSO accepts logins
        return fail("slack_workspace_not_configured")
    if team_domain.lower() != allowed_workspace:
        return fail("slack_workspace_not_allowed")

    # Find or provision user
    user = await db.users.find_one({"email": email, "org_id": org_id})
    if not user:
        if not slack.get("auto_provision", True):
            return fail("slack_user_not_found")
        rand_pass = secrets.token_urlsafe(18)
        new_user = {
            "org_id": org_id,
            "email": email,
            "name": name,
            "password_hash": hash_password(rand_pass),
            "system_role": slack.get("default_role", "employee"),
            # New Slack users start pending — admin must approve before first login
            "status": "pending",
            "created_at": datetime.now(timezone.utc),
            "auth_source": "slack",
        }
        result = await db.users.insert_one(new_user)
        # Notify admins about new pending user
        try:
            from auth_utils import create_notification
            admin_users = db.users.find({"org_id": org_id, "system_role": "admin", "status": "active"})
            async for admin in admin_users:
                await create_notification(
                    str(admin["_id"]),
                    "slack_user_pending",
                    str(result.inserted_id),
                    f"New Slack user {email} is awaiting approval",
                )
        except Exception:
            pass
        return fail("slack_approval_pending")

    # Existing user must be active — pending = still awaiting admin approval
    if user.get("status") != "active":
        return fail("slack_approval_pending")

    # MFA check
    trust_slack_as_mfa = slack.get("trust_slack_as_mfa", False)
    if not trust_slack_as_mfa and user.get("mfa_enabled"):
        mfa_temp = create_mfa_temp_token(str(user["_id"]))
        return RedirectResponse(url=f"/login?mfa_token={mfa_temp}&slack_mfa=1")

    # Issue session cookies
    user_id = str(user["_id"])
    access_token_jwt = create_access_token(user_id, user["email"])
    refresh_token_jwt = create_refresh_token(user_id)

    resp = RedirectResponse(url=f"{instance_base_url}/")
    resp.set_cookie("access_token", access_token_jwt, httponly=True, secure=_SECURE_COOKIES, samesite="lax", max_age=3600, path="/")
    resp.set_cookie("refresh_token", refresh_token_jwt, httponly=True, secure=_SECURE_COOKIES, samesite="lax", max_age=604800, path="/")
    resp.set_cookie("remember_me", "0", httponly=False, secure=_SECURE_COOKIES, samesite="lax", max_age=604800, path="/")
    return resp


# ──────────────────────────────────────────
# Google OIDC
# ──────────────────────────────────────────

@router.get("/google/config")
async def google_config():
    """Public: whether Google SSO is enabled (no secret)."""
    org = await db.organizations.find_one({})
    if not org:
        return {"enabled": False, "client_id": ""}
    google = org.get("google_oidc") or {}
    enabled = bool(google.get("enabled"))
    return {
        "enabled": enabled,
        "client_id": google.get("client_id", "") if enabled else "",
    }


@router.get("/google/login")
async def google_login():
    """Redirect to Google's OIDC authorize endpoint."""
    import time
    org = await db.organizations.find_one({})
    if not org:
        raise HTTPException(status_code=503, detail="No organization configured")
    google = org.get("google_oidc") or {}
    if not google.get("enabled"):
        raise HTTPException(status_code=400, detail="Google SSO is not enabled")

    client_id = google.get("client_id", "").strip()
    instance_base_url = (google.get("instance_base_url") or "").rstrip("/")
    allowed_domain = (google.get("allowed_domain") or "").strip()
    if not client_id or not instance_base_url:
        raise HTTPException(status_code=400, detail="Google SSO missing client_id or instance_base_url")
    if not allowed_domain:
        raise HTTPException(status_code=400, detail="Google SSO requires Allowed Domain to be configured")

    redirect_uri = f"{instance_base_url}/api/auth/google/callback"

    state_payload = {
        "csrf_nonce": secrets.token_hex(16),
        "org_id": str(org["_id"]),
        "exp": int(time.time()) + 300,
        "type": "google_state",
    }
    state = jwt.encode(state_payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

    params = urlencode({
        "client_id": client_id,
        "scope": "openid email profile",
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": state,
        "hd": allowed_domain,
        "access_type": "online",
        "prompt": "select_account",
    })
    return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str = None,
    state: str = None,
    error: str = None,
):
    """Google returns here after user grants permission."""
    import httpx

    def fail(reason: str):
        return RedirectResponse(url=f"/login?error={reason}")

    if error:
        return fail("google_denied")
    if not code or not state:
        return fail("google_invalid")

    # Verify state JWT (CSRF + org_id)
    try:
        state_payload = jwt.decode(state, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if state_payload.get("type") != "google_state":
            raise ValueError("wrong type")
    except Exception:
        return fail("google_state_invalid")

    org_id = state_payload.get("org_id")
    org = await db.organizations.find_one({"_id": ObjectId(org_id)})
    if not org:
        return fail("google_org_not_found")

    google = org.get("google_oidc") or {}
    if not google.get("enabled"):
        return fail("google_disabled")

    client_id = google.get("client_id", "").strip()
    instance_base_url = (google.get("instance_base_url") or "").rstrip("/")

    from google_service import decrypt_client_secret
    client_secret = decrypt_client_secret(google.get("client_secret", ""))

    if not client_id or not client_secret or not instance_base_url:
        return fail("google_not_configured")

    redirect_uri = f"{instance_base_url}/api/auth/google/callback"

    # Exchange code for tokens
    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    token_data = token_resp.json()
    if "error" in token_data:
        logger.warning("Google token exchange failed: %s", token_data.get("error"))
        return fail("google_token_failed")

    access_token = token_data.get("access_token")

    # Fetch userInfo
    async with httpx.AsyncClient(timeout=10) as client:
        userinfo_resp = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    userinfo = userinfo_resp.json()

    email = (userinfo.get("email") or "").lower().strip()
    if not email:
        return fail("google_no_email")

    name = userinfo.get("name") or email
    email_domain = email.split("@")[1] if "@" in email else ""

    # Domain restriction — check hd claim (Google Workspace) or email domain
    allowed_domain = (google.get("allowed_domain") or "").strip().lower()
    if not allowed_domain:
        return fail("google_domain_not_configured")
    hd = (userinfo.get("hd") or "").lower()
    domain_ok = (hd == allowed_domain) if hd else (email_domain == allowed_domain)
    if not domain_ok:
        return fail("google_domain_not_allowed")

    # Find or provision user
    user = await db.users.find_one({"email": email, "org_id": org_id})
    if not user:
        if not google.get("auto_provision", True):
            return fail("google_user_not_found")
        rand_pass = secrets.token_urlsafe(18)
        new_user = {
            "org_id": org_id,
            "email": email,
            "full_name": name,
            "password_hash": hash_password(rand_pass),
            "system_role": google.get("default_role", "employee"),
            "status": "pending",
            "created_at": datetime.now(timezone.utc),
            "auth_source": "google",
        }
        result = await db.users.insert_one(new_user)
        try:
            from auth_utils import create_notification
            admin_users = db.users.find({"org_id": org_id, "system_role": "admin", "status": "active"})
            async for admin in admin_users:
                await create_notification(
                    str(admin["_id"]),
                    "google_user_pending",
                    str(result.inserted_id),
                    f"New Google user {email} is awaiting approval",
                )
        except Exception:
            pass
        return fail("google_approval_pending")

    if user.get("status") != "active":
        return fail("google_approval_pending")

    # MFA check
    trust_google_as_mfa = google.get("trust_google_as_mfa", False)
    if not trust_google_as_mfa and user.get("mfa_enabled"):
        mfa_temp = create_mfa_temp_token(str(user["_id"]))
        return RedirectResponse(url=f"/login?mfa_token={mfa_temp}&google_mfa=1")

    # Issue session cookies
    user_id = str(user["_id"])
    access_token_jwt = create_access_token(user_id, user["email"])
    refresh_token_jwt = create_refresh_token(user_id)

    resp = RedirectResponse(url=f"{instance_base_url}/")
    resp.set_cookie("access_token", access_token_jwt, httponly=True, secure=_SECURE_COOKIES, samesite="lax", max_age=3600, path="/")
    resp.set_cookie("refresh_token", refresh_token_jwt, httponly=True, secure=_SECURE_COOKIES, samesite="lax", max_age=604800, path="/")
    resp.set_cookie("remember_me", "0", httponly=False, secure=_SECURE_COOKIES, samesite="lax", max_age=604800, path="/")
    return resp
