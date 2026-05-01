from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, log_audit, get_manager_dept_ids

router = APIRouter(prefix="/api", tags=["departments"])


class DepartmentCreate(BaseModel):
    name: str
    color_hex: str = "#3B82F6"


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    color_hex: Optional[str] = None


class PositionCreate(BaseModel):
    name: str
    department_id: Optional[str] = None


# ── Departments ──

@router.get("/departments")
async def list_departments(request: Request):
    current = await get_current_user(request)
    if current["system_role"] == "manager":
        mgr_depts = await get_manager_dept_ids(current["id"], db)
        if not mgr_depts:
            return []
        depts = await db.departments.find({"org_id": current.get("org_id"), "_id": {"$in": [ObjectId(d) for d in mgr_depts]}}).to_list(100)
    else:
        depts = await db.departments.find({"org_id": current.get("org_id")}).to_list(100)
    return serialize_list(depts)


@router.post("/departments")
async def create_department(data: DepartmentCreate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can create departments")

    doc = {
        "org_id": current.get("org_id"),
        "name": data.name,
        "color_hex": data.color_hex,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.departments.insert_one(doc)
    doc["_id"] = result.inserted_id
    await log_audit(current.get("org_id"), current["id"], "create", "department", str(result.inserted_id))
    return serialize_doc(doc)


@router.put("/departments/{dept_id}")
async def update_department(dept_id: str, data: DepartmentUpdate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can update departments")

    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.departments.update_one(
        {"_id": ObjectId(dept_id), "org_id": current.get("org_id")},
        {"$set": update},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Department not found")

    updated = await db.departments.find_one({"_id": ObjectId(dept_id), "org_id": current.get("org_id")})
    await log_audit(current.get("org_id"), current["id"], "update", "department", dept_id)
    return serialize_doc(updated)


@router.delete("/departments/{dept_id}")
async def delete_department(dept_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete departments")

    result = await db.departments.delete_one({"_id": ObjectId(dept_id), "org_id": current.get("org_id")})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Department not found")
    await log_audit(current.get("org_id"), current["id"], "delete", "department", dept_id)
    return {"message": "Department deleted"}


# ── Positions ──

@router.get("/positions")
async def list_positions(request: Request):
    current = await get_current_user(request)
    positions = await db.positions.find({"org_id": current.get("org_id")}).to_list(200)
    return serialize_list(positions)


@router.post("/positions")
async def create_position(data: PositionCreate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can create positions")

    doc = {
        "org_id": current.get("org_id"),
        "name": data.name,
        "department_id": data.department_id,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.positions.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


@router.delete("/positions/{pos_id}")
async def delete_position(pos_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete positions")

    result = await db.positions.delete_one({"_id": ObjectId(pos_id), "org_id": current.get("org_id")})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Position not found")
    return {"message": "Position deleted"}
