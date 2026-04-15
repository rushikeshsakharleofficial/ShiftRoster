from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, log_audit, create_notification

router = APIRouter(prefix="/api/sticky-notes", tags=["sticky-notes"])


class CreateStickyNoteRequest(BaseModel):
    note_date: str  # YYYY-MM-DD
    text: str
    color: str = "#FEF3C7"  # default yellow
    is_public: bool = False
    pinned: bool = False


class UpdateStickyNoteRequest(BaseModel):
    text: Optional[str] = None
    color: Optional[str] = None
    note_date: Optional[str] = None
    is_public: Optional[bool] = None
    pinned: Optional[bool] = None
    position_x: Optional[int] = None
    position_y: Optional[int] = None


@router.get("")
async def list_sticky_notes(
    request: Request,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    current = await get_current_user(request)
    org_id = current.get("org_id")

    # Show user's own notes + public org notes
    query = {
        "org_id": org_id,
        "$or": [
            {"user_id": current["id"]},
            {"is_public": True},
        ]
    }

    if start_date:
        query.setdefault("note_date", {})
        query["note_date"]["$gte"] = start_date
    if end_date:
        query.setdefault("note_date", {})
        query["note_date"]["$lte"] = end_date

    notes = await db.sticky_notes.find(query).sort("note_date", 1).to_list(500)
    return {"notes": serialize_list(notes)}


@router.post("")
async def create_sticky_note(data: CreateStickyNoteRequest, request: Request):
    current = await get_current_user(request)

    note_doc = {
        "org_id": current.get("org_id"),
        "user_id": current["id"],
        "user_name": current.get("full_name", ""),
        "note_date": data.note_date,
        "text": data.text,
        "color": data.color,
        "is_public": data.is_public,
        "pinned": data.pinned,
        "position_x": 0,
        "position_y": 0,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.sticky_notes.insert_one(note_doc)
    note_doc["_id"] = result.inserted_id

    # Notify all org members when a public note is created
    if data.is_public:
        org_users = await db.users.find(
            {"org_id": current.get("org_id"), "_id": {"$ne": ObjectId(current["id"])}},
            {"_id": 1}
        ).to_list(500)
        creator_name = current.get("full_name", "Someone")
        preview = data.text[:60] + ("..." if len(data.text) > 60 else "")
        for u in org_users:
            await create_notification(
                str(u["_id"]),
                "sticky_note_public",
                f"{creator_name} posted a public note: {preview}",
                link="/sticky-notes"
            )

    return serialize_doc(note_doc)


@router.put("/{note_id}")
async def update_sticky_note(note_id: str, data: UpdateStickyNoteRequest, request: Request):
    current = await get_current_user(request)

    try:
        note = await db.sticky_notes.find_one({"_id": ObjectId(note_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Note not found")

    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Only owner or admin can edit
    if note["user_id"] != current["id"] and current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to edit this note")

    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    update["updated_at"] = datetime.now(timezone.utc)
    await db.sticky_notes.update_one({"_id": ObjectId(note_id)}, {"$set": update})

    updated = await db.sticky_notes.find_one({"_id": ObjectId(note_id)})
    return serialize_doc(updated)


@router.delete("/{note_id}")
async def delete_sticky_note(note_id: str, request: Request):
    current = await get_current_user(request)

    try:
        note = await db.sticky_notes.find_one({"_id": ObjectId(note_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Note not found")

    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if note["user_id"] != current["id"] and current["system_role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this note")

    await db.sticky_notes.delete_one({"_id": ObjectId(note_id)})
    return {"message": "Note deleted"}
