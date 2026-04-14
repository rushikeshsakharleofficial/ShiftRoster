from fastapi import APIRouter, HTTPException, Request, Query
from auth_utils import create_notification
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, hash_password, log_audit

router = APIRouter(prefix="/api/users", tags=["users"])


class CreateUserRequest(BaseModel):
    email: str
    password: str
    full_name: str
    phone: str = ""
    system_role: str = "employee"
    employee_level: Optional[str] = "L1"
    department_id: Optional[str] = None
    position_id: Optional[str] = None
    hourly_rate: Optional[float] = None
    employment_type: str = "full_time"
    skills: List[str] = []
    mfa_mandated: bool = False


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
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
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    query = {"org_id": current.get("org_id")}
    if role:
        query["system_role"] = role
    if department_id:
        query["department_id"] = department_id
    if level:
        query["employee_level"] = level
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]

    users = await db.users.find(query, {"password_hash": 0}).skip(skip).limit(limit).to_list(limit)
    total = await db.users.count_documents(query)
    return {"users": serialize_list(users), "total": total}


@router.post("")
async def create_user(data: CreateUserRequest, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    email = data.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")

    # Only admin can create managers
    if data.system_role == "manager" and current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can create managers")

    user_doc = {
        "org_id": current.get("org_id"),
        "email": email,
        "password_hash": hash_password(data.password),
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
        "status": "active",
        "mfa_enabled": False,
        "mfa_mandated": data.mfa_mandated,
        "mfa_secret": None,
        "created_by": current["id"],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    doc = serialize_doc(user_doc)
    doc.pop("password_hash", None)

    await log_audit(current.get("org_id"), current["id"], "create", "user", doc["id"])
    return doc


@router.get("/{user_id}")
async def get_user(user_id: str, request: Request):
    current = await get_current_user(request)
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
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

    update["updated_at"] = datetime.now(timezone.utc)
    try:
        result = await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update})
    except Exception:
        raise HTTPException(status_code=404, detail="User not found")

    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found or no changes")

    updated = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
    await log_audit(current.get("org_id"), current["id"], "update", "user", user_id, {"changes": update})
    return serialize_doc(updated)


@router.delete("/{user_id}")
async def delete_user(user_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete users")

    result = await db.users.delete_one({"_id": ObjectId(user_id)})
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

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_level = user.get("employee_level")
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
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
