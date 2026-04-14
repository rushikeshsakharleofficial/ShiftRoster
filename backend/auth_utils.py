import bcrypt
import jwt
import os
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request
from bson import ObjectId

JWT_ALGORITHM = "HS256"


def get_jwt_secret():
    return os.environ["JWT_SECRET"]


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
