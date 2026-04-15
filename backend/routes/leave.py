from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, log_audit, create_notification, get_manager_dept_ids

router = APIRouter(prefix="/api", tags=["leave"])


class AvailabilityCreate(BaseModel):
    day_of_week: int
    start_time: str
    end_time: str


class AvailabilityBlockCreate(BaseModel):
    from_date: str
    to_date: str
    reason: str = ""


class LeaveRequestCreate(BaseModel):
    leave_type: str
    from_date: str
    to_date: str
    days_count: float
    notes: str = ""


class LeaveReview(BaseModel):
    status: str
    reason: str = ""


# ── Availability ──

@router.get("/availability")
async def list_availability(request: Request, user_id: Optional[str] = None):
    current = await get_current_user(request)
    uid = user_id or current["id"]
    avail = await db.availability.find({"user_id": uid}).to_list(10)
    return serialize_list(avail)


@router.post("/availability")
async def set_availability(data: AvailabilityCreate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] == "employee" and current.get("employee_level") == "L1":
        raise HTTPException(status_code=403, detail="L1 employees cannot set availability")

    await db.availability.update_one(
        {"user_id": current["id"], "day_of_week": data.day_of_week},
        {"$set": {
            "user_id": current["id"],
            "day_of_week": data.day_of_week,
            "start_time": data.start_time,
            "end_time": data.end_time,
        }},
        upsert=True,
    )
    return {"message": "Availability set"}


@router.delete("/availability/{avail_id}")
async def delete_availability(avail_id: str, request: Request):
    current = await get_current_user(request)
    await db.availability.delete_one({"_id": ObjectId(avail_id), "user_id": current["id"]})
    return {"message": "Availability removed"}


# ── Availability Blocks ──

@router.get("/availability-blocks")
async def list_blocks(request: Request, user_id: Optional[str] = None):
    current = await get_current_user(request)
    uid = user_id or current["id"]
    blocks = await db.availability_blocks.find({"user_id": uid}).to_list(50)
    return serialize_list(blocks)


@router.post("/availability-blocks")
async def create_block(data: AvailabilityBlockCreate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] == "employee" and current.get("employee_level") == "L1":
        raise HTTPException(status_code=403, detail="L1 employees cannot block dates")

    doc = {
        "user_id": current["id"],
        "from_date": data.from_date,
        "to_date": data.to_date,
        "reason": data.reason,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.availability_blocks.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)


# ── Leave Requests ──

@router.get("/leave-requests")
async def list_leave_requests(request: Request, status: Optional[str] = None, user_id: Optional[str] = None):
    current = await get_current_user(request)
    query = {}

    if current["system_role"] == "admin":
        query["org_id"] = current.get("org_id")
        if user_id:
            query["user_id"] = user_id
    elif current["system_role"] == "manager":
        query["org_id"] = current.get("org_id")
        # Scope to employees in manager's departments
        mgr_depts = await get_manager_dept_ids(current["id"], db)
        dept_user_ids = []
        if mgr_depts:
            dept_users = await db.users.find(
                {"org_id": current.get("org_id"), "department_id": {"$in": mgr_depts}},
                {"_id": 1}
            ).to_list(500)
            dept_user_ids = [str(u["_id"]) for u in dept_users]
        if user_id and user_id in dept_user_ids:
            query["user_id"] = user_id
        else:
            query["user_id"] = {"$in": dept_user_ids} if dept_user_ids else "__none__"
    else:
        query["user_id"] = current["id"]

    if status:
        query["status"] = status

    leaves = await db.leave_requests.find(query).sort("created_at", -1).to_list(200)
    result = []
    for l in leaves:
        ldata = serialize_doc(l)
        user = await db.users.find_one({"_id": ObjectId(l["user_id"])}, {"full_name": 1, "email": 1})
        if user:
            ldata["user_name"] = user.get("full_name", "")
            ldata["user_email"] = user.get("email", "")
        result.append(ldata)
    return result


@router.post("/leave-requests")
async def create_leave_request(data: LeaveRequestCreate, request: Request):
    current = await get_current_user(request)
    if current["system_role"] == "employee" and current.get("employee_level") == "L1":
        raise HTTPException(status_code=403, detail="L1 employees cannot submit leave requests")

    valid_types = ["annual", "sick", "unpaid", "comp_off", "maternity", "paternity"]
    if data.leave_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid leave type. Must be one of: {valid_types}")

    doc = {
        "org_id": current.get("org_id"),
        "user_id": current["id"],
        "leave_type": data.leave_type,
        "from_date": data.from_date,
        "to_date": data.to_date,
        "days_count": data.days_count,
        "notes": data.notes,
        "status": "pending",
        "reviewed_by": None,
        "reviewed_at": None,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.leave_requests.insert_one(doc)
    doc["_id"] = result.inserted_id

    # Notify managers/admins in the same org
    managers = await db.users.find(
        {"org_id": current.get("org_id"), "system_role": {"$in": ["admin", "manager"]}, "_id": {"$ne": ObjectId(current["id"])}},
        {"_id": 1}
    ).to_list(100)
    for m in managers:
        await create_notification(
            str(m["_id"]), "leave_requested",
            f"{current.get('full_name', 'An employee')} submitted a leave request",
            link="/leave"
        )

    return serialize_doc(doc)


@router.put("/leave-requests/{leave_id}/review")
async def review_leave(leave_id: str, data: LeaveReview, request: Request):
    current = await get_current_user(request)
    if current["system_role"] not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admin/manager can review leave")

    if data.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Status must be approved or rejected")

    leave = await db.leave_requests.find_one({"_id": ObjectId(leave_id)})
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")

    await db.leave_requests.update_one(
        {"_id": ObjectId(leave_id)},
        {"$set": {
            "status": data.status,
            "reviewed_by": current["id"],
            "reviewed_at": datetime.now(timezone.utc),
        }},
    )

    # Notify the requester
    await create_notification(
        leave["user_id"],
        f"leave_{data.status}",
        f"Your leave request has been {data.status}",
        link="/leave",
    )

    await log_audit(current.get("org_id"), current["id"], data.status, "leave_request", leave_id)
    return {"message": f"Leave request {data.status}"}


# ── Leave Balances ──

@router.get("/leave-balances")
async def list_leave_balances(request: Request, user_id: Optional[str] = None, year: Optional[int] = None):
    current = await get_current_user(request)
    uid = user_id or current["id"]
    query = {"user_id": uid}
    if year:
        query["year"] = year
    balances = await db.leave_balances.find(query).to_list(20)
    return serialize_list(balances)


# ── Public Holidays ──

@router.get("/public-holidays")
async def list_holidays(request: Request):
    current = await get_current_user(request)
    holidays = await db.public_holidays.find({"org_id": current.get("org_id")}).to_list(50)
    return serialize_list(holidays)


@router.post("/public-holidays")
async def create_holiday(request: Request):
    current = await get_current_user(request)
    if current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can add holidays")

    body = await request.json()
    doc = {
        "org_id": current.get("org_id"),
        "name": body.get("name", ""),
        "date": body.get("date", ""),
    }
    result = await db.public_holidays.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_doc(doc)
