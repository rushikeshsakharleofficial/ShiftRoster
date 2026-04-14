from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, log_audit, create_notification

router = APIRouter(prefix="/api", tags=["operations"])


# ══════════════════════════════════════════
# CALENDAR NOTES
# ══════════════════════════════════════════

class NoteCreate(BaseModel):
    note_date: str
    content: str
    color_hex: str = "#FDE68A"
    visibility: str = "team"
    is_pinned: bool = False


class NoteUpdate(BaseModel):
    content: Optional[str] = None
    color_hex: Optional[str] = None
    visibility: Optional[str] = None
    is_pinned: Optional[bool] = None


class ReplyCreate(BaseModel):
    content: str


@router.get("/calendar-notes")
async def list_notes(request: Request, note_date: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None):
    current = await get_current_user(request)
    query = {"org_id": current.get("org_id")}

    if note_date:
        query["note_date"] = note_date
    elif start_date and end_date:
        query["note_date"] = {"$gte": start_date, "$lte": end_date}

    # Filter by visibility
    vis_filter = [{"visibility": "everyone"}]
    if current["system_role"] in ("admin", "manager"):
        vis_filter.append({"visibility": "team"})
        vis_filter.append({"visibility": "private", "author_id": current["id"]})
    else:
        vis_filter.append({"visibility": "team", "department_id": current.get("department_id")})
        vis_filter.append({"visibility": "private", "author_id": current["id"]})

    query["$or"] = vis_filter

    notes = await db.calendar_notes.find(query).sort([("is_pinned", -1), ("created_at", -1)]).to_list(200)
    result = []
    for n in notes:
        ndata = serialize_doc(n)
        author = await db.users.find_one({"_id": ObjectId(n["author_id"])}, {"full_name": 1})
        ndata["author_name"] = author.get("full_name", "") if author else ""
        # Get replies
        replies = await db.calendar_note_replies.find({"note_id": ndata["id"]}).sort("created_at", 1).to_list(50)
        reply_list = []
        for r in replies:
            rd = serialize_doc(r)
            rauthor = await db.users.find_one({"_id": ObjectId(r["author_id"])}, {"full_name": 1})
            rd["author_name"] = rauthor.get("full_name", "") if rauthor else ""
            reply_list.append(rd)
        ndata["replies"] = reply_list
        result.append(ndata)
    return result


@router.post("/calendar-notes")
async def create_note(data: NoteCreate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] == "employee" and current.get("employee_level") == "L1":
        raise HTTPException(status_code=403, detail="L1 employees cannot add notes")

    if data.visibility not in ("private", "team", "everyone"):
        raise HTTPException(status_code=400, detail="Invalid visibility")

    doc = {
        "org_id": current.get("org_id"),
        "author_id": current["id"],
        "department_id": current.get("department_id"),
        "note_date": data.note_date,
        "content": data.content,
        "color_hex": data.color_hex,
        "visibility": data.visibility,
        "is_pinned": data.is_pinned,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.calendar_notes.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


@router.put("/calendar-notes/{note_id}")
async def update_note(note_id: str, data: NoteUpdate, request: Request):
    current = await get_current_user(request)
    note = await db.calendar_notes.find_one({"_id": ObjectId(note_id)})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if note["author_id"] != current["id"] and current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Cannot edit this note")

    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc)
    await db.calendar_notes.update_one({"_id": ObjectId(note_id)}, {"$set": update})
    updated = await db.calendar_notes.find_one({"_id": ObjectId(note_id)})
    return serialize_doc(updated)


@router.delete("/calendar-notes/{note_id}")
async def delete_note(note_id: str, request: Request):
    current = await get_current_user(request)
    note = await db.calendar_notes.find_one({"_id": ObjectId(note_id)})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if note["author_id"] != current["id"] and current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Cannot delete this note")

    await db.calendar_notes.delete_one({"_id": ObjectId(note_id)})
    await db.calendar_note_replies.delete_many({"note_id": note_id})
    return {"message": "Note deleted"}


