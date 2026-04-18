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


@router.post("/", response_model=dict)
async def create_task(req: TaskCreate, user=Depends(get_current_user)):
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
        "audit_log": [{
            "action": "created",
            "user_id": ObjectId(user["id"]),
            "timestamp": datetime.now(timezone.utc),
            "details": f"Task created by {user.get('full_name', 'User')}"
        }]
    }
    result = await db.tasks.insert_one(new_task)
    new_task["_id"] = result.inserted_id
    
    # Notify assignee
    await create_notification(
        req.assigned_to,
        "task_assigned",
        "New Task Assigned",
        f"You have been assigned a new task: {req.title}",
        f"/handovers"
    )
    
    await log_audit(None, user["id"], "create", "task", str(result.inserted_id))
    return serialize_doc(new_task)


@router.get("", response_model=List[dict])
@router.get("/", response_model=List[dict])
async def list_tasks(
    assigned_to: Optional[str] = None,
    status: Optional[str] = None,
    handover_id: Optional[str] = None,
    user=Depends(get_current_user)
):
    query = {"org_id": user.get("org_id")}
    if assigned_to:
        query["assigned_to"] = ObjectId(assigned_to)
    if status:
        query["status"] = status
    if handover_id:
        query["handover_id"] = ObjectId(handover_id)
        
    docs = await db.tasks.find(query).sort("created_at", -1).to_list(200)
    return serialize_list(docs)


@router.get("/pending-count")
async def get_pending_tasks_count(user=Depends(get_current_user)):
    count = await db.tasks.count_documents({
        "org_id": user.get("org_id"),
        "assigned_to": ObjectId(user["id"]),
        "status": "pending"
    })
    return {"count": count}


@router.put("/{task_id}")
async def update_task(task_id: str, req: TaskUpdate, user=Depends(get_current_user)):
    t_id = ObjectId(task_id)
    existing = await db.tasks.find_one({"_id": t_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
        
    updates = {}
    if req.title is not None: updates["title"] = req.title
    if req.description is not None: updates["description"] = req.description
    if req.priority is not None: updates["priority"] = req.priority
    if req.due_date is not None:
        updates["due_date"] = datetime.fromisoformat(req.due_date.replace("Z", "+00:00")) if req.due_date else None
        
    if updates:
        await db.tasks.update_one({"_id": t_id}, {"$set": updates})
        await db.tasks.update_one({"_id": t_id}, {"$push": {"audit_log": {
            "action": "updated",
            "user_id": ObjectId(user["id"]),
            "timestamp": datetime.now(timezone.utc),
            "details": f"Task details updated"
        }}})
        
    await log_audit(None, user["id"], "update", "task", task_id)
    return {"message": "Task updated"}


@router.post("/{task_id}/transfer")
async def transfer_task(task_id: str, req: TaskTransfer, user=Depends(get_current_user)):
    t_id = ObjectId(task_id)
    task = await db.tasks.find_one({"_id": t_id})
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
                "details": f"Ownership changed from {user.get('full_name', 'Previous Owner')} to new owner. Reason: {req.reason or 'Not specified'}"
            }}
        }
    )
    
    # Notify new assignee
    await create_notification(
        req.new_owner_id,
        "task_transferred",
        "Task Transferred to You",
        f"Task '{task['title']}' has been transferred to you. Reason: {req.reason or 'Not specified'}",
        f"/handovers"
    )
    
    await log_audit(None, user["id"], "transfer", "task", task_id, diff={"to_user": req.new_owner_id, "reason": req.reason})
    return {"message": "Task transferred successfully"}


@router.post("/{task_id}/complete")
async def complete_task(task_id: str, user=Depends(get_current_user)):
    t_id = ObjectId(task_id)
    task = await db.tasks.find_one({"_id": t_id})
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
                "details": f"Task marked as completed"
            }}
        }
    )
    
    await log_audit(None, user["id"], "complete", "task", task_id)
    return {"message": "Task completed"}
