from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, log_audit, create_notification

router = APIRouter(prefix="/api", tags=["shifts"])


class ShiftTemplateCreate(BaseModel):
    name: str
    department_id: Optional[str] = None
    start_time: str
    end_time: str
    required_count: int = 1
    color_hex: Optional[str] = None


class ShiftCreate(BaseModel):
    title: str
    department_id: Optional[str] = None
    position_id: Optional[str] = None
    template_id: Optional[str] = None
    location: Optional[str] = None
    start_time: str
    end_time: str
    required_count: int = 1
    notes: Optional[str] = None
    is_open: bool = False


class ShiftUpdate(BaseModel):
    title: Optional[str] = None
    department_id: Optional[str] = None
    location: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    required_count: Optional[int] = None
    notes: Optional[str] = None
    is_open: Optional[bool] = None


class AssignmentCreate(BaseModel):
    shift_id: str
    user_id: str


# ── Shift Templates ──

@router.get("/shift-templates")
async def list_templates(request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    templates = await db.shift_templates.find({"org_id": current.get("org_id")}).to_list(200)
    return serialize_list(templates)


@router.post("/shift-templates")
async def create_template(data: ShiftTemplateCreate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    doc = {
        "org_id": current.get("org_id"),
        "name": data.name,
        "department_id": data.department_id,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "required_count": data.required_count,
        "color_hex": data.color_hex,
        "created_by": current["id"],
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.shift_templates.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


@router.delete("/shift-templates/{template_id}")
async def delete_template(template_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    await db.shift_templates.delete_one({"_id": ObjectId(template_id)})
    return {"message": "Template deleted"}


# ── Shifts ──

@router.get("/shifts")
async def list_shifts(
    request: Request,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    department_id: Optional[str] = None,
):
    current = await get_current_user(request)
    query = {"org_id": current.get("org_id")}

    if department_id:
        query["department_id"] = department_id
    if start_date:
        query["start_time"] = {"$gte": start_date}
    if end_date:
        query.setdefault("start_time", {})
        if isinstance(query["start_time"], dict):
            query["start_time"]["$lte"] = end_date
        else:
            query["start_time"] = {"$gte": query["start_time"], "$lte": end_date}

    shifts = await db.shifts.find(query).sort("start_time", 1).to_list(500)
    result = []
    for s in shifts:
        sdata = serialize_doc(s)
        # Get assignments for this shift
        assignments = await db.shift_assignments.find({"shift_id": sdata["id"]}).to_list(50)
        assigned_users = []
        for a in assignments:
            auser = await db.users.find_one({"_id": ObjectId(a["user_id"])}, {"password_hash": 0, "_id": 0})
            ad = serialize_doc(a)
            if auser:
                ad["user_name"] = auser.get("full_name", "")
            assigned_users.append(ad)
        sdata["assignments"] = assigned_users
        result.append(sdata)
    return result


@router.post("/shifts")
async def create_shift(data: ShiftCreate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    doc = {
        "org_id": current.get("org_id"),
        "title": data.title,
        "department_id": data.department_id,
        "position_id": data.position_id,
        "template_id": data.template_id,
        "location": data.location,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "required_count": data.required_count,
        "notes": data.notes,
        "is_open": data.is_open,
        "created_by": current["id"],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.shifts.insert_one(doc)
    doc["_id"] = result.inserted_id
    await log_audit(current.get("org_id"), current["id"], "create", "shift", str(result.inserted_id))
    return serialize_doc(doc)


@router.get("/shifts/{shift_id}")
async def get_shift(shift_id: str, request: Request):
    current = await get_current_user(request)
    shift = await db.shifts.find_one({"_id": ObjectId(shift_id)})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    sdata = serialize_doc(shift)
    assignments = await db.shift_assignments.find({"shift_id": shift_id}).to_list(50)
    sdata["assignments"] = serialize_list(assignments)
    return sdata


@router.put("/shifts/{shift_id}")
async def update_shift(shift_id: str, data: ShiftUpdate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc)

    result = await db.shifts.update_one({"_id": ObjectId(shift_id)}, {"$set": update})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Shift not found")

    updated = await db.shifts.find_one({"_id": ObjectId(shift_id)})
    await log_audit(current.get("org_id"), current["id"], "update", "shift", shift_id)
    return serialize_doc(updated)


@router.delete("/shifts/{shift_id}")
async def delete_shift(shift_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    await db.shifts.delete_one({"_id": ObjectId(shift_id)})
    await db.shift_assignments.delete_many({"shift_id": shift_id})
    await log_audit(current.get("org_id"), current["id"], "delete", "shift", shift_id)
    return {"message": "Shift deleted"}


# ── Shift Assignments ──

@router.get("/shift-assignments")
async def list_assignments(
    request: Request,
    shift_id: Optional[str] = None,
    user_id: Optional[str] = None,
):
    current = await get_current_user(request)
    query = {}
    if shift_id:
        query["shift_id"] = shift_id
    if user_id:
        query["user_id"] = user_id
    assignments = await db.shift_assignments.find(query).to_list(500)
    return serialize_list(assignments)


@router.post("/shift-assignments")
async def create_assignment(data: AssignmentCreate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    # Check for existing assignment
    existing = await db.shift_assignments.find_one({"shift_id": data.shift_id, "user_id": data.user_id})
    if existing:
        raise HTTPException(status_code=400, detail="User already assigned to this shift")

    doc = {
        "shift_id": data.shift_id,
        "user_id": data.user_id,
        "status": "assigned",
        "assigned_by": current["id"],
        "assigned_at": datetime.now(timezone.utc),
    }
    result = await db.shift_assignments.insert_one(doc)
    doc["_id"] = result.inserted_id

    # Notify assigned user
    shift = await db.shifts.find_one({"_id": ObjectId(data.shift_id)})
    if shift:
        await create_notification(
            data.user_id, "shift_assigned",
            f"You have been assigned to: {shift.get('title', 'a shift')}",
            link="/shifts"
        )

    return serialize_doc(doc)


@router.delete("/shift-assignments/{assignment_id}")
async def delete_assignment(assignment_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    await db.shift_assignments.delete_one({"_id": ObjectId(assignment_id)})
    return {"message": "Assignment removed"}


# ── Open Shift Claims ──

@router.get("/open-shift-claims")
async def list_claims(request: Request, shift_id: Optional[str] = None):
    current = await get_current_user(request)
    query = {}
    if shift_id:
        query["shift_id"] = shift_id
    claims = await db.open_shift_claims.find(query).to_list(100)
    return serialize_list(claims)


@router.post("/open-shift-claims")
async def claim_open_shift(request: Request):
    current = await get_current_user(request)
    body = await request.json()
    shift_id = body.get("shift_id")
    if not shift_id:
        raise HTTPException(status_code=400, detail="shift_id required")

    shift = await db.shifts.find_one({"_id": ObjectId(shift_id)})
    if not shift or not shift.get("is_open"):
        raise HTTPException(status_code=400, detail="Shift is not open for claims")

    existing = await db.open_shift_claims.find_one({"shift_id": shift_id, "user_id": current["id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Already claimed")

    doc = {
        "shift_id": shift_id,
        "user_id": current["id"],
        "status": "pending",
        "claimed_at": datetime.now(timezone.utc),
    }
    result = await db.open_shift_claims.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)