@router.post("/calendar-notes/{note_id}/replies")
async def add_reply(note_id: str, data: ReplyCreate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] == "employee" and current.get("employee_level") == "L1":
        raise HTTPException(status_code=403, detail="L1 employees cannot reply to notes")

    note = await db.calendar_notes.find_one({"_id": ObjectId(note_id)})
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    doc = {
        "note_id": note_id,
        "author_id": current["id"],
        "content": data.content,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.calendar_note_replies.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


# ══════════════════════════════════════════
# SWAP REQUESTS
# ══════════════════════════════════════════

class SwapRequestCreate(BaseModel):
    requester_shift: str
    target_id: Optional[str] = None
    target_shift: Optional[str] = None
    notes: str = ""


class SwapReview(BaseModel):
    status: str


@router.get("/swap-requests")
async def list_swaps(request: Request):
    current = await get_current_user(request)
    if current["system_role"] in ("admin", "manager"):
        query = {}
    else:
        query = {"$or": [{"requester_id": current["id"]}, {"target_id": current["id"]}]}

    swaps = await db.swap_requests.find(query).sort("created_at", -1).to_list(100)
    result = []
    for s in swaps:
        sdata = serialize_doc(s)
        requester = await db.users.find_one({"_id": ObjectId(s["requester_id"])}, {"full_name": 1})
        sdata["requester_name"] = requester.get("full_name", "") if requester else ""
        if s.get("target_id"):
            target = await db.users.find_one({"_id": ObjectId(s["target_id"])}, {"full_name": 1})
            sdata["target_name"] = target.get("full_name", "") if target else ""
        result.append(sdata)
    return result


@router.post("/swap-requests")
async def create_swap(data: SwapRequestCreate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] == "employee" and current.get("employee_level") == "L1":
        raise HTTPException(status_code=403, detail="L1 employees cannot request swaps")

    doc = {
        "requester_id": current["id"],
        "requester_shift": data.requester_shift,
        "target_id": data.target_id,
        "target_shift": data.target_shift,
        "status": "pending",
        "notes": data.notes,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.swap_requests.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


@router.put("/swap-requests/{swap_id}/review")
async def review_swap(swap_id: str, data: SwapReview, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admin/manager can review swaps")

    if data.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Status must be approved or rejected")

    swap = await db.swap_requests.find_one({"_id": ObjectId(swap_id)})
    if not swap:
        raise HTTPException(status_code=404, detail="Swap request not found")

    await db.swap_requests.update_one(
        {"_id": ObjectId(swap_id)},
        {"$set": {"status": data.status, "reviewed_by": current["id"], "reviewed_at": datetime.now(timezone.utc)}},
    )

    if data.status == "approved" and swap.get("target_id"):
        # Perform actual swap of assignments
        await db.shift_assignments.update_many(
            {"shift_id": swap["requester_shift"], "user_id": swap["requester_id"]},
            {"$set": {"user_id": swap["target_id"]}},
        )
        if swap.get("target_shift"):
            await db.shift_assignments.update_many(
                {"shift_id": swap["target_shift"], "user_id": swap["target_id"]},
                {"$set": {"user_id": swap["requester_id"]}},
            )

    await create_notification(swap["requester_id"], f"swap_{data.status}", f"Your swap request has been {data.status}", link="/swap-requests")
    return {"message": f"Swap request {data.status}"}


# ══════════════════════════════════════════
# ATTENDANCE
# ══════════════════════════════════════════

@router.get("/attendance")
async def list_attendance(request: Request, user_id: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None):
    current = await get_current_user(request)
    query = {}

    if current["system_role"] in ("admin", "manager"):
        if user_id:
            query["user_id"] = user_id
    else:
        query["user_id"] = current["id"]

    if start_date:
        query["created_at"] = {"$gte": datetime.fromisoformat(start_date)}
    if end_date:
        query.setdefault("created_at", {})
        if isinstance(query.get("created_at"), dict):
            query["created_at"]["$lte"] = datetime.fromisoformat(end_date)

    logs = await db.attendance_logs.find(query).sort("created_at", -1).to_list(500)
    result = []
    for l in logs:
        ldata = serialize_doc(l)
        user = await db.users.find_one({"_id": ObjectId(l["user_id"])}, {"full_name": 1})
        ldata["user_name"] = user.get("full_name", "") if user else ""
        result.append(ldata)
    return result


@router.post("/attendance/clock-in")
async def clock_in(request: Request):
    current = await get_current_user(request)
    body = await request.json()

    # Check if already clocked in today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    existing = await db.attendance_logs.find_one({
        "user_id": current["id"],
        "clock_in": {"$gte": today_start},
        "clock_out": None,
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already clocked in")

    doc = {
        "user_id": current["id"],
        "shift_id": body.get("shift_id"),
        "clock_in": datetime.now(timezone.utc),
        "clock_out": None,
        "break_minutes": 0,
        "status": "present",
        "clock_in_method": body.get("method", "web"),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.attendance_logs.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


@router.post("/attendance/clock-out")
async def clock_out(request: Request):
    current = await get_current_user(request)

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    log = await db.attendance_logs.find_one({
        "user_id": current["id"],
        "clock_in": {"$gte": today_start},
        "clock_out": None,
    })
    if not log:
        raise HTTPException(status_code=400, detail="No active clock-in found")

    now = datetime.now(timezone.utc)
    await db.attendance_logs.update_one(
        {"_id": log["_id"]},
        {"$set": {"clock_out": now, "updated_at": now}},
    )

    updated = await db.attendance_logs.find_one({"_id": log["_id"]})
    return serialize_doc(updated)


# ══════════════════════════════════════════
# NOTIFICATIONS
# ══════════════════════════════════════════

@router.get("/notifications")
async def list_notifications(request: Request, unread_only: bool = False):
    current = await get_current_user(request)
    query = {"user_id": current["id"]}
    if unread_only:
        query["is_read"] = False
    notifs = await db.notifications.find(query).sort("created_at", -1).to_list(50)
    unread_count = await db.notifications.count_documents({"user_id": current["id"], "is_read": False})
    return {"notifications": serialize_list(notifs), "unread_count": unread_count}


@router.put("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, request: Request):
    current = await get_current_user(request)
    await db.notifications.update_one(
        {"_id": ObjectId(notif_id), "user_id": current["id"]},
        {"$set": {"is_read": True}},
    )
    return {"message": "Marked as read"}


@router.put("/notifications/read-all")
async def mark_all_read(request: Request):
    current = await get_current_user(request)
    await db.notifications.update_many(
        {"user_id": current["id"], "is_read": False},
        {"$set": {"is_read": True}},
    )
    return {"message": "All marked as read"}


# ══════════════════════════════════════════
# AUDIT LOGS
# ══════════════════════════════════════════

@router.get("/audit-logs")
async def list_audit_logs(request: Request, entity: Optional[str] = None, skip: int = 0, limit: int = 50):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view audit logs")

    query = {"org_id": current.get("org_id")}
    if entity:
        query["entity"] = entity

    logs = await db.audit_logs.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.audit_logs.count_documents(query)

    result = []
    for l in logs:
        ldata = serialize_doc(l)
        actor = await db.users.find_one({"_id": ObjectId(l["actor_id"])}, {"full_name": 1})
        ldata["actor_name"] = actor.get("full_name", "") if actor else ""
        result.append(ldata)
    return {"logs": result, "total": total}


# ══════════════════════════════════════════
# REPORTS
# ══════════════════════════════════════════

@router.get("/reports/overview")
async def report_overview(request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    org_id = current.get("org_id")
    total_employees = await db.users.count_documents({"org_id": org_id, "system_role": "employee"})
    total_managers = await db.users.count_documents({"org_id": org_id, "system_role": "manager"})
    active_employees = await db.users.count_documents({"org_id": org_id, "status": "active"})
    pending_leaves = await db.leave_requests.count_documents({"org_id": org_id, "status": "pending"})
    pending_swaps = await db.swap_requests.count_documents({"status": "pending"})
    total_shifts = await db.shifts.count_documents({"org_id": org_id})
    total_departments = await db.departments.count_documents({"org_id": org_id})

    # Today's attendance
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    clocked_in_today = await db.attendance_logs.count_documents({"clock_in": {"$gte": today_start}})

    return {
        "total_employees": total_employees,
        "total_managers": total_managers,
        "active_employees": active_employees,
        "pending_leaves": pending_leaves,
        "pending_swaps": pending_swaps,
        "total_shifts": total_shifts,
        "total_departments": total_departments,
        "clocked_in_today": clocked_in_today,
    }


@router.get("/reports/attendance")
async def report_attendance(request: Request, start_date: Optional[str] = None, end_date: Optional[str] = None):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    query = {}
    if start_date:
        query["clock_in"] = {"$gte": datetime.fromisoformat(start_date)}
    if end_date:
        query.setdefault("clock_in", {})
        if isinstance(query.get("clock_in"), dict):
            query["clock_in"]["$lte"] = datetime.fromisoformat(end_date)

    logs = await db.attendance_logs.find(query).sort("clock_in", -1).to_list(1000)
    return serialize_list(logs)


# ══════════════════════════════════════════
# ORGANIZATION SETTINGS
# ══════════════════════════════════════════

@router.get("/organization")
async def get_organization(request: Request):
    current = await get_current_user(request)
    org = await db.organizations.find_one({"_id": ObjectId(current.get("org_id"))})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return serialize_doc(org)


@router.put("/organization")
async def update_organization(request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can update organization settings")

    body = await request.json()
    allowed = ["name", "timezone", "locale", "currency", "work_week_start", "overtime_daily_threshold", "overtime_weekly_threshold"]
    update = {k: v for k, v in body.items() if k in allowed and v is not None}
    update["updated_at"] = datetime.now(timezone.utc)

    await db.organizations.update_one({"_id": ObjectId(current.get("org_id"))}, {"$set": update})
    org = await db.organizations.find_one({"_id": ObjectId(current.get("org_id"))})
    return serialize_doc(org)
