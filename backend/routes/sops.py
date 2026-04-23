from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, log_audit, create_notification
import uuid
import time
import jwt as _pyjwt
import httpx
from pathlib import Path
import os
from docx import Document as _DocxDoc
from openpyxl import Workbook as _Workbook
from pptx import Presentation as _Presentation

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

# ── OnlyOffice constants ──
_OO_JWT_SECRET = os.getenv("ONLYOFFICE_JWT_SECRET", "")
_OO_BACKEND_URL = os.getenv("BACKEND_INTERNAL_URL", "http://backend:8000")
_OO_EXT = {"document": "docx", "spreadsheet": "xlsx", "presentation": "pptx"}
_OO_DOC_TYPE = {"docx": "word", "xlsx": "cell", "pptx": "slide"}


def _create_oo_file(sop_id: str, sop_type: str) -> Optional[str]:
    """Create a blank OnlyOffice file; return relative filename or None if not an OO type."""
    ext = _OO_EXT.get(sop_type)
    if not ext:
        return None
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"oo_{sop_id}.{ext}"
    file_path = UPLOADS_DIR / filename
    try:
        if ext == "docx":
            _DocxDoc().save(str(file_path))
        elif ext == "xlsx":
            _Workbook().save(str(file_path))
        elif ext == "pptx":
            _Presentation().save(str(file_path))
        return filename
    except Exception:
        return None


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
        "has_pending_edit": False,
        "pending_content": None,
        "pending_edit_by": None,
        "pending_edit_at": None,
        "oo_file": None,
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

    # Create blank OnlyOffice file for document/spreadsheet/presentation types
    oo_filename = _create_oo_file(sop_id, req.sop_type)
    if oo_filename:
        await db.sops.update_one(
            {"_id": result.inserted_id},
            {"$set": {"oo_file": oo_filename}},
        )
        new_sop["oo_file"] = oo_filename

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
    docs = await db.sops.find({"org_id": user.get("org_id")}).sort("created_at", -1).to_list(200)
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

    if sop.get("oo_file"):
        (UPLOADS_DIR / sop["oo_file"]).unlink(missing_ok=True)
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
        "change_note": f"Before revert to v{ver['version']}",
    })

    await db.sops.update_one(
        {"_id": _to_oid(sop_id)},
        {"$set": {
            "content": ver.get("content", {}),
            "file_url": ver.get("file_url"),
            "file_name": ver.get("file_name"),
            "current_version": sop.get("current_version", 1) + 1,
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


# ── OnlyOffice editor integration ──

@router.get("/{sop_id}/editor-config")
async def get_editor_config(sop_id: str, user=Depends(get_current_user)):
    sop = await db.sops.find_one({"_id": _to_oid(sop_id), "org_id": user.get("org_id")})
    if not sop:
        raise HTTPException(404, "SOP not found")
    if not sop.get("oo_file"):
        raise HTTPException(400, "SOP does not use OnlyOffice editor")

    ext = Path(sop["oo_file"]).suffix.lstrip(".")
    doc_type = _OO_DOC_TYPE.get(ext, "word")
    _secret = _OO_JWT_SECRET or "oo-file-fallback-secret"

    file_token = _pyjwt.encode(
        {"sop_id": sop_id, "exp": int(time.time()) + 3600},
        _secret,
        algorithm="HS256",
    )

    doc_url = f"{_OO_BACKEND_URL}/api/sops/{sop_id}/file?t={file_token}"
    callback_url = f"{_OO_BACKEND_URL}/api/sops/{sop_id}/onlyoffice-callback"
    # Key includes file mtime — changes on every OO save, busts OO's internal document cache
    _fp = UPLOADS_DIR / sop["oo_file"]
    _mtime = int(_fp.stat().st_mtime) if _fp.exists() else int(time.time())
    doc_key = f"{sop_id}_{sop.get('current_version', 1)}_{_mtime}"

    is_editor = str(sop.get("owner", "")) == user["id"] or user.get("system_role") in ("admin", "manager")
    can_edit = is_editor and sop.get("status") != "archived"

    config = {
        "document": {
            "fileType": ext,
            "key": doc_key,
            "title": sop.get("title", "Untitled"),
            "url": doc_url,
            "permissions": {
                "edit": can_edit,
                "download": True,
                "print": True,
            },
        },
        "documentType": doc_type,
        "editorConfig": {
            "callbackUrl": callback_url,
            "mode": "edit" if can_edit else "view",
            "user": {
                "id": user["id"],
                "name": user.get("full_name") or user.get("username", "User"),
            },
            "customization": {
                "autosave": True,
                "forcesave": True,
                "compactHeader": True,
            },
        },
        "width": "100%",
        "height": "100%",
    }

    if _OO_JWT_SECRET:
        config["token"] = _pyjwt.encode(config.copy(), _OO_JWT_SECRET, algorithm="HS256")

    return config


@router.get("/{sop_id}/file")
async def serve_sop_file(sop_id: str, t: str):
    """Serve SOP OnlyOffice file — short-lived token auth for OO server and browser downloads."""
    _secret = _OO_JWT_SECRET or "oo-file-fallback-secret"
    try:
        payload = _pyjwt.decode(t, _secret, algorithms=["HS256"])
        if payload.get("sop_id") != sop_id:
            raise HTTPException(403, "Token mismatch")
    except _pyjwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")

    sop = await db.sops.find_one({"_id": _to_oid(sop_id)})
    if not sop or not sop.get("oo_file"):
        raise HTTPException(404, "File not found")

    file_path = UPLOADS_DIR / sop["oo_file"]
    if not file_path.exists():
        raise HTTPException(404, "File not found on disk")

    return FileResponse(str(file_path), filename=sop["oo_file"])


@router.post("/{sop_id}/onlyoffice-callback")
async def onlyoffice_callback(sop_id: str, request: Request):
    """OnlyOffice document server save callback."""
    body = await request.json()

    # Always verify JWT — prevents unauthenticated content injection via fake callbacks
    if not _OO_JWT_SECRET:
        return {"error": 1}
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip() or body.get("token", "")
    if not token:
        return {"error": 1}
    try:
        body = _pyjwt.decode(token, _OO_JWT_SECRET, algorithms=["HS256"])
    except _pyjwt.PyJWTError:
        return {"error": 1}

    status = body.get("status")

    if status in (2, 7):  # 2=ready-to-save, 7=forcesave-complete
        download_url = body.get("url")
        if not download_url:
            return {"error": 1}

        sop = await db.sops.find_one({"_id": _to_oid(sop_id)})
        if not sop or not sop.get("oo_file"):
            return {"error": 1}

        file_path = UPLOADS_DIR / sop["oo_file"]
        try:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                resp = await client.get(download_url, timeout=30.0)
                if resp.status_code != 200:
                    return {"error": 1}
                file_path.write_bytes(resp.content)
        except Exception:
            return {"error": 1}

        now = datetime.now(timezone.utc)
        new_version = sop.get("current_version", 1) + 1

        await db.sop_versions.insert_one({
            "sop_id": sop["_id"],
            "org_id": sop.get("org_id"),
            "version": sop.get("current_version", 1),
            "content": {},
            "oo_file": sop["oo_file"],
            "sop_type": sop.get("sop_type"),
            "changed_by": None,
            "changed_at": now,
            "change_note": "Auto-saved via OnlyOffice",
        })

        await db.sops.update_one(
            {"_id": sop["_id"]},
            {"$set": {"current_version": new_version, "updated_at": now}},
        )

    return {"error": 0}
