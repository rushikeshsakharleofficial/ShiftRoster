from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, log_audit, create_notification
import csv
import io

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

    # Fetch all replies for all notes in one query
    note_ids = [str(n["_id"]) for n in notes]
    all_replies = await db.calendar_note_replies.find({"note_id": {"$in": note_ids}}).sort("created_at", 1).to_list(None)

    # Collect all unique author IDs from notes and replies
    author_ids = set()
    for n in notes:
        if n.get("author_id"):
            author_ids.add(ObjectId(n["author_id"]))
    for r in all_replies:
        if r.get("author_id"):
            author_ids.add(ObjectId(r["author_id"]))

    # Single batch fetch for all authors
    authors = {u["_id"]: u async for u in db.users.find({"_id": {"$in": list(author_ids)}}, {"full_name": 1})}

    # Group replies by note_id
    replies_by_note = {}
    for r in all_replies:
        replies_by_note.setdefault(r["note_id"], []).append(r)

    result = []
    for n in notes:
        ndata = serialize_doc(n)
        author = authors.get(ObjectId(n["author_id"])) if n.get("author_id") else None
        ndata["author_name"] = author.get("full_name", "") if author else ""
        # Attach replies from pre-fetched dict
        reply_list = []
        for r in replies_by_note.get(ndata["id"], []):
            rd = serialize_doc(r)
            rauthor = authors.get(ObjectId(r["author_id"])) if r.get("author_id") else None
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
        "org_id": current.get("org_id"),
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

    # Notify the target user
    if data.target_id:
        await create_notification(
            data.target_id, "swap_requested",
            f"{current.get('full_name', 'A colleague')} has requested a shift swap with you",
            link="/swap-requests"
        )

    return serialize_doc(doc)


