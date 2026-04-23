from fastapi import APIRouter, HTTPException, Request, Query, UploadFile, File
from auth_utils import create_notification, generate_unique_username
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, hash_password, log_audit, get_manager_dept_ids
from presence_manager import presence
from pathlib import Path
import uuid
import os

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB

router = APIRouter(prefix="/api/users", tags=["users"])


class CreateUserRequest(BaseModel):
    email: str
    password: str
    full_name: str
    username: Optional[str] = None  # auto-generated from full_name if omitted
    phone: str = ""
    system_role: str = "employee"
    employee_level: Optional[str] = "L1"
    department_id: Optional[str] = None
    position_id: Optional[str] = None
    hourly_rate: Optional[float] = None
    employment_type: str = "full_time"
    skills: List[str] = []
    mfa_mandated: bool = False
    disappearing_timer: Optional[str] = None
    public_key: Optional[str] = None


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    username: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    system_role: Optional[str] = None
    employee_level: Optional[str] = None
    department_id: Optional[str] = None
    position_id: Optional[str] = None
    hourly_rate: Optional[float] = None
    employment_type: Optional[str] = None
    skills: Optional[List[str]] = None
    status: Optional[str] = None
    mfa_mandated: Optional[bool] = None
    disappearing_timer: Optional[str] = None
    public_key: Optional[str] = None


class ChangeLevelRequest(BaseModel):
    level: str
    reason: str = ""


