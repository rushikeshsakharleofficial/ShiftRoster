from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, log_audit, create_notification

router = APIRouter(prefix="/api/tasks", tags=["tasks"], redirect_slashes=False)


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    priority: str = "medium"
    due_date: Optional[str] = None
    assigned_to: str
    handover_id: Optional[str] = None
    shift_id: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None


class TaskTransfer(BaseModel):
    new_owner_id: str
    reason: Optional[str] = None


class NoteCreate(BaseModel):
    text: str


def _serialize_subdoc(item: dict) -> dict:
    """Serialize a sub-document (ObjectId → str, datetime → ISO string)."""
    out = {}
    for k, v in item.items():
        if isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


@router.post("/", response_model=dict)
async def create_task(req: TaskCreate, user=Depends(get_current_user)):
    if user.get("system_role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admin or manager can assign tasks")

    new_task = {
        "org_id": user.get("org_id"),
        "title": req.title,
        "description": req.description,
        "priority": req.priority,
        "due_date": datetime.fromisoformat(req.due_date.replace("Z", "+00:00")) if req.due_date else None,
        "assigned_to": ObjectId(req.assigned_to),
        "handover_id": ObjectId(req.handover_id) if req.handover_id else None,
        "shift_id": ObjectId(req.shift_id) if req.shift_id else None,
        "created_by": ObjectId(user["id"]),
        "created_at": datetime.now(timezone.utc),
        "status": "pending",
        "completed_at": None,
        "completed_by": None,
        "transfer_reason": None,
        "notes": [],
        "reminders_sent": [],
        "audit_log": [{
            "action": "created",
            "user_id": ObjectId(user["id"]),
            "timestamp": datetime.now(timezone.utc),
            "details": f"Task created by {user.get('full_name', 'User')}"
        }]
    }
    result = await db.tasks.insert_one(new_task)
    new_task["_id"] = result.inserted_id

    await create_notification(
        req.assigned_to,
        "task_assigned",
        "New Task Assigned",
        f"You have been assigned a new task: {req.title}",
        f"/tasks",
    )

    await log_audit(None, user["id"], "create", "task", str(result.inserted_id))
    return serialize_doc(new_task)


