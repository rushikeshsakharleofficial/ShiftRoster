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


class ShiftMoveRequest(BaseModel):
    new_start_time: str
    new_end_time: str


class RecurringShiftCreate(BaseModel):
    title: str
    department_id: Optional[str] = None
    position_id: Optional[str] = None
    location: Optional[str] = None
    start_time: str  # time portion: HH:MM
    end_time: str    # time portion: HH:MM
    notes: Optional[str] = None
    is_open: bool = False
    required_count: int = 1
    rrule: str  # e.g. "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=12"
    range_start: str  # YYYY-MM-DD
    range_end: str    # YYYY-MM-DD


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


class ShiftTemplateUpdate(BaseModel):
    name: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    required_count: Optional[int] = None
    color_hex: Optional[str] = None


@router.put("/shift-templates/{template_id}")
async def update_template(template_id: str, data: ShiftTemplateUpdate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.shift_templates.update_one({"_id": ObjectId(template_id)}, {"$set": update})
    updated = await db.shift_templates.find_one({"_id": ObjectId(template_id)})
    await log_audit(current.get("org_id"), current["id"], "update", "shift_template", template_id)
    return serialize_doc(updated)


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

    # Notify assigned users of shift change
    assignments = await db.shift_assignments.find({"shift_id": shift_id}).to_list(50)
    for a in assignments:
        await create_notification(a["user_id"], "shift_updated",
            f"Shift '{updated.get('title', '')}' has been updated",
            link="/shifts")

    return serialize_doc(updated)


@router.delete("/shifts/{shift_id}")
async def delete_shift(shift_id: str, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    assignments = await db.shift_assignments.find({"shift_id": shift_id}).to_list(50)
    await db.shifts.delete_one({"_id": ObjectId(shift_id)})
    await db.shift_assignments.delete_many({"shift_id": shift_id})
    await log_audit(current.get("org_id"), current["id"], "delete", "shift", shift_id)
    for a in assignments:
        await create_notification(a["user_id"], "shift_deleted",
            "A shift you were assigned to has been removed",
            link="/shifts")
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


# ── Drag-and-Drop Move ──

@router.put("/shifts/{shift_id}/move")
async def move_shift(shift_id: str, data: ShiftMoveRequest, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    shift = await db.shifts.find_one({"_id": ObjectId(shift_id)})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Check conflicts for assigned users
    assignments = await db.shift_assignments.find({"shift_id": shift_id}).to_list(50)
    conflicts = []
    for a in assignments:
        overlapping = await db.shifts.find({
            "_id": {"$ne": ObjectId(shift_id)},
            "org_id": current.get("org_id"),
            "start_time": {"$lt": data.new_end_time},
            "end_time": {"$gt": data.new_start_time},
        }).to_list(100)
        for ov in overlapping:
            ov_assignments = await db.shift_assignments.find({"shift_id": str(ov["_id"]), "user_id": a["user_id"]}).to_list(1)
            if ov_assignments:
                user = await db.users.find_one({"_id": ObjectId(a["user_id"])}, {"full_name": 1})
                conflicts.append({
                    "user_id": a["user_id"],
                    "user_name": user.get("full_name", "") if user else "",
                    "conflicting_shift": serialize_doc(ov),
                })

    await db.shifts.update_one(
        {"_id": ObjectId(shift_id)},
        {"$set": {"start_time": data.new_start_time, "end_time": data.new_end_time, "updated_at": datetime.now(timezone.utc)}},
    )
    updated = await db.shifts.find_one({"_id": ObjectId(shift_id)})
    await log_audit(current.get("org_id"), current["id"], "move", "shift", shift_id)

    for a in assignments:
        await create_notification(a["user_id"], "shift_moved",
            f"Shift '{updated.get('title', '')}' has been rescheduled",
            link="/shifts")

    result = serialize_doc(updated)
    result["conflicts"] = conflicts
    return result


# ── Conflict Detection ──

@router.post("/shifts/check-conflicts")
async def check_conflicts(request: Request):
    current = await get_current_user(request)
    body = await request.json()
    user_id = body.get("user_id")
    start_time = body.get("start_time")
    end_time = body.get("end_time")
    exclude_shift_id = body.get("exclude_shift_id")

    if not user_id or not start_time or not end_time:
        raise HTTPException(status_code=400, detail="user_id, start_time, end_time required")

    query = {
        "org_id": current.get("org_id"),
        "start_time": {"$lt": end_time},
        "end_time": {"$gt": start_time},
    }
    if exclude_shift_id:
        query["_id"] = {"$ne": ObjectId(exclude_shift_id)}

    overlapping_shifts = await db.shifts.find(query).to_list(100)
    conflicts = []
    for s in overlapping_shifts:
        sid = str(s["_id"])
        assignment = await db.shift_assignments.find_one({"shift_id": sid, "user_id": user_id})
        if assignment:
            conflicts.append(serialize_doc(s))

    return {"has_conflicts": len(conflicts) > 0, "conflicts": conflicts}


# ── Recurring Shifts ──

@router.post("/shifts/recurring")
async def create_recurring_shifts(data: RecurringShiftCreate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    from dateutil.rrule import rrulestr
    from dateutil.parser import parse as dtparse

    try:
        range_start = dtparse(data.range_start)
        range_end = dtparse(data.range_end)
        rule = rrulestr(f"DTSTART:{data.range_start.replace('-', '')}T{data.start_time.replace(':', '')}00\n" +
                        f"RRULE:{data.rrule}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid RRULE: {str(e)}")

    dates = list(rule.between(range_start, range_end, inc=True))
    if len(dates) > 100:
        dates = dates[:100]

    created = []
    for dt in dates:
        day_str = dt.strftime("%Y-%m-%d")
        doc = {
            "org_id": current.get("org_id"),
            "title": data.title,
            "department_id": data.department_id,
            "position_id": data.position_id,
            "location": data.location,
            "start_time": f"{day_str}T{data.start_time}:00",
            "end_time": f"{day_str}T{data.end_time}:00",
            "required_count": data.required_count,
            "notes": data.notes,
            "is_open": data.is_open,
            "recurring_rule": data.rrule,
            "created_by": current["id"],
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        result = await db.shifts.insert_one(doc)
        doc["_id"] = result.inserted_id
        created.append(serialize_doc(doc))

    await log_audit(current.get("org_id"), current["id"], "create", "recurring_shifts", None, {"count": len(created)})
    return {"created_count": len(created), "shifts": created}


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
