from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, log_audit, can_assign_group, get_user_permissions
from iam_constants import RESOURCES, ACTIONS

router = APIRouter(prefix="/api/iam", tags=["iam"])


# ── Models ──

class Permission(BaseModel):
    resource: str
    action: str


class CreateGroupRequest(BaseModel):
    name: str
    description: str = ""
    permissions: List[Permission]


class UpdateGroupRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[Permission]] = None


class AssignGroupRequest(BaseModel):
    group_ids: List[str]


# ── Helpers ──

def _validate_perms(permissions: List[Permission]):
    for p in permissions:
        if p.resource not in RESOURCES:
            raise HTTPException(status_code=400, detail=f"Invalid resource: {p.resource}")
        if p.action not in ACTIONS:
            raise HTTPException(status_code=400, detail=f"Invalid action: {p.action}")


async def _get_group_or_404(group_id: str, org_id: str):
    try:
        oid = ObjectId(group_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group ID")
    group = await db.iam_groups.find_one({
        "_id": oid,
        "$or": [{"org_id": org_id}, {"is_global": True}],
    })
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


# ── Group CRUD ──

@router.get("/groups")
async def list_groups(request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    org_id = current.get("org_id")
    groups = await db.iam_groups.find({
        "$or": [{"org_id": org_id}, {"is_global": True}]
    }).sort("name", 1).to_list(200)
    return serialize_list(groups)


@router.get("/permissions/catalog")
async def get_permission_catalog(request: Request):
    """Return all valid resource × action combinations."""
    await get_current_user(request)
    return {"resources": RESOURCES, "actions": ACTIONS}


@router.get("/me/permissions")
async def my_permissions(request: Request):
    """Return flat list of permissions the calling user holds."""
    current = await get_current_user(request)
    perms = await get_user_permissions(current, db)
    return {"permissions": perms}


@router.post("/groups", status_code=201)
async def create_group(data: CreateGroupRequest, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    _validate_perms(data.permissions)

    group_doc = {
        "org_id": current.get("org_id"),
        "name": data.name.strip(),
        "description": data.description.strip(),
        "permissions": [p.model_dump() for p in data.permissions],
        "is_template": True,
        "is_global": False,
        "created_by": current["id"],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    # Escalation check: manager cannot create group with perms they don't hold.
    if current["system_role"] == "manager":
        if not await can_assign_group(current, group_doc, db):
            raise HTTPException(
                status_code=403,
                detail="Cannot create group with permissions exceeding your own",
            )

    result = await db.iam_groups.insert_one(group_doc)
    group_doc["_id"] = result.inserted_id
    await log_audit(current.get("org_id"), current["id"], "create", "iam_group", str(result.inserted_id))
    return serialize_doc(group_doc)


@router.get("/groups/{group_id}")
async def get_group(group_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    group = await _get_group_or_404(group_id, current.get("org_id"))
    return serialize_doc(group)


@router.put("/groups/{group_id}")
async def update_group(group_id: str, data: UpdateGroupRequest, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    group = await _get_group_or_404(group_id, current.get("org_id"))

    if group.get("is_global"):
        raise HTTPException(status_code=403, detail="Cannot modify built-in global templates")
    if group.get("org_id") != current.get("org_id"):
        raise HTTPException(status_code=403, detail="Not your organization's group")

    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    if data.name is not None:
        updates["name"] = data.name.strip()
    if data.description is not None:
        updates["description"] = data.description.strip()
    if data.permissions is not None:
        _validate_perms(data.permissions)
        updates["permissions"] = [p.model_dump() for p in data.permissions]
        # Escalation check
        if current["system_role"] == "manager":
            test_group = {**group, "permissions": updates["permissions"]}
            if not await can_assign_group(current, test_group, db):
                raise HTTPException(
                    status_code=403,
                    detail="Cannot set permissions exceeding your own",
                )

    await db.iam_groups.update_one({"_id": group["_id"]}, {"$set": updates})
    await log_audit(current.get("org_id"), current["id"], "update", "iam_group", group_id)
    updated = await db.iam_groups.find_one({"_id": group["_id"]})
    return serialize_doc(updated)


@router.delete("/groups/{group_id}", status_code=204)
async def delete_group(group_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete groups")

    group = await _get_group_or_404(group_id, current.get("org_id"))
    if group.get("is_global"):
        raise HTTPException(status_code=403, detail="Cannot delete built-in global templates")

    await db.iam_groups.delete_one({"_id": group["_id"]})
    # Remove from all users
    await db.users.update_many(
        {"org_id": current.get("org_id")},
        {"$pull": {"iam_group_ids": group_id}},
    )
    await log_audit(current.get("org_id"), current["id"], "delete", "iam_group", group_id)


# ── User Assignment ──

@router.get("/users/{user_id}/groups")
async def get_user_groups(user_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager") and current["id"] != user_id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    user = await db.users.find_one({"_id": ObjectId(user_id), "org_id": current.get("org_id")})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    group_ids = user.get("iam_group_ids", [])
    if not group_ids:
        return []
    groups = await db.iam_groups.find({
        "_id": {"$in": [ObjectId(gid) for gid in group_ids]}
    }).to_list(None)
    return serialize_list(groups)


@router.put("/users/{user_id}/groups")
async def assign_groups(user_id: str, data: AssignGroupRequest, request: Request):
    """Replace user's IAM group assignments (idempotent full replace)."""
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    org_id = current.get("org_id")
    target = await db.users.find_one({"_id": ObjectId(user_id), "org_id": org_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Admin cannot be managed via IAM — they already have all perms.
    if target.get("system_role") == "admin":
        raise HTTPException(status_code=400, detail="Admin users do not need IAM groups")

    # Manager cannot assign admin role via IAM "Full Access" to users they don't control.
    if current["system_role"] == "manager" and target.get("system_role") == "manager":
        raise HTTPException(status_code=403, detail="Managers cannot manage other managers via IAM")

    validated_ids = []
    for gid in data.group_ids:
        group = await _get_group_or_404(gid, org_id)
        # Escalation: manager must hold all perms in each group they assign.
        if current["system_role"] == "manager":
            if not await can_assign_group(current, group, db):
                raise HTTPException(
                    status_code=403,
                    detail=f"Cannot assign group '{group['name']}': contains permissions you don't hold",
                )
        validated_ids.append(gid)

    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"iam_group_ids": validated_ids, "updated_at": datetime.now(timezone.utc)}},
    )
    await log_audit(org_id, current["id"], "update", "user_iam_groups", user_id, {"group_ids": validated_ids})
    return {"message": "IAM groups updated", "group_ids": validated_ids}
