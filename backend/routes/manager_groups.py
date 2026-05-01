from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, log_audit

router = APIRouter(prefix="/api/manager-groups", tags=["manager-groups"])


class GroupCreate(BaseModel):
    name: str
    department_ids: List[str] = []
    member_ids: List[str] = []
    primary_manager: Optional[str] = None


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    primary_manager: Optional[str] = None


@router.get("")
async def list_groups(request: Request):
    current = await get_current_user(request)
    groups = await db.manager_groups.find({"org_id": current.get("org_id")}).to_list(100)
    result = []
    for g in groups:
        gdata = serialize_doc(g)
        members = await db.manager_group_members.find({"group_id": gdata["id"]}).to_list(50)
        gdata["members"] = serialize_list(members)
        depts = await db.manager_group_departments.find({"group_id": gdata["id"]}).to_list(50)
        gdata["departments"] = serialize_list(depts)
        result.append(gdata)
    return result


@router.post("")
async def create_group(data: GroupCreate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can create manager groups")

    doc = {
        "org_id": current.get("org_id"),
        "name": data.name,
        "primary_manager": data.primary_manager,
        "created_by": current["id"],
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.manager_groups.insert_one(doc)
    group_id = str(result.inserted_id)

    for dept_id in data.department_ids:
        await db.manager_group_departments.insert_one({
            "group_id": group_id,
            "department_id": dept_id,
        })
    for member_id in data.member_ids:
        await db.manager_group_members.insert_one({
            "group_id": group_id,
            "user_id": member_id,
            "added_by": current["id"],
            "added_at": datetime.now(timezone.utc),
        })

    doc["_id"] = result.inserted_id
    await log_audit(current.get("org_id"), current["id"], "create", "manager_group", group_id)
    return serialize_doc(doc)


@router.put("/{group_id}")
async def update_group(group_id: str, data: GroupUpdate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can update manager groups")

    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.manager_groups.update_one(
        {"_id": ObjectId(group_id), "org_id": current.get("org_id")},
        {"$set": update},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Group not found")

    updated = await db.manager_groups.find_one({"_id": ObjectId(group_id), "org_id": current.get("org_id")})
    return serialize_doc(updated)


@router.delete("/{group_id}")
async def delete_group(group_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete manager groups")

    result = await db.manager_groups.delete_one({"_id": ObjectId(group_id), "org_id": current.get("org_id")})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Group not found")
    await db.manager_group_members.delete_many({"group_id": group_id})
    await db.manager_group_departments.delete_many({"group_id": group_id})

    await log_audit(current.get("org_id"), current["id"], "delete", "manager_group", group_id)
    return {"message": "Group deleted"}


@router.post("/{group_id}/members")
async def add_member(group_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can add members")

    group = await db.manager_groups.find_one({"_id": ObjectId(group_id), "org_id": current.get("org_id")})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    body = await request.json()
    user_id = body.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")

    target_user = await db.users.find_one({"_id": ObjectId(user_id), "org_id": current.get("org_id")}, {"_id": 1})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = await db.manager_group_members.find_one({"group_id": group_id, "user_id": user_id})
    if existing:
        raise HTTPException(status_code=400, detail="User already in group")

    await db.manager_group_members.insert_one({
        "group_id": group_id,
        "user_id": user_id,
        "added_by": current["id"],
        "added_at": datetime.now(timezone.utc),
    })
    return {"message": "Member added"}


@router.delete("/{group_id}/members/{user_id}")
async def remove_member(group_id: str, user_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can remove members")

    group = await db.manager_groups.find_one({"_id": ObjectId(group_id), "org_id": current.get("org_id")}, {"_id": 1})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    await db.manager_group_members.delete_one({"group_id": group_id, "user_id": user_id})
    return {"message": "Member removed"}


@router.post("/{group_id}/departments")
async def add_department(group_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage group departments")

    group = await db.manager_groups.find_one({"_id": ObjectId(group_id), "org_id": current.get("org_id")})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    body = await request.json()
    dept_id = body.get("department_id")
    if not dept_id:
        raise HTTPException(status_code=400, detail="department_id required")

    target_dept = await db.departments.find_one({"_id": ObjectId(dept_id), "org_id": current.get("org_id")}, {"_id": 1})
    if not target_dept:
        raise HTTPException(status_code=404, detail="Department not found")

    existing = await db.manager_group_departments.find_one({"group_id": group_id, "department_id": dept_id})
    if existing:
        raise HTTPException(status_code=400, detail="Department already in group")

    await db.manager_group_departments.insert_one({
        "group_id": group_id,
        "department_id": dept_id,
    })
    return {"message": "Department added to group"}


@router.delete("/{group_id}/departments/{dept_id}")
async def remove_department(group_id: str, dept_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can manage group departments")

    group = await db.manager_groups.find_one({"_id": ObjectId(group_id), "org_id": current.get("org_id")}, {"_id": 1})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    await db.manager_group_departments.delete_one({"group_id": group_id, "department_id": dept_id})
    return {"message": "Department removed from group"}