@router.put("/swap-requests/{swap_id}/review")
async def review_swap(swap_id: str, data: SwapReview, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admin/manager can review swaps")

    if data.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Status must be approved or rejected")

    swap = await db.swap_requests.find_one({"_id": ObjectId(swap_id), "org_id": current.get("org_id")})
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

    org = await db.organizations.find_one({"_id": ObjectId(current.get("org_id"))})
    if not org or not org.get("attendance_enabled", False):
        raise HTTPException(status_code=403, detail="Attendance tracking is not enabled for this organization")

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

    org = await db.organizations.find_one({"_id": ObjectId(current.get("org_id"))})
    if not org or not org.get("attendance_enabled", False):
        raise HTTPException(status_code=403, detail="Attendance tracking is not enabled for this organization")

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


class ExtendShiftRequest(BaseModel):
    minutes: int


@router.post("/attendance/extend-shift")
async def extend_shift(data: ExtendShiftRequest, request: Request):
    """Extend the current active shift by N minutes. Updates the shift end_time and records extended_minutes."""
    current = await get_current_user(request)

    org = await db.organizations.find_one({"_id": ObjectId(current.get("org_id"))})
    if not org or not org.get("attendance_enabled", False):
        raise HTTPException(status_code=403, detail="Attendance tracking is not enabled")

    if data.minutes <= 0 or data.minutes > 480:
        raise HTTPException(status_code=400, detail="Extension must be between 1 and 480 minutes")

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    log = await db.attendance_logs.find_one({
        "user_id": current["id"],
        "clock_in": {"$gte": today_start},
        "clock_out": None,
    })
    if not log:
        raise HTTPException(status_code=400, detail="No active clock-in found")

    now = datetime.now(timezone.utc)
    new_extended = (log.get("extended_minutes") or 0) + data.minutes
    await db.attendance_logs.update_one(
        {"_id": log["_id"]},
        {"$set": {"extended_minutes": new_extended, "updated_at": now}},
    )

    # Also extend the associated shift end_time if shift_id is present
    if log.get("shift_id"):
        try:
            shift = await db.shifts.find_one({"_id": ObjectId(log["shift_id"])})
            if shift and shift.get("end_time"):
                from datetime import datetime as dt
                end_dt = shift["end_time"] if isinstance(shift["end_time"], datetime) else dt.fromisoformat(shift["end_time"].replace("Z", "+00:00"))
                new_end = end_dt + timedelta(minutes=data.minutes)
                await db.shifts.update_one(
                    {"_id": ObjectId(log["shift_id"])},
                    {"$set": {"end_time": new_end, "updated_at": now}},
                )
        except Exception:
            pass

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
async def list_audit_logs(
    request: Request,
    entity: Optional[str] = None,
    action: Optional[str] = None,
    actor_id: Optional[str] = None,
    actor_name: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admin or manager can view audit logs")

    query = {"org_id": current.get("org_id")}
    if entity:
        query["entity"] = entity
    if action:
        query["action"] = action
    if actor_id:
        query["actor_id"] = actor_id
    if actor_name:
        # Find users whose names match, then filter logs by their IDs
        matched_users = await db.users.find(
            {"org_id": current.get("org_id"), "full_name": {"$regex": actor_name, "$options": "i"}},
            {"_id": 1}
        ).to_list(50)
        matched_ids = [str(u["_id"]) for u in matched_users]
        if matched_ids:
            query["actor_id"] = {"$in": matched_ids}
        else:
            return {"logs": [], "total": 0}
    if start_date:
        query.setdefault("created_at", {})
        query["created_at"]["$gte"] = datetime.fromisoformat(start_date)
    if end_date:
        query.setdefault("created_at", {})
        query["created_at"]["$lte"] = datetime.fromisoformat(end_date + "T23:59:59")

    logs = await db.audit_logs.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.audit_logs.count_documents(query)

    result = []
    for l in logs:
        ldata = serialize_doc(l)
        actor_oid = l.get("actor_id")
        if actor_oid:
            try:
                actor = await db.users.find_one({"_id": ObjectId(actor_oid)}, {"full_name": 1})
                ldata["actor_name"] = actor.get("full_name", "") if actor else ""
            except Exception:
                ldata["actor_name"] = ""
        else:
            ldata["actor_name"] = ""
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
    today_str = datetime.now().strftime("%Y-%m-%d")
    tomorrow_str = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)

    total_employees = await db.users.count_documents({"org_id": org_id, "system_role": "employee"})
    total_managers = await db.users.count_documents({"org_id": org_id, "system_role": "manager"})
    active_users = await db.users.count_documents({"org_id": org_id, "status": "active"})
    pending_leaves = await db.leave_requests.count_documents({"org_id": org_id, "status": "pending"})
    pending_swaps = await db.swap_requests.count_documents({"org_id": org_id, "status": "pending"})
    total_shifts = await db.shifts.count_documents({"org_id": org_id})
    total_departments = await db.departments.count_documents({"org_id": org_id})
    new_hires_this_month = await db.users.count_documents({"org_id": org_id, "created_at": {"$gte": month_start}})

    # Shifts scheduled for today
    shifts_today = await db.shifts.count_documents({
        "org_id": org_id,
        "start_time": {"$gte": today_str, "$lt": tomorrow_str},
    })

    # Employees on approved leave today
    on_leave_today = await db.leave_requests.count_documents({
        "org_id": org_id,
        "status": "approved",
        "from_date": {"$lte": today_str},
        "to_date": {"$gte": today_str},
    })

    # Clocked in today — unique users in this org (attendance_logs has no org_id)
    org_user_ids = await db.users.distinct("_id", {"org_id": org_id})
    org_user_id_strs = [str(uid) for uid in org_user_ids]
    pipeline = [
        {"$match": {"user_id": {"$in": org_user_id_strs}, "clock_in": {"$gte": today_start}}},
        {"$group": {"_id": "$user_id"}},
        {"$count": "total"},
    ]
    result = await db.attendance_logs.aggregate(pipeline).to_list(1)
    clocked_in_today = result[0]["total"] if result else 0
    absent_today = max(0, active_users - clocked_in_today)

    return {
        "total_employees": total_employees,
        "total_managers": total_managers,
        "active_employees": active_users,
        "pending_leaves": pending_leaves,
        "pending_swaps": pending_swaps,
        "total_shifts": total_shifts,
        "total_departments": total_departments,
        "clocked_in_today": clocked_in_today,
        "shifts_today": shifts_today,
        "on_leave_today": on_leave_today,
        "absent_today": absent_today,
        "new_hires_this_month": new_hires_this_month,
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
    if org.get("ldap_settings"):
        from ldap_service import public_ldap_settings
        org["ldap_settings"] = public_ldap_settings(org.get("ldap_settings"))
    if org.get("slack_oidc") is not None:
        from slack_service import public_slack_settings
        org["slack_oidc"] = public_slack_settings(org.get("slack_oidc"))
    if org.get("google_oidc") is not None:
        from google_service import public_google_settings
        org["google_oidc"] = public_google_settings(org.get("google_oidc"))
    return serialize_doc(org)


@router.put("/organization")
async def update_organization(request: Request):
    current = await get_current_user(request)
    is_admin = current["system_role"] == "admin"
    is_manager = current["system_role"] == "manager"
    if not (is_admin or is_manager):
        raise HTTPException(status_code=403, detail="Only admin or manager can update organization settings")

    body = await request.json()
    if is_admin:
        allowed = ["name", "brand_name", "logo_url", "timezone", "locale", "currency",
                   "work_week_start", "overtime_daily_threshold", "overtime_weekly_threshold",
                   "attendance_enabled",
                   "smtp_host", "smtp_port", "smtp_username", "smtp_password",
                   "smtp_from_email", "smtp_from_name", "smtp_use_tls", "smtp_enabled",
                   "chat_features", "purge_policy_days", "password_policy", "slack_oidc", "google_oidc",
                   "file_manager"]
    else:
        allowed = ["attendance_enabled"]

    update = {k: v for k, v in body.items() if k in allowed and v is not None}

    # Validate password_policy structure if being updated
    if "password_policy" in update and is_admin:
        pp = update["password_policy"]
        if not isinstance(pp, dict):
            raise HTTPException(status_code=400, detail="password_policy must be an object")
        valid_keys = {"min_length", "max_length", "require_uppercase", "require_lowercase",
                      "require_digit", "require_special"}
        cleaned = {k: v for k, v in pp.items() if k in valid_keys}
        # Sanity bounds
        if "min_length" in cleaned:
            ml = int(cleaned["min_length"])
            if ml < 6 or ml > 128:
                raise HTTPException(status_code=400, detail="min_length must be between 6 and 128")
            cleaned["min_length"] = ml
        if "max_length" in cleaned:
            xl = int(cleaned["max_length"])
            if xl < 8 or xl > 256:
                raise HTTPException(status_code=400, detail="max_length must be between 8 and 256")
            cleaned["max_length"] = xl
        for bk in ("require_uppercase", "require_lowercase", "require_digit", "require_special"):
            if bk in cleaned:
                cleaned[bk] = bool(cleaned[bk])
        update["password_policy"] = cleaned
    if "attendance_enabled" in body and body["attendance_enabled"] is False:
        update["attendance_enabled"] = False
    
    # Explicitly handle chat_features if present
    if "chat_features" in body and is_admin:
        update["chat_features"] = body["chat_features"]

    # Validate file_manager settings structure if being updated
    if "file_manager" in body and is_admin:
        fm = body["file_manager"]
        if not isinstance(fm, dict):
            raise HTTPException(status_code=400, detail="file_manager must be an object")
        cleaned_fm = {}
        if "max_file_mb" in fm:
            try:
                mb = int(fm["max_file_mb"])
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="max_file_mb must be an integer")
            if mb < 1 or mb > 10240:
                raise HTTPException(status_code=400, detail="max_file_mb must be 1-10240")
            cleaned_fm["max_file_mb"] = mb
        if "shared_enabled" in fm:
            if not isinstance(fm["shared_enabled"], bool):
                raise HTTPException(status_code=400, detail="shared_enabled must be bool")
            cleaned_fm["shared_enabled"] = fm["shared_enabled"]
        update["file_manager"] = cleaned_fm

    if "smtp_password" in body:
        update["smtp_password"] = body["smtp_password"]

    if "slack_oidc" in body and is_admin:
        from slack_service import normalize_slack_settings
        existing_org = await db.organizations.find_one({"_id": ObjectId(current.get("org_id"))})
        update["slack_oidc"] = normalize_slack_settings(
            body["slack_oidc"],
            existing=(existing_org or {}).get("slack_oidc"),
        )
        # Mutual exclusion: enabling Slack SSO disables LDAP and Google
        if update["slack_oidc"].get("enabled"):
            update["ldap_settings.enabled"] = False
            update["google_oidc.enabled"] = False

    if "google_oidc" in body and is_admin:
        from google_service import normalize_google_settings
        existing_org = await db.organizations.find_one({"_id": ObjectId(current.get("org_id"))})
        update["google_oidc"] = normalize_google_settings(
            body["google_oidc"],
            existing=(existing_org or {}).get("google_oidc"),
        )
        # Mutual exclusion: enabling Google SSO disables LDAP and Slack
        if update["google_oidc"].get("enabled"):
            update["ldap_settings.enabled"] = False
            update["slack_oidc.enabled"] = False

    update["updated_at"] = datetime.now(timezone.utc)

    await db.organizations.update_one({"_id": ObjectId(current.get("org_id"))}, {"$set": update})
    org = await db.organizations.find_one({"_id": ObjectId(current.get("org_id"))})
    return serialize_doc(org)


@router.get("/organization/password-policy")
async def get_org_password_policy(request: Request):
    """Return the current org's password policy (for setup/reset pages to show requirements)."""
    from auth_utils import get_password_policy
    current = await get_current_user(request)
    return await get_password_policy(db, current.get("org_id"))


@router.get("/organization/password-policy/public")
async def get_public_password_policy(org_id: str = ""):
    """Public password policy endpoint for unauthenticated setup-password flow."""
    from auth_utils import get_password_policy, DEFAULT_PASSWORD_POLICY
    if not org_id:
        return dict(DEFAULT_PASSWORD_POLICY)
    return await get_password_policy(db, org_id)


@router.post("/organization/test-email")
async def test_smtp_email(request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    body = await request.json()
    recipient = body.get("recipient_email", current.get("email", ""))
    if not recipient:
        raise HTTPException(status_code=400, detail="recipient_email required")

    org = await db.organizations.find_one({"_id": ObjectId(current.get("org_id"))})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    smtp_cfg = {
        "host": org.get("smtp_host", ""),
        "port": int(org.get("smtp_port", 587)),
        "username": org.get("smtp_username", ""),
        "password": org.get("smtp_password", ""),
        "from_email": org.get("smtp_from_email", ""),
        "from_name": org.get("smtp_from_name", org.get("name", "ShiftRoster")),
        "use_tls": org.get("smtp_use_tls", True),
    }
    if not smtp_cfg["host"] or not smtp_cfg["from_email"]:
        raise HTTPException(status_code=400, detail="SMTP not configured. Set host and from_email first.")

    import smtplib
    import asyncio
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    def _send():
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Test Email from {smtp_cfg['from_name']}"
        msg["From"] = f"{smtp_cfg['from_name']} <{smtp_cfg['from_email']}>"
        msg["To"] = recipient
        body_html = f"<p>This is a test email from <strong>{smtp_cfg['from_name']}</strong> via ShiftRoster SMTP settings.</p><p>If you received this, your SMTP configuration is working correctly.</p>"
        msg.attach(MIMEText(body_html, "html"))

        if smtp_cfg["use_tls"]:
            server = smtplib.SMTP(smtp_cfg["host"], smtp_cfg["port"], timeout=10)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(smtp_cfg["host"], smtp_cfg["port"], timeout=10)

        if smtp_cfg["username"] and smtp_cfg["password"]:
            server.login(smtp_cfg["username"], smtp_cfg["password"])
        server.sendmail(smtp_cfg["from_email"], [recipient], msg.as_string())
        server.quit()

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send)
        return {"success": True, "message": f"Test email sent to {recipient}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"SMTP error: {str(e)}")


# ══════════════════════════════════════════
# CSV EXPORT
# ══════════════════════════════════════════

@router.get("/reports/export/csv")
async def export_csv(request: Request, report_type: str = "attendance"):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    output = io.StringIO()
    writer = csv.writer(output)

    if report_type == "attendance":
        writer.writerow(["Employee", "Clock In", "Clock Out", "Status", "Method", "Break (min)"])
        logs = await db.attendance_logs.find().sort("clock_in", -1).to_list(1000)
        for l in logs:
            user = await db.users.find_one({"_id": ObjectId(l["user_id"])}, {"full_name": 1})
            name = user.get("full_name", "") if user else ""
            writer.writerow([
                name,
                l.get("clock_in", "").isoformat() if isinstance(l.get("clock_in"), datetime) else str(l.get("clock_in", "")),
                l.get("clock_out", "").isoformat() if isinstance(l.get("clock_out"), datetime) else str(l.get("clock_out", "")),
                l.get("status", ""),
                l.get("clock_in_method", ""),
                l.get("break_minutes", 0),
            ])
    elif report_type == "employees":
        writer.writerow(["Name", "Email", "Role", "Level", "Department", "Status", "Employment Type"])
        users = await db.users.find({"org_id": current.get("org_id")}, {"password_hash": 0}).to_list(1000)
        for u in users:
            dept = None
            if u.get("department_id"):
                dept = await db.departments.find_one({"_id": ObjectId(u["department_id"])}, {"name": 1})
            writer.writerow([
                u.get("full_name", ""),
                u.get("email", ""),
                u.get("system_role", ""),
                u.get("employee_level", ""),
                dept.get("name", "") if dept else "",
                u.get("status", ""),
                u.get("employment_type", ""),
            ])
    elif report_type == "shifts":
        writer.writerow(["Title", "Department", "Start", "End", "Location", "Required", "Assigned Count"])
        shifts = await db.shifts.find({"org_id": current.get("org_id")}).sort("start_time", -1).to_list(1000)
        for s in shifts:
            dept = None
            if s.get("department_id"):
                dept = await db.departments.find_one({"_id": ObjectId(s["department_id"])}, {"name": 1})
            assigned = await db.shift_assignments.count_documents({"shift_id": str(s["_id"])})
            writer.writerow([
                s.get("title", ""),
                dept.get("name", "") if dept else "",
                str(s.get("start_time", "")),
                str(s.get("end_time", "")),
                s.get("location", ""),
                s.get("required_count", 1),
                assigned,
            ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={report_type}_report.csv"},
    )


# ══════════════════════════════════════════
# ATTENDANCE CHART DATA
# ══════════════════════════════════════════

@router.get("/reports/attendance-chart")
async def attendance_chart_data(request: Request, days: int = 14):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    chart_data = []
    now = datetime.now(timezone.utc)
    for i in range(days - 1, -1, -1):
        day = now - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = await db.attendance_logs.count_documents({"clock_in": {"$gte": day_start, "$lt": day_end}})
        late = await db.attendance_logs.count_documents({"clock_in": {"$gte": day_start, "$lt": day_end}, "status": "late"})
        chart_data.append({
            "date": day_start.strftime("%Y-%m-%d"),
            "label": day_start.strftime("%b %d"),
            "present": count,
            "late": late,
        })
    return chart_data


@router.get("/reports/shift-coverage")
async def shift_coverage_data(request: Request, days: int = 7):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    coverage = []
    now = datetime.now(timezone.utc)
    for i in range(days - 1, -1, -1):
        day = now - timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        total = await db.shifts.count_documents({
            "org_id": current.get("org_id"),
            "start_time": {"$gte": f"{day_str}T00:00:00", "$lt": f"{day_str}T23:59:59"},
        })
        filled = 0
        shifts = await db.shifts.find({
            "org_id": current.get("org_id"),
            "start_time": {"$gte": f"{day_str}T00:00:00", "$lt": f"{day_str}T23:59:59"},
        }).to_list(100)
        for s in shifts:
            assigned = await db.shift_assignments.count_documents({"shift_id": str(s["_id"])})
            if assigned >= s.get("required_count", 1):
                filled += 1
        coverage.append({
            "date": day_str,
            "label": day.strftime("%b %d"),
            "total_shifts": total,
            "filled_shifts": filled,
            "unfilled": total - filled,
        })
    return coverage


@router.get("/reports/department-breakdown")
async def department_breakdown(request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    depts = await db.departments.find({"org_id": current.get("org_id")}).to_list(50)
    result = []
    for d in depts:
        did = str(d["_id"])
        emp_count = await db.users.count_documents({"org_id": current.get("org_id"), "department_id": did, "system_role": "employee"})
        shift_count = await db.shifts.count_documents({"org_id": current.get("org_id"), "department_id": did})
        result.append({
            "name": d.get("name", ""),
            "color": d.get("color_hex", "#6366F1"),
            "employees": emp_count,
            "shifts": shift_count,
        })
    return result


# ══════════════════════════════════════════
# MANAGER NOMINATIONS
# ══════════════════════════════════════════

class NominationCreate(BaseModel):
    nominee_id: str
    group_id: str
    reason: str = ""


class NominationReview(BaseModel):
    status: str


@router.get("/manager-nominations")
async def list_nominations(request: Request):
    current = await get_current_user(request)
    query = {"org_id": current.get("org_id")}
    if current["system_role"] == "manager":
        query["nominated_by"] = current["id"]

    noms = await db.manager_nominations.find(query).sort("created_at", -1).to_list(100)
    result = []
    for n in noms:
        nd = serialize_doc(n)
        nominee = await db.users.find_one({"_id": ObjectId(n["nominee_id"])}, {"full_name": 1, "email": 1})
        nd["nominee_name"] = nominee.get("full_name", "") if nominee else ""
        nd["nominee_email"] = nominee.get("email", "") if nominee else ""
        nominator = await db.users.find_one({"_id": ObjectId(n["nominated_by"])}, {"full_name": 1})
        nd["nominator_name"] = nominator.get("full_name", "") if nominator else ""
        group = await db.manager_groups.find_one({"_id": ObjectId(n["group_id"])})
        nd["group_name"] = group.get("name", "") if group else ""
        result.append(nd)
    return result


@router.post("/manager-nominations")
async def create_nomination(data: NominationCreate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admin/manager can nominate")

    nominee = await db.users.find_one({"_id": ObjectId(data.nominee_id)})
    if not nominee:
        raise HTTPException(status_code=404, detail="Nominee not found")

    existing = await db.manager_nominations.find_one({
        "nominee_id": data.nominee_id, "group_id": data.group_id, "status": "pending"
    })
    if existing:
        raise HTTPException(status_code=400, detail="Pending nomination already exists")

    doc = {
        "org_id": current.get("org_id"),
        "nominee_id": data.nominee_id,
        "group_id": data.group_id,
        "nominated_by": current["id"],
        "status": "pending",
        "reason": data.reason,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.manager_nominations.insert_one(doc)
    doc["_id"] = result.inserted_id

    await create_notification(
        data.nominee_id, "nomination",
        f"You have been nominated as a manager",
        link="/manager-groups",
    )
    await log_audit(current.get("org_id"), current["id"], "create", "manager_nomination", str(result.inserted_id))
    return serialize_doc(doc)


@router.put("/manager-nominations/{nom_id}/review")
async def review_nomination(nom_id: str, data: NominationReview, request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can approve nominations")

    if data.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Status must be approved or rejected")

    nom = await db.manager_nominations.find_one({"_id": ObjectId(nom_id)})
    if not nom:
        raise HTTPException(status_code=404, detail="Nomination not found")

    await db.manager_nominations.update_one(
        {"_id": ObjectId(nom_id)},
        {"$set": {"status": data.status, "reviewed_by": current["id"], "reviewed_at": datetime.now(timezone.utc)}},
    )

    if data.status == "approved":
        # Promote user to manager and add to group
        await db.users.update_one(
            {"_id": ObjectId(nom["nominee_id"])},
            {"$set": {"system_role": "manager", "employee_level": None, "updated_at": datetime.now(timezone.utc)}},
        )
        existing_member = await db.manager_group_members.find_one({"group_id": nom["group_id"], "user_id": nom["nominee_id"]})
        if not existing_member:
            await db.manager_group_members.insert_one({
                "group_id": nom["group_id"],
                "user_id": nom["nominee_id"],
                "added_by": current["id"],
                "added_at": datetime.now(timezone.utc),
            })

    await create_notification(
        nom["nominee_id"], f"nomination_{data.status}",
        f"Your manager nomination has been {data.status}",
        link="/manager-groups",
    )
    await log_audit(current.get("org_id"), current["id"], data.status, "manager_nomination", nom_id)
    return {"message": f"Nomination {data.status}"}
