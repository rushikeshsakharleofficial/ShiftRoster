from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, log_audit, create_notification
import uuid
import logging
from pathlib import Path
import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sops", tags=["sops"], redirect_slashes=False)


def _to_oid(val: str) -> ObjectId:
    try:
        return ObjectId(val)
    except Exception:
        raise HTTPException(422, "Invalid ID format")

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
MAX_SOP_FILE_BYTES = 50 * 1024 * 1024
_CHUNK = 1024 * 1024
_ALLOWED_EXT = {".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".md", ".png", ".jpg", ".jpeg", ".csv"}
_ALLOWED_MIME = (
    "application/pdf",
    "application/vnd.openxmlformats-officedocument",
    "application/msword",
    "text/plain",
    "text/markdown",
    "text/csv",
    "image/png",
    "image/jpeg",
)


async def _is_readonly_user(user: dict) -> bool:
    """True when user's IAM groups grant only read actions across all resources."""
    if user.get("system_role") in ("admin", "manager"):
        return False
    group_ids = user.get("iam_group_ids", [])
    if not group_ids:
        return False  # No IAM groups = regular employee
    try:
        oids = [ObjectId(g) for g in group_ids]
    except Exception:
        return False
    groups = await db.iam_groups.find({"_id": {"$in": oids}}).to_list(None)
    for group in groups:
        for perm in group.get("permissions", []):
            if perm.get("action") != "read":
                return False
    return True


# ── Pydantic models ──

class SOPCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    tags: List[str] = []
    sop_type: str = "document"  # document | spreadsheet | presentation | file
    content: Optional[dict] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    file_type: Optional[str] = None


class SOPUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    content: Optional[dict] = None
    change_note: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    file_type: Optional[str] = None


class SOPTransfer(BaseModel):
    new_owner_id: str


class SOPPublish(BaseModel):
    publish_status: str  # "draft" | "private" | "published"


# ── File upload ──

@router.post("/upload")
@router.post("/upload/")
async def upload_sop_file(file: UploadFile = File(...), user=Depends(get_current_user)):
    UPLOADS_DIR.mkdir(exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(400, f"File type '{ext}' not allowed for SOPs")
    content_type = (file.content_type or "application/octet-stream").lower()
    if not any(content_type.startswith(p) for p in _ALLOWED_MIME):
        raise HTTPException(400, f"MIME type '{content_type}' not allowed")

    unique_name = f"sop_{uuid.uuid4().hex}{ext}"
    save_path = UPLOADS_DIR / unique_name
    total_bytes = 0
    try:
        with open(save_path, "wb") as f:
            while chunk := await file.read(_CHUNK):
                total_bytes += len(chunk)
                if total_bytes > MAX_SOP_FILE_BYTES:
                    f.close()
                    save_path.unlink(missing_ok=True)
                    raise HTTPException(400, "File too large (max 50 MB)")
                f.write(chunk)
    except HTTPException:
        raise
    except Exception:
        save_path.unlink(missing_ok=True)
        raise HTTPException(500, "Upload failed")

    return {
        "url": f"/uploads/{unique_name}",
        "file_name": file.filename,
        "file_size": total_bytes,
        "file_type": content_type,
    }


# ── CRUD ──

@router.post("", response_model=dict)
@router.post("/", response_model=dict)
async def create_sop(req: SOPCreate, user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    uid = ObjectId(user["id"])
    new_sop = {
        "org_id": user.get("org_id"),
        "title": req.title,
        "description": req.description,
        "category": req.category,
        "tags": req.tags,
        "sop_type": req.sop_type,
        "content": req.content or {},
        "file_url": req.file_url,
        "file_name": req.file_name,
        "file_size": req.file_size,
        "file_type": req.file_type,
        "current_version": 1,
        "status": "published",
        "publish_status": "draft",
        "has_pending_edit": False,
        "pending_content": None,
        "pending_edit_by": None,
        "pending_edit_at": None,
        "owner": uid,
        "created_by": uid,
        "created_at": now,
        "updated_by": uid,
        "updated_at": now,
        "acknowledged_by": [],
    }
    result = await db.sops.insert_one(new_sop)
    new_sop["_id"] = result.inserted_id
    sop_id = str(result.inserted_id)

    await db.sop_versions.insert_one({
        "sop_id": result.inserted_id,
        "org_id": user.get("org_id"),
        "version": 1,
        "content": req.content or {},
        "sop_type": req.sop_type,
        "file_url": req.file_url,
        "file_name": req.file_name,
        "changed_by": uid,
        "changed_at": now,
        "change_note": "Initial version",
    })

    await log_audit(user.get("org_id"), user["id"], "create", "sop", sop_id)
    return serialize_doc(new_sop)


@router.get("", response_model=List[dict])
@router.get("/", response_model=List[dict])
async def list_sops(user=Depends(get_current_user)):
    # Build filter: org_id required; exclude draft/private from non-owners/non-admins
    is_privileged = user.get("system_role") in ("admin", "manager")
    if is_privileged:
        q = {"org_id": user.get("org_id")}
    else:
        q = {"org_id": user.get("org_id"), "$or": [
            {"publish_status": "published"},
            {"publish_status": {"$exists": False}},  # legacy SOPs without field
            {"owner": ObjectId(user["id"])},  # own drafts/private
        ]}
    docs = await db.sops.find(q).sort("created_at", -1).to_list(200)
    return serialize_list(docs)


@router.get("/{sop_id}", response_model=dict)
async def get_sop(sop_id: str, user=Depends(get_current_user)):
    sop = await db.sops.find_one({"_id": _to_oid(sop_id), "org_id": user.get("org_id")})
    if not sop:
        raise HTTPException(404, "SOP not found")
    return serialize_doc(sop)


@router.put("/{sop_id}", response_model=dict)
async def update_sop(sop_id: str, req: SOPUpdate, user=Depends(get_current_user)):
    sop = await db.sops.find_one({"_id": _to_oid(sop_id), "org_id": user.get("org_id")})
    if not sop:
        raise HTTPException(404, "SOP not found")
    if sop.get("status") == "archived":
        raise HTTPException(400, "Cannot edit an archived SOP")

    is_owner = str(sop["owner"]) == user["id"]
    is_privileged = user.get("system_role") in ("admin", "manager")
    can_direct = is_owner or is_privileged
    now = datetime.now(timezone.utc)
    uid = ObjectId(user["id"])

    if not can_direct:
        if await _is_readonly_user(user):
            raise HTTPException(403, "Readonly users can only edit their own SOPs")
        if sop.get("has_pending_edit"):
            raise HTTPException(409, "SOP already has a pending edit awaiting approval")

        pending = {}
        for field in ("content", "title", "description", "category", "tags", "file_url", "file_name", "file_size", "file_type"):
            val = getattr(req, field, None)
            if val is not None:
                pending[field] = val

        await db.sops.update_one(
            {"_id": _to_oid(sop_id)},
            {"$set": {
                "has_pending_edit": True,
                "pending_content": pending,
                "pending_edit_by": uid,
                "pending_edit_at": now,
            }},
        )

        editor_name = user.get("full_name") or user.get("username", "Someone")
        await create_notification(
            sop["owner"],
            "sop_pending_edit",
            f"{editor_name} proposed an edit to \"{sop['title']}\"",
            body=req.change_note,
            link=f"/sops/{sop_id}",
        )
        await log_audit(user.get("org_id"), user["id"], "propose_edit", "sop", sop_id)
        updated = await db.sops.find_one({"_id": _to_oid(sop_id)})
        return serialize_doc(updated)

    # Direct edit: archive current, apply new
    await db.sop_versions.insert_one({
        "sop_id": _to_oid(sop_id),
        "org_id": user.get("org_id"),
        "version": sop.get("current_version", 1),
        "content": sop.get("content", {}),
        "sop_type": sop.get("sop_type"),
        "file_url": sop.get("file_url"),
        "file_name": sop.get("file_name"),
        "changed_by": uid,
        "changed_at": now,
        "change_note": req.change_note or "Updated",
    })

    updates = {
        "updated_by": uid,
        "updated_at": now,
        "current_version": sop.get("current_version", 1) + 1,
    }
    for field in ("title", "description", "category", "tags", "content", "file_url", "file_name", "file_size", "file_type"):
        val = getattr(req, field, None)
        if val is not None:
            updates[field] = val

    await db.sops.update_one({"_id": _to_oid(sop_id)}, {"$set": updates})

    await log_audit(user.get("org_id"), user["id"], "update", "sop", sop_id)
    updated = await db.sops.find_one({"_id": _to_oid(sop_id)})
    return serialize_doc(updated)


@router.delete("/{sop_id}")
async def delete_sop(sop_id: str, user=Depends(get_current_user)):
    sop = await db.sops.find_one({"_id": _to_oid(sop_id), "org_id": user.get("org_id")})
    if not sop:
        raise HTTPException(404, "SOP not found")
    if not (str(sop["owner"]) == user["id"] or user.get("system_role") in ("admin", "manager")):
        raise HTTPException(403, "Only the SOP owner, admin, or manager can delete")

    # Collect all unique file paths from current SOP and its versions
    file_urls = set()
    if sop.get("file_url"):
        file_urls.add(sop["file_url"])

    versions_cursor = db.sop_versions.find({"sop_id": _to_oid(sop_id)})
    async for v in versions_cursor:
        if v.get("file_url"):
            file_urls.add(v["file_url"])

    # Physical cleanup — containment check prevents path traversal
    uploads_root = UPLOADS_DIR.resolve()
    for url in file_urls:
        if url.startswith("/uploads/"):
            filename = url.replace("/uploads/", "")
            file_path = (UPLOADS_DIR / filename).resolve()
            if not str(file_path).startswith(str(uploads_root)):
                logger.warning("Skipping suspicious file path outside uploads dir: %s", file_path)
                continue
            try:
                if file_path.exists():
                    file_path.unlink()
            except Exception as e:
                logger.warning("Failed to delete SOP file %s: %s", file_path, e)

    await db.sops.delete_one({"_id": _to_oid(sop_id)})
    await db.sop_versions.delete_many({"sop_id": _to_oid(sop_id)})
    await log_audit(user.get("org_id"), user["id"], "delete", "sop", sop_id)
    return {"ok": True}


# ── Approval flow ──

@router.put("/{sop_id}/approve", response_model=dict)
async def approve_sop_edit(sop_id: str, user=Depends(get_current_user)):
    sop = await db.sops.find_one({"_id": _to_oid(sop_id), "org_id": user.get("org_id")})
    if not sop:
        raise HTTPException(404, "SOP not found")
    if not (str(sop["owner"]) == user["id"] or user.get("system_role") in ("admin", "manager")):
        raise HTTPException(403, "Only the SOP owner can approve edits")
    if not sop.get("has_pending_edit"):
        raise HTTPException(400, "No pending edit to approve")

    now = datetime.now(timezone.utc)
    uid = ObjectId(user["id"])
    pending = sop.get("pending_content") or {}

    await db.sop_versions.insert_one({
        "sop_id": _to_oid(sop_id),
        "org_id": user.get("org_id"),
        "version": sop.get("current_version", 1),
        "content": sop.get("content", {}),
        "sop_type": sop.get("sop_type"),
        "file_url": sop.get("file_url"),
        "file_name": sop.get("file_name"),
        "changed_by": uid,
        "changed_at": now,
        "change_note": "Before approved edit",
    })

    updates = {
        "current_version": sop.get("current_version", 1) + 1,
        "updated_by": sop.get("pending_edit_by"),
        "updated_at": now,
        "has_pending_edit": False,
        "pending_content": None,
        "pending_edit_by": None,
        "pending_edit_at": None,
    }
    for k in ("content", "title", "description", "category", "tags", "file_url", "file_name", "file_size", "file_type"):
        if k in pending:
            updates[k] = pending[k]

    await db.sops.update_one({"_id": _to_oid(sop_id)}, {"$set": updates})

    if sop.get("pending_edit_by"):
        approver_name = user.get("full_name") or user.get("username", "Owner")
        await create_notification(
            sop["pending_edit_by"],
            "sop_edit_approved",
            f"Your edit to \"{sop['title']}\" was approved by {approver_name}",
            link=f"/sops/{sop_id}",
        )

    await log_audit(user.get("org_id"), user["id"], "approve_edit", "sop", sop_id)
    updated = await db.sops.find_one({"_id": _to_oid(sop_id)})
    return serialize_doc(updated)


@router.put("/{sop_id}/reject", response_model=dict)
async def reject_sop_edit(sop_id: str, user=Depends(get_current_user)):
    sop = await db.sops.find_one({"_id": _to_oid(sop_id), "org_id": user.get("org_id")})
    if not sop:
        raise HTTPException(404, "SOP not found")
    if not (str(sop["owner"]) == user["id"] or user.get("system_role") in ("admin", "manager")):
        raise HTTPException(403, "Only the SOP owner can reject edits")
    if not sop.get("has_pending_edit"):
        raise HTTPException(400, "No pending edit to reject")

    if sop.get("pending_edit_by"):
        rejector_name = user.get("full_name") or user.get("username", "Owner")
        await create_notification(
            sop["pending_edit_by"],
            "sop_edit_rejected",
            f"Your edit to \"{sop['title']}\" was rejected by {rejector_name}",
            link=f"/sops/{sop_id}",
        )

    await db.sops.update_one(
        {"_id": _to_oid(sop_id)},
        {"$set": {
            "has_pending_edit": False,
            "pending_content": None,
            "pending_edit_by": None,
            "pending_edit_at": None,
        }},
    )

    await log_audit(user.get("org_id"), user["id"], "reject_edit", "sop", sop_id)
    updated = await db.sops.find_one({"_id": _to_oid(sop_id)})
    return serialize_doc(updated)


# ── Version history ──

@router.get("/{sop_id}/versions", response_model=List[dict])
async def list_sop_versions(sop_id: str, user=Depends(get_current_user)):
    sop = await db.sops.find_one({"_id": _to_oid(sop_id), "org_id": user.get("org_id")})
    if not sop:
        raise HTTPException(404, "SOP not found")
    versions = await db.sop_versions.find({"sop_id": _to_oid(sop_id)}).sort("version", -1).to_list(100)
    return serialize_list(versions)


@router.post("/{sop_id}/revert/{version_id}", response_model=dict)
async def revert_sop(sop_id: str, version_id: str, user=Depends(get_current_user)):
    sop = await db.sops.find_one({"_id": _to_oid(sop_id), "org_id": user.get("org_id")})
    if not sop:
        raise HTTPException(404, "SOP not found")
    if not (str(sop["owner"]) == user["id"] or user.get("system_role") in ("admin", "manager")):
        raise HTTPException(403, "Only the SOP owner can revert versions")

    ver = await db.sop_versions.find_one({"_id": _to_oid(version_id), "sop_id": _to_oid(sop_id)})
    if not ver:
        raise HTTPException(404, "Version not found")

    now = datetime.now(timezone.utc)
    uid = ObjectId(user["id"])

    # Restore old version's content in-place — no new snapshot created,
    # no version counter bump, so history stays clean.
    await db.sops.update_one(
        {"_id": _to_oid(sop_id)},
        {"$set": {
            "content": ver.get("content", {}),
            "file_url": ver.get("file_url"),
            "file_name": ver.get("file_name"),
            "updated_by": uid,
            "updated_at": now,
            "has_pending_edit": False,
            "pending_content": None,
            "pending_edit_by": None,
            "pending_edit_at": None,
        }},
    )

    await log_audit(user.get("org_id"), user["id"], "revert", "sop", sop_id, diff={"to_version": ver["version"]})
    updated = await db.sops.find_one({"_id": _to_oid(sop_id)})
    return serialize_doc(updated)


# ── Acknowledge ──

@router.post("/{sop_id}/acknowledge", response_model=dict)
async def acknowledge_sop(sop_id: str, user=Depends(get_current_user)):
    sop = await db.sops.find_one({"_id": _to_oid(sop_id), "org_id": user.get("org_id")})
    if not sop:
        raise HTTPException(404, "SOP not found")

    uid_str = user["id"]
    already = any(str(a.get("user_id")) == uid_str for a in sop.get("acknowledged_by", []))
    if not already:
        await db.sops.update_one(
            {"_id": _to_oid(sop_id)},
            {"$push": {"acknowledged_by": {"user_id": ObjectId(uid_str), "at": datetime.now(timezone.utc)}}},
        )
        await log_audit(user.get("org_id"), user["id"], "acknowledge", "sop", sop_id)
        sop = await db.sops.find_one({"_id": _to_oid(sop_id)})

    return serialize_doc(sop)


# ── Ownership transfer ──

@router.post("/{sop_id}/transfer", response_model=dict)
async def transfer_sop_ownership(sop_id: str, req: SOPTransfer, user=Depends(get_current_user)):
    sop = await db.sops.find_one({"_id": _to_oid(sop_id), "org_id": user.get("org_id")})
    if not sop:
        raise HTTPException(404, "SOP not found")
    if not (str(sop["owner"]) == user["id"] or user.get("system_role") in ("admin", "manager")):
        raise HTTPException(403, "Only the SOP owner or admin can transfer ownership")

    new_owner = await db.users.find_one({"_id": _to_oid(req.new_owner_id), "org_id": user.get("org_id")})
    if not new_owner:
        raise HTTPException(404, "Target user not found in this organisation")

    now = datetime.now(timezone.utc)
    await db.sops.update_one(
        {"_id": _to_oid(sop_id)},
        {"$set": {"owner": _to_oid(req.new_owner_id), "updated_at": now, "updated_by": ObjectId(user["id"])}},
    )

    await create_notification(
        _to_oid(req.new_owner_id),
        "sop_ownership_transfer",
        f"You are now the owner of SOP \"{sop['title']}\"",
        link=f"/sops/{sop_id}",
    )

    await log_audit(user.get("org_id"), user["id"], "transfer_ownership", "sop", sop_id, diff={"new_owner": req.new_owner_id})
    updated = await db.sops.find_one({"_id": _to_oid(sop_id)})
    return serialize_doc(updated)


# ── Archive ──

@router.post("/{sop_id}/archive", response_model=dict)
async def archive_sop(sop_id: str, user=Depends(get_current_user)):
    sop = await db.sops.find_one({"_id": _to_oid(sop_id), "org_id": user.get("org_id")})
    if not sop:
        raise HTTPException(404, "SOP not found")
    if not (str(sop["owner"]) == user["id"] or user.get("system_role") in ("admin", "manager")):
        raise HTTPException(403, "Only the SOP owner, admin, or manager can archive")

    now = datetime.now(timezone.utc)
    await db.sops.update_one(
        {"_id": _to_oid(sop_id)},
        {"$set": {"status": "archived", "updated_at": now, "updated_by": ObjectId(user["id"])}},
    )

    await log_audit(user.get("org_id"), user["id"], "archive", "sop", sop_id)
    updated = await db.sops.find_one({"_id": _to_oid(sop_id)})
    return serialize_doc(updated)


# ── Publish status ──

@router.put("/{sop_id}/publish-status", response_model=dict)
async def update_publish_status(sop_id: str, req: SOPPublish, user=Depends(get_current_user)):
    if req.publish_status not in ("draft", "private", "published"):
        raise HTTPException(400, "publish_status must be 'draft', 'private', or 'published'")

    sop = await db.sops.find_one({"_id": _to_oid(sop_id), "org_id": user.get("org_id")})
    if not sop:
        raise HTTPException(404, "SOP not found")
    if not (str(sop["owner"]) == user["id"] or user.get("system_role") in ("admin", "manager")):
        raise HTTPException(403, "Only the SOP owner, admin, or manager can change publish status")

    now = datetime.now(timezone.utc)
    uid = ObjectId(user["id"])
    await db.sops.update_one(
        {"_id": _to_oid(sop_id)},
        {"$set": {"publish_status": req.publish_status, "updated_at": now, "updated_by": uid}},
    )

    await log_audit(user.get("org_id"), user["id"], "update_publish_status", "sop", sop_id, diff={"publish_status": req.publish_status})
    updated = await db.sops.find_one({"_id": _to_oid(sop_id)})
    return serialize_doc(updated)