@router.get("")
async def list_users(
    request: Request,
    role: Optional[str] = None,
    department_id: Optional[str] = None,
    level: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    current = await get_current_user(request)
    is_admin_or_mgr = current["system_role"] in ("admin", "manager")

    query = {"org_id": current.get("org_id")}
    if role:
        query["system_role"] = role

    # Managers only see employees in their assigned departments
    if current["system_role"] == "manager":
        mgr_depts = await get_manager_dept_ids(current["id"], db)
        allowed = set(mgr_depts)
        if department_id:
            if department_id in allowed:
                query["department_id"] = department_id
            else:
                return {"users": [], "total": 0}
        else:
            query["department_id"] = {"$in": list(allowed)} if allowed else "__none__"
    elif department_id:
        query["department_id"] = department_id

    if level:
        query["employee_level"] = level
    if status:
        query["status"] = status
    if search:
        import re
        safe_search = re.escape(search)
        query["$or"] = [
            {"full_name": {"$regex": safe_search, "$options": "i"}},
            {"email": {"$regex": safe_search, "$options": "i"}},
            {"username": {"$regex": safe_search, "$options": "i"}},
        ]

    # If employee, they can only see basic info of others in the same org
    projection = {
        "password_hash": 0, 
        "mfa_secret": 0, 
        "mfa_backup_codes": 0
    }
    if not is_admin_or_mgr:
        projection = {
            "id": 1, "full_name": 1, "username": 1, "avatar_url": 1, 
            "department_id": 1, "system_role": 1, "status": 1
        }

    users = await db.users.find(query, projection).skip(skip).limit(limit).to_list(limit)
    total = await db.users.count_documents(query)
    
    return {"users": serialize_list(users), "total": total}


class CreateUserRequest(BaseModel):
    email: str
    password: Optional[str] = None
    full_name: str
    username: Optional[str] = None  # auto-generated from full_name if omitted
    phone: str = ""
    system_role: str = "employee"
    employee_level: Optional[str] = "L1"
    department_id: Optional[str] = None
    position_id: Optional[str] = None
    hourly_rate: Optional[float] = None
    employment_type: str = "full_time"
    skills: List[str] = []
    mfa_mandated: bool = False
    disappearing_timer: Optional[str] = None
    public_key: Optional[str] = None
    send_welcome_email: bool = True


@router.post("")
async def create_user(data: CreateUserRequest, request: Request):
    from auth_utils import generate_setup_token, hash_setup_token, hash_password
    from email_utils import send_email
    import secrets
    import string

    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    email = data.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")

    # Only admin can create managers
    if data.system_role == "manager" and current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can create managers")

    # Resolve username
    if data.username:
        uname = data.username.strip().lower()
        if await db.users.find_one({"username": uname}):
            raise HTTPException(status_code=400, detail="Username already taken")
    else:
        uname = await generate_unique_username(email.split("@")[0], db)

    # Password handling
    setup_token = None
    setup_expires = None
    status = "active"
    
    if not data.password:
        # Generate random temporary password
        temp_pass = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
        password_hash = hash_password(temp_pass)
        
        # Setup tokens
        setup_token = generate_setup_token()
        setup_expires = datetime.now(timezone.utc) + timedelta(hours=24)
        status = "pending_setup"
    else:
        # Enforce org password policy when admin provides explicit password
        from auth_utils import validate_password
        await validate_password(db, current.get("org_id"), data.password)
        password_hash = hash_password(data.password)

    user_doc = {
        "org_id": current.get("org_id"),
        "email": email,
        "username": uname,
        "password_hash": password_hash,
        "full_name": data.full_name,
        "phone": data.phone,
        "avatar_url": "",
        "system_role": data.system_role,
        "employee_level": data.employee_level if data.system_role == "employee" else None,
        "department_id": data.department_id,
        "position_id": data.position_id,
        "hourly_rate": data.hourly_rate,
        "employment_type": data.employment_type,
        "skills": data.skills,
        "status": status,
        "mfa_enabled": False,
        "mfa_mandated": data.mfa_mandated,
        "mfa_secret": None,
        "password_setup_token": hash_setup_token(setup_token) if setup_token else None,
        "password_setup_expires": setup_expires,
        "disappearing_timer": data.disappearing_timer,
        "public_key": data.public_key,
        "created_by": current["id"],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    doc = serialize_doc(user_doc)
    doc.pop("password_hash", None)
    doc.pop("password_setup_token", None)

    # ── Welcome Automation & Email ──
    try:
        org = await db.organizations.find_one({"_id": ObjectId(current["org_id"])})
        
        if setup_token and data.send_welcome_email:
            # Send setup email
            origin = request.headers.get("origin", "https://bot.linuxhardened.com")
            setup_link = f"{origin}/setup-password?token={setup_token}"
            html = f"""
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #4f46e5;">Welcome to {org['name']}</h2>
                <p>Hello {data.full_name},</p>
                <p>Your account on ShiftMaster has been created by {current['full_name']}.</p>
                <p>Please click the button below to set your password and access your dashboard. This link will expire in 24 hours.</p>
                <div style="margin: 30px 0;">
                    <a href="{setup_link}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Set My Password</a>
                </div>
                <p style="color: #666; font-size: 12px;">If the button doesn't work, copy and paste this link into your browser:<br>{setup_link}</p>
            </div>
            """
            await send_email(org, email, f"Welcome to {org['name']} - Set Your Password", html)

        # 1. Find the #general channel for this organization
        general_ch = await db.chat_channels.find_one({
            "org_id": user_doc["org_id"],
            "name": "general",
            "type": "public"
        })

        
        if general_ch:
            ch_id = str(general_ch["_id"])
            user_id = doc["id"]
            
            # 2. Add user to the channel members
            await db.chat_channels.update_one(
                {"_id": general_ch["_id"]},
                {"$addToSet": {"members": user_id}}
            )
            
            # 3. Send welcome message
            now = datetime.now(timezone.utc)
            welcome_text = f"Welcome to the team, @{doc['username']}! 👋"
            
            def _user_initials(name: str) -> str:
                parts = name.strip().split()
                if not parts: return "?"
                return "".join(p[0] for p in parts[:2]).upper()

            msg_doc = {
                "org_id": user_doc["org_id"],
                "channel_id": ch_id,
                "sender_id": "system",
                "sender_name": "Welcome Bot",
                "sender_initials": "WB",
                "text": welcome_text,
                "type": "system",
                "reactions": [],
                "reply_to": None,
                "created_at": now,
            }
            await db.chat_messages.insert_one(msg_doc)
            
            # 4. Update channel last message
            await db.chat_channels.update_one(
                {"_id": general_ch["_id"]},
                {
                    "$set": {
                        "last_message_at": now,
                        "last_message_preview": welcome_text[:80],
                        "updated_at": now,
                    },
                    "$inc": {"message_count": 1},
                }
            )
            
            # 5. Notify via WebSocket if possible
            all_members = [str(m) for m in general_ch.get("members", [])]
            if user_id not in all_members:
                all_members.append(user_id)
            
            await presence.send_to_users(all_members, {
                "type": "chat_new_message",
                "channel_id": ch_id,
                "message": {
                    "id": str(msg_doc["_id"]),
                    "channel_id": ch_id,
                    "sender_id": "system",
                    "sender_name": "Welcome Bot",
                    "sender_initials": "WB",
                    "text": welcome_text,
                    "type": "system",
                    "reactions": [],
                    "reply_to": None,
                    "created_at": now.isoformat(),
                }
            })
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Error in welcome automation")

    await log_audit(current.get("org_id"), current["id"], "create", "user", doc["id"])
    return doc


@router.get("/{user_id}")
async def get_user(user_id: str, request: Request):
    current = await get_current_user(request)
    try:
        # Cross-Org IDOR fix: filter by org_id
        user = await db.users.find_one({"_id": ObjectId(user_id), "org_id": current.get("org_id")}, {"password_hash": 0})
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # PII Exposure fix: limit fields for regular users
    if current["system_role"] == "employee" and current["id"] != user_id:
        # Only allow seeing basic info for other employees
        return {
            "id": str(user["_id"]),
            "full_name": user.get("full_name"),
            "username": user.get("username"),
            "avatar_url": user.get("avatar_url"),
            "department_id": user.get("department_id"),
            "system_role": user.get("system_role"),
        }
        
    return serialize_doc(user)


@router.put("/{user_id}")
async def update_user(user_id: str, data: UpdateUserRequest, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager") and current["id"] != user_id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Only admin can change system_role
    if "system_role" in update and current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can change roles")

    # Validate username uniqueness if changing it
    if "username" in update:
        uname = update["username"].strip().lower()
        conflict = await db.users.find_one({"username": uname, "_id": {"$ne": ObjectId(user_id)}})
        if conflict:
            raise HTTPException(status_code=400, detail="Username already taken")
        update["username"] = uname

    update["updated_at"] = datetime.now(timezone.utc)
    try:
        # Cross-Org IDOR fix: filter by org_id
        result = await db.users.update_one(
            {"_id": ObjectId(user_id), "org_id": current.get("org_id")}, 
            {"$set": update}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found or no changes")

    # Sync presence changes
    p_updates = {}
    if "full_name" in update:
        p_updates["name"] = update["full_name"]
    if "username" in update:
        p_updates["username"] = update["username"]
    if p_updates:
        await presence.update_user_data(user_id, p_updates)

    updated = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    await log_audit(current.get("org_id"), current["id"], "update", "user", user_id, {"changes": update})
    return serialize_doc(updated)


@router.delete("/{user_id}")
async def delete_user(user_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete users")

    # Cross-Org IDOR fix: filter by org_id
    result = await db.users.delete_one({"_id": ObjectId(user_id), "org_id": current.get("org_id")})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    await log_audit(current.get("org_id"), current["id"], "delete", "user", user_id)
    return {"message": "User deleted"}


@router.put("/{user_id}/level")
async def change_level(user_id: str, data: ChangeLevelRequest, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    if data.level not in ("L1", "L2", "L3"):
        raise HTTPException(status_code=400, detail="Invalid level")

    user = await db.users.find_one({"_id": ObjectId(user_id), "org_id": current.get("org_id")})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_level = user.get("employee_level")
    await db.users.update_one(
        {"_id": ObjectId(user_id), "org_id": current.get("org_id")},
        {"$set": {"employee_level": data.level, "updated_at": datetime.now(timezone.utc)}},
    )

    # Record level change history
    await db.employee_level_history.insert_one({
        "user_id": user_id,
        "changed_by": current["id"],
        "from_level": old_level,
        "to_level": data.level,
        "reason": data.reason,
        "changed_at": datetime.now(timezone.utc),
    })

    await log_audit(current.get("org_id"), current["id"], "update", "user_level", user_id, {"from": old_level, "to": data.level})
    return {"message": f"Level changed from {old_level} to {data.level}"}


class MandateMfaRequest(BaseModel):
    user_ids: Optional[List[str]] = None  # None = all users
    mandate: bool = True


@router.put("/mfa/mandate")
async def mandate_mfa(data: MandateMfaRequest, request: Request):
    """Mandate or un-mandate MFA for specific users or all users."""
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    query = {"org_id": current.get("org_id")}
    if data.user_ids:
        query["_id"] = {"$in": [ObjectId(uid) for uid in data.user_ids]}

    result = await db.users.update_many(
        query,
        {"$set": {"mfa_mandated": data.mandate, "updated_at": datetime.now(timezone.utc)}}
    )

    # Notify affected users
    if data.mandate and data.user_ids:
        for uid in data.user_ids:
            await create_notification(
                uid, "security",
                "MFA Required",
                "Your administrator has mandated Multi-Factor Authentication for your account. You will be prompted to set it up on your next login.",
            )

    action = "mandated" if data.mandate else "un-mandated"
    await log_audit(current.get("org_id"), current["id"], "mfa_mandate", "users", diff={"action": action, "count": result.modified_count})
    return {"message": f"MFA {action} for {result.modified_count} user(s)"}


class PublicKeyRequest(BaseModel):
    public_key: str


@router.put("/me/public-key")
async def set_my_public_key(data: PublicKeyRequest, request: Request):
    current = await get_current_user(request)
    await db.users.update_one(
        {"_id": ObjectId(current["id"])},
        {"$set": {"public_key": data.public_key, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"ok": True}


@router.get("/{user_id}/public-key")
async def get_user_public_key(user_id: str, request: Request):
    await get_current_user(request)
    try:
        u = await db.users.find_one(
            {"_id": ObjectId(user_id)}, {"public_key": 1}
        )
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")
    if not u or not u.get("public_key"):
        raise HTTPException(status_code=404, detail="Public key not found")
    return {"public_key": u["public_key"]}


@router.post("/{user_id}/avatar")
async def upload_avatar(user_id: str, request: Request, file: UploadFile = File(...)):
    """Upload or replace a user's avatar image (max 5 MB, images only)."""
    # --- IDOR Fix ---
    # 1. Get current user and target user
    current = await get_current_user(request)
    target_user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # 2. Authorization check
    is_admin = current["system_role"] == "admin"
    is_self = current["id"] == user_id
    is_manager = current["system_role"] == "manager"
    
    allowed = False
    if is_admin or is_self:
        allowed = True
    elif is_manager:
        manager_dept_ids = await get_manager_dept_ids(current["id"], db)
        if target_user.get("department_id") in manager_dept_ids:
            allowed = True
    
    if not allowed:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    UPLOADS_DIR.mkdir(exist_ok=True)
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    content = await file.read(MAX_AVATAR_BYTES + 1)
    if len(content) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=400, detail="Image too large (max 5 MB)")

    ext = os.path.splitext(file.filename or "avatar.jpg")[1] or ".jpg"
    unique_name = f"avatar_{uuid.uuid4().hex}{ext}"
    save_path = UPLOADS_DIR / unique_name
    with open(save_path, "wb") as f:
        f.write(content)

    avatar_url = f"/uploads/{unique_name}"
    try:
        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"avatar_url": avatar_url, "updated_at": datetime.now(timezone.utc)}},
        )
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")

    # Update presence manager if user is online
    await presence.update_user_data(user_id, {"avatar": avatar_url})

    await log_audit(current.get("org_id"), current["id"], "update", "user_avatar", user_id)
    return {"avatar_url": avatar_url}
