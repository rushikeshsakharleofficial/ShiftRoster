from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, log_audit, create_notification

router = APIRouter(prefix="/api/handovers", tags=["handovers"], redirect_slashes=False)


class HandoverCreate(BaseModel):
    title: str
    shift_id: Optional[str] = None


class HandoverResponse(BaseModel):
    id: str
    title: str
    shift_id: Optional[str] = None
    created_by: str
    created_at: str
    status: str
    completed_at: Optional[str] = None


@router.post("/", response_model=dict)
async def create_handover(req: HandoverCreate, user=Depends(get_current_user)):
    new_handover = {
        "org_id": user.get("org_id"),
        "title": req.title,
        "shift_id": ObjectId(req.shift_id) if req.shift_id else None,
        "created_by": ObjectId(user["id"]),
        "created_at": datetime.now(timezone.utc),
        "status": "pending",
        "completed_at": None,
    }
    result = await db.handovers.insert_one(new_handover)
    new_handover["_id"] = result.inserted_id
    
    await log_audit(None, user["id"], "create", "handover", str(result.inserted_id))
    return serialize_doc(new_handover)


@router.get("", response_model=List[dict])
@router.get("/", response_model=List[dict])
async def list_handovers(user=Depends(get_current_user)):
    query = {"org_id": user.get("org_id")}
    docs = await db.handovers.find(query).sort("created_at", -1).to_list(100)
    return serialize_list(docs)


@router.post("/{handover_id}/complete")
async def complete_handover(handover_id: str, user=Depends(get_current_user)):
    h_id = ObjectId(handover_id)
    handover = await db.handovers.find_one({"_id": h_id, "org_id": user.get("org_id")})
    if not handover:
        raise HTTPException(status_code=404, detail="Handover not found")
    
    now = datetime.now(timezone.utc)
    await db.handovers.update_one(
        {"_id": h_id},
        {"$set": {"status": "completed", "completed_at": now}}
    )
    
    # Also complete all tasks in this handover
    await db.tasks.update_many(
        {"handover_id": h_id, "status": "pending"},
        {"$set": {"status": "completed", "completed_at": now, "completed_by": ObjectId(user["id"])}}
    )
    
    await log_audit(None, user["id"], "complete", "handover", handover_id)
    return {"message": "Handover completed"}
