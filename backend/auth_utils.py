import bcrypt
import jwt
import os
import pyotp
import qrcode
import io
import base64
import re
import unicodedata
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request
from bson import ObjectId

JWT_ALGORITHM = "HS256"


def get_jwt_secret():
    return os.environ["JWT_SECRET"]


def _slugify_name(name: str) -> str:
    """Convert a full name to a lowercase dot-separated slug: 'Rushikesh Sakharle' -> 'rushikesh.sakharle'."""
    # Normalize unicode (e.g. accented chars)
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    name = name.lower().strip()
    # Replace spaces/hyphens with dots
    name = re.sub(r"[\s\-]+", ".", name)
    # Remove any characters that are not alphanumeric, dot, or underscore
    name = re.sub(r"[^a-z0-9._]", "", name)
    # Collapse repeated dots
    name = re.sub(r"\.{2,}", ".", name)
    name = name.strip(".")
    return name or "user"


async def get_manager_dept_ids(manager_id: str, db) -> list:
    """Return the list of department_ids the manager controls via their manager groups."""
    memberships = await db.manager_group_members.find({"user_id": manager_id}).to_list(50)
    group_ids = [m["group_id"] for m in memberships]
    if not group_ids:
        return []
    dept_docs = await db.manager_group_departments.find({"group_id": {"$in": group_ids}}).to_list(200)
    return list({d["department_id"] for d in dept_docs})


async def generate_unique_username(full_name: str, db) -> str:
    """Generate a unique username from a full name, appending a number if taken."""
    base = _slugify_name(full_name)
    candidate = base
    counter = 1
    while True:
        existing = await db.users.find_one({"username": candidate})
        if not existing:
            return candidate
        candidate = f"{base}{counter}"
        counter += 1


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def serialize_doc(doc):
    """Convert MongoDB document to JSON-safe dict, handling _id and ObjectId fields."""
    if doc is None:
        return None
    result = {}
    for key, val in doc.items():
        if key == "_id":
            result["id"] = str(val)
        elif isinstance(val, ObjectId):
            result[key] = str(val)
        elif isinstance(val, datetime):
            result[key] = val.isoformat()
        else:
            result[key] = val
    return result


def serialize_list(docs):
    return [serialize_doc(d) for d in docs]


def verify_access_token(token: str) -> dict:
    """Verify an access token and return the payload."""
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


async def get_current_user(request: Request):
    from db import db

    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user_data = serialize_doc(user)
        user_data.pop("password_hash", None)
        return user_data
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def log_audit(org_id, actor_id, action, entity, entity_id=None, diff=None, ip=None):
    from db import db

    await db.audit_logs.insert_one({
        "org_id": org_id,
        "actor_id": actor_id,
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "diff": diff,
        "ip_address": ip,
        "created_at": datetime.now(timezone.utc),
    })


async def create_notification(user_id, ntype, title, body=None, link=None):
    from db import db

    await db.notifications.insert_one({
        "user_id": user_id,
        "type": ntype,
        "title": title,
        "body": body,
        "link": link,
        "is_read": False,
        "sent_email": False,
        "created_at": datetime.now(timezone.utc),
    })


# ── MFA / TOTP Helpers ──

def generate_totp_secret():
    """Generate a new TOTP secret for Google Authenticator."""
    return pyotp.random_base32()


def get_totp_uri(secret, email, issuer="ShiftRoster"):
    """Get the otpauth URI for QR code generation."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name=issuer)


def verify_totp_code(secret, code):
    """Verify a TOTP code. Allow 1 window of drift."""
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def generate_qr_base64(uri):
    """Generate a QR code as a base64 PNG string."""
    qr = qrcode.QRCode(version=1, box_size=6, border=2)
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def create_mfa_temp_token(user_id: str) -> str:
    """Create a short-lived token for the MFA verification step."""
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        "type": "mfa_temp",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def verify_mfa_temp_token(token: str) -> str:
    """Verify a MFA temp token and return the user_id."""
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "mfa_temp":
            raise HTTPException(status_code=401, detail="Invalid MFA token type")
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="MFA token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid MFA token")


def generate_backup_codes(count=10):
    """Generate a list of 8-char alphanumeric backup codes."""
    import secrets
    import string
    codes = []
    for _ in range(count):
        code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))
        codes.append(code)
    return codes


def generate_setup_token():
    import secrets
    return secrets.token_urlsafe(32)

def hash_setup_token(token: str) -> str:
    import hashlib
    return hashlib.sha256(token.encode()).hexdigest()


# ── IAM Permission Helpers ──

async def has_permission(user_doc: dict, resource: str, action: str, db) -> bool:
    """Return True if user has (resource, action) via system_role or IAM groups."""
    if user_doc.get("system_role") == "admin":
        return True
    group_ids = user_doc.get("iam_group_ids", [])
    if not group_ids:
        return False
    try:
        oid_list = [ObjectId(gid) for gid in group_ids]
    except Exception:
        return False
    groups = await db.iam_groups.find({"_id": {"$in": oid_list}}).to_list(None)
    for group in groups:
        for perm in group.get("permissions", []):
            if perm.get("resource") == resource and perm.get("action") == action:
                return True
    return False


async def can_assign_group(grantor: dict, group: dict, db) -> bool:
    """Return True if grantor holds every permission in group (or is admin)."""
    if grantor.get("system_role") == "admin":
        return True
    for perm in group.get("permissions", []):
        if not await has_permission(grantor, perm["resource"], perm["action"], db):
            return False
    return True


async def get_user_permissions(user_doc: dict, db) -> list:
    """Return flat list of {resource, action} dicts the user holds via IAM groups."""
    if user_doc.get("system_role") == "admin":
        from iam_constants import RESOURCES, ACTIONS
        return [{"resource": r, "action": a} for r in RESOURCES for a in ACTIONS]
    group_ids = user_doc.get("iam_group_ids", [])
    if not group_ids:
        return []
    try:
        oid_list = [ObjectId(gid) for gid in group_ids]
    except Exception:
        return []
    groups = await db.iam_groups.find({"_id": {"$in": oid_list}}).to_list(None)
    seen = set()
    result = []
    for group in groups:
        for perm in group.get("permissions", []):
            key = (perm["resource"], perm["action"])
            if key not in seen:
                seen.add(key)
                result.append({"resource": perm["resource"], "action": perm["action"]})
    return result
