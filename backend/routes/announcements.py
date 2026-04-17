from fastapi import APIRouter, HTTPException, Request, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, log_audit

router = APIRouter(prefix="/api/announcements", tags=["announcements"])

class AnnouncementCreate(BaseModel):
    title: str
    content: str
    level: str = "info" # info, warning, success, critical
    start_at: datetime
    end_at: datetime
    target_scope: str = "global" # global, manager, team
    target_id: Optional[str] = None # department_id if team-specific

@router.post("", response_model=dict)
async def create_announcement(data: AnnouncementCreate, user=Depends(get_current_user)):
    if user["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create announcements")
    
    new_ann = data.dict()
    new_ann["org_id"] = user.get("org_id")
    new_ann["created_by"] = user["id"]
    new_ann["created_at"] = datetime.now(timezone.utc)
    
    result = await db.announcements.insert_one(new_ann)
    new_ann["id"] = str(result.inserted_id)
    
    await log_audit(None, user["id"], "create", "announcement", new_ann["id"])
    return serialize_doc(new_ann)

@router.get("/active", response_model=List[dict])
async def get_active_announcements(user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    org_id = user.get("org_id")
    
    # Base query for time and org
    query = {
        "org_id": org_id,
        "start_at": {"$lte": now},
        "end_at": {"$gte": now}
    }
    
    # Filter based on user scope
    # Global announcements are for everyone
    # Manager announcements are for managers/admins
    # Team announcements are for specific department members
    
    scope_filter = [{"target_scope": "global"}]
    
    if user["system_role"] in ["admin", "manager"]:
        scope_filter.append({"target_scope": "manager"})
        
    if user.get("department_id"):
        scope_filter.append({
            "target_scope": "team",
            "target_id": user["department_id"]
        })
        
    query["$or"] = scope_filter
    
    docs = await db.announcements.find(query).sort("created_at", -1).to_list(10)
    return serialize_list(docs)

@router.get("", response_model=List[dict])
async def list_announcements(user=Depends(get_current_user)):
    if user["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can list all announcements")
    
    docs = await db.announcements.find({"org_id": user.get("org_id")}).sort("created_at", -1).to_list(100)
    return serialize_list(docs)

@router.delete("/{ann_id}")
async def delete_announcement(ann_id: str, user=Depends(get_current_user)):
    if user["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete announcements")
    
    await db.announcements.delete_one({"_id": ObjectId(ann_id), "org_id": user.get("org_id")})
    return {"message": "Deleted"}