@router.get("", response_model=List[dict])
@router.get("/", response_model=List[dict])
async def list_tasks(
    assigned_to: Optional[str] = None,
    status: Optional[str] = None,
    handover_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    query = {"org_id": user.get("org_id")}
    if assigned_to:
        query["assigned_to"] = ObjectId(assigned_to)
    if status:
        query["status"] = status
    if handover_id:
        query["handover_id"] = ObjectId(handover_id)

    # Employees only see tasks assigned to or created by them
    if user.get("system_role") == "employee":
        me = ObjectId(user["id"])
        query["$or"] = [{"assigned_to": me}, {"created_by": me}]

    docs = await db.tasks.find(query).sort("created_at", -1).to_list(200)
    return serialize_list(docs)


@router.get("/pending-count")
async def get_pending_tasks_count(user=Depends(get_current_user)):
    count = await db.tasks.count_documents({
        "org_id": user.get("org_id"),
        "assigned_to": ObjectId(user["id"]),
        "status": "pending",
    })
    return {"count": count}


@router.get("/{task_id}")
async def get_task(task_id: str, user=Depends(get_current_user)):
    try:
        t_id = ObjectId(task_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task ID")

    task = await db.tasks.find_one({"_id": t_id, "org_id": user.get("org_id")})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Employees may only view tasks they're assigned to or created
    if user.get("system_role") == "employee":
        uid = user["id"]
        if str(task.get("assigned_to")) != uid and str(task.get("created_by")) != uid:
            raise HTTPException(status_code=403, detail="Access denied")

    doc = serialize_doc(task)
    doc["notes"] = [_serialize_subdoc(n) for n in task.get("notes", [])]
    doc["audit_log"] = [_serialize_subdoc(e) for e in task.get("audit_log", [])]
    return doc


@router.post("/{task_id}/notes")
async def add_note(task_id: str, req: NoteCreate, user=Depends(get_current_user)):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Note text required")
    try:
        t_id = ObjectId(task_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task ID")

    task = await db.tasks.find_one({"_id": t_id, "org_id": user.get("org_id")})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Employees gate: must be assignee or creator
    if user.get("system_role") == "employee":
        uid = user["id"]
        if str(task.get("assigned_to")) != uid and str(task.get("created_by")) != uid:
            raise HTTPException(status_code=403, detail="Access denied")

    now = datetime.now(timezone.utc)
    note = {
        "text": req.text.strip(),
        "author_id": ObjectId(user["id"]),
        "author_name": user.get("full_name", ""),
        "timestamp": now,
    }

    await db.tasks.update_one(
        {"_id": t_id},
        {
            "$push": {
                "notes": note,
                "audit_log": {
                    "action": "note_added",
                    "user_id": ObjectId(user["id"]),
                    "timestamp": now,
                    "details": f"Note added by {user.get('full_name', '')}",
                },
            }
        },
    )

    # Notify assignee and creator (but not the note author)
    recipients = {str(task["assigned_to"]), str(task["created_by"])} - {user["id"]}
    for rid in recipients:
        await create_notification(
            rid,
            "task_note_added",
            "New note on task",
            f"{user.get('full_name', 'Someone')} added a note to '{task['title']}'",
            f"/tasks?open={task_id}",
        )

    return {"message": "Note added"}


@router.put("/{task_id}")
async def update_task(task_id: str, req: TaskUpdate, user=Depends(get_current_user)):
    t_id = ObjectId(task_id)
    existing = await db.tasks.find_one({"_id": t_id, "org_id": user.get("org_id")})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")

    if user.get("system_role") == "employee" and str(existing.get("created_by")) != user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized to update this task")

    updates = {}
    if req.title is not None:
        updates["title"] = req.title
    if req.description is not None:
        updates["description"] = req.description
    if req.priority is not None:
        updates["priority"] = req.priority
    if req.due_date is not None:
        updates["due_date"] = datetime.fromisoformat(req.due_date.replace("Z", "+00:00")) if req.due_date else None

    if updates:
        await db.tasks.update_one({"_id": t_id}, {"$set": updates})
        await db.tasks.update_one({"_id": t_id}, {"$push": {"audit_log": {
            "action": "updated",
            "user_id": ObjectId(user["id"]),
            "timestamp": datetime.now(timezone.utc),
            "details": "Task details updated",
        }}})

    await log_audit(None, user["id"], "update", "task", task_id)
    return {"message": "Task updated"}


@router.post("/{task_id}/transfer")
async def transfer_task(task_id: str, req: TaskTransfer, user=Depends(get_current_user)):
    if user.get("system_role") not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admin or manager can transfer tasks")

    t_id = ObjectId(task_id)
    task = await db.tasks.find_one({"_id": t_id, "org_id": user.get("org_id")})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    new_owner_id = ObjectId(req.new_owner_id)
    await db.tasks.update_one(
        {"_id": t_id},
        {
            "$set": {"assigned_to": new_owner_id, "transfer_reason": req.reason},
            "$push": {"audit_log": {
                "action": "transferred",
                "user_id": ObjectId(user["id"]),
                "timestamp": datetime.now(timezone.utc),
                "details": f"Ownership changed from {user.get('full_name', 'Previous Owner')} to new owner. Reason: {req.reason or 'Not specified'}",
            }},
        },
    )

    await create_notification(
        req.new_owner_id,
        "task_transferred",
        "Task Transferred to You",
        f"Task '{task['title']}' has been transferred to you. Reason: {req.reason or 'Not specified'}",
        f"/tasks?open={task_id}",
    )

    await log_audit(None, user["id"], "transfer", "task", task_id, diff={"to_user": req.new_owner_id, "reason": req.reason})
    return {"message": "Task transferred successfully"}


@router.post("/{task_id}/complete")
async def complete_task(task_id: str, user=Depends(get_current_user)):
    t_id = ObjectId(task_id)
    task = await db.tasks.find_one({"_id": t_id, "org_id": user.get("org_id")})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    now = datetime.now(timezone.utc)
    await db.tasks.update_one(
        {"_id": t_id},
        {
            "$set": {"status": "completed", "completed_at": now, "completed_by": ObjectId(user["id"])},
            "$push": {"audit_log": {
                "action": "completed",
                "user_id": ObjectId(user["id"]),
                "timestamp": now,
                "details": "Task marked as completed",
            }},
        },
    )

    # Notify creator (if different from completer)
    creator_id = str(task["created_by"])
    if creator_id != user["id"]:
        await create_notification(
            creator_id,
            "task_completed",
            "Task Completed",
            f"'{task['title']}' was marked complete by {user.get('full_name', 'Assignee')}",
            f"/tasks?open={task_id}",
        )

    await log_audit(None, user["id"], "complete", "task", task_id)
    return {"message": "Task completed"}
