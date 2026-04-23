from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
from pathlib import Path
import uuid
import os

from db import db
from auth_utils import get_current_user, serialize_doc, serialize_list, log_audit

router = APIRouter(prefix="/api/files", tags=["filemanager"], redirect_slashes=False)


# ── Storage constants ──
UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
FM_ROOT = UPLOADS_DIR / "filemanager"
DEFAULT_MAX_FILE_MB = 100
_CHUNK = 1024 * 1024

# Security: mirror the blocked-extension pattern from routes/chat.py
BLOCKED_EXTS = {
    ".php", ".phtml", ".exe", ".msi", ".bat", ".cmd", ".html", ".svg",
    ".py", ".js", ".jar", ".sh", ".bash", ".dll", ".com", ".scr", ".vbs",
    ".wsf", ".hta", ".cpl", ".jsp", ".aspx", ".asp", ".cgi", ".pl",
}


def _to_oid(val: str) -> ObjectId:
    try:
        return ObjectId(val)
    except Exception:
        raise HTTPException(422, "Invalid ID format")


def _parse_parent(parent_id: Optional[str]) -> Optional[ObjectId]:
    """Turn a user-provided parent_id string into ObjectId or None (root)."""
    if parent_id is None or parent_id == "" or parent_id == "null":
        return None
    return _to_oid(parent_id)


# ── Pydantic models ──

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None
    scope: str = "private"  # "private" | "shared"


class ItemRename(BaseModel):
    name: str


class ItemMove(BaseModel):
    new_parent_id: Optional[str] = None
    new_scope: Optional[str] = None


# ── Serialization helper ──

def _item_response(doc: dict) -> dict:
    """Serialize a filemanager item and attach derived fields for the frontend."""
    out = serialize_doc(doc)
    out["is_folder"] = doc.get("type") == "folder"
    return out


def _items_response(docs: list) -> list:
    return [_item_response(d) for d in docs]


# ── Permission helpers ──

def _can_read(item: dict, user: dict) -> bool:
    is_priv = user.get("system_role") in ("admin", "manager")
    if item["scope"] == "private":
        return str(item["owner_id"]) == user["id"] or is_priv
    return str(item["org_id"]) == str(user.get("org_id"))


def _can_mutate(item: dict, user: dict) -> bool:
    is_priv = user.get("system_role") in ("admin", "manager")
    return str(item["owner_id"]) == user["id"] or is_priv


async def _get_org_max_bytes(user: dict) -> int:
    """Read org's file_manager.max_file_mb, defaulting to DEFAULT_MAX_FILE_MB."""
    try:
        org = await db.organizations.find_one({"_id": ObjectId(user["org_id"])})
    except Exception:
        org = None
    fm = (org or {}).get("file_manager") or {}
    mb = fm.get("max_file_mb", DEFAULT_MAX_FILE_MB)
    try:
        mb = int(mb)
    except Exception:
        mb = DEFAULT_MAX_FILE_MB
    if mb < 1:
        mb = DEFAULT_MAX_FILE_MB
    return mb * 1024 * 1024


# ── List ──

@router.get("")
@router.get("/")
async def list_items(
    scope: str = Query("private"),
    parent_id: Optional[str] = Query(None),
    user=Depends(get_current_user),
):
    if scope not in ("private", "shared"):
        raise HTTPException(400, "scope must be 'private' or 'shared'")

    parent_oid = _parse_parent(parent_id)

    q = {
        "org_id": ObjectId(user["org_id"]),
        "scope": scope,
        "parent_id": parent_oid,
    }

    is_priv = user.get("system_role") in ("admin", "manager")
    if scope == "private" and not is_priv:
        q["owner_id"] = ObjectId(user["id"])

    # Folders first, then by name — type "folder" < "file" alphabetically
    cursor = db.filemanager_items.find(q).sort([("type", 1), ("name", 1)])
    docs = await cursor.to_list(1000)
    return _items_response(docs)


# ── Create folder ──

@router.post("/folder")
@router.post("/folder/")
async def create_folder(req: FolderCreate, user=Depends(get_current_user)):
    if req.scope not in ("private", "shared"):
        raise HTTPException(400, "scope must be 'private' or 'shared'")

    parent_oid = _parse_parent(req.parent_id)

    # Validate parent if provided
    if parent_oid is not None:
        parent = await db.filemanager_items.find_one({
            "_id": parent_oid,
            "org_id": ObjectId(user["org_id"]),
        })
        if not parent:
            raise HTTPException(404, "Parent folder not found")
        if parent.get("type") != "folder":
            raise HTTPException(400, "Parent must be a folder")
        if not _can_read(parent, user):
            raise HTTPException(403, "Cannot create items in this folder")

    now = datetime.now(timezone.utc)
    doc = {
        "org_id": ObjectId(user["org_id"]),
        "owner_id": ObjectId(user["id"]),
        "scope": req.scope,
        "parent_id": parent_oid,
        "type": "folder",
        "name": req.name,
        "storage_name": None,
        "size": 0,
        "mime": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.filemanager_items.insert_one(doc)
    doc["_id"] = result.inserted_id
    await log_audit(user.get("org_id"), user["id"], "create", "file", str(result.inserted_id))
    return _item_response(doc)


# ── Upload ──

@router.post("/upload")
@router.post("/upload/")
async def upload_file(
    file: UploadFile = File(...),
    parent_id: Optional[str] = Query(None),
    scope: str = Query("private"),
    user=Depends(get_current_user),
):
    if scope not in ("private", "shared"):
        raise HTTPException(400, "scope must be 'private' or 'shared'")
    if not file.filename:
        raise HTTPException(400, "No file provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext in BLOCKED_EXTS:
        raise HTTPException(400, f"File type '{ext}' is not allowed")

    parent_oid = _parse_parent(parent_id)
    if parent_oid is not None:
        parent = await db.filemanager_items.find_one({
            "_id": parent_oid,
            "org_id": ObjectId(user["org_id"]),
        })
        if not parent:
            raise HTTPException(404, "Parent folder not found")
        if parent.get("type") != "folder":
            raise HTTPException(400, "Parent must be a folder")
        if not _can_read(parent, user):
            raise HTTPException(403, "Cannot upload to this folder")

    max_bytes = await _get_org_max_bytes(user)

    storage_name = uuid.uuid4().hex
    org_dir = FM_ROOT / str(user["org_id"])
    org_dir.mkdir(parents=True, exist_ok=True)
    save_path = org_dir / storage_name

    total_bytes = 0
    try:
        with open(save_path, "wb") as f:
            while chunk := await file.read(_CHUNK):
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    f.close()
                    save_path.unlink(missing_ok=True)
                    raise HTTPException(413, f"File too large (max {max_bytes // (1024 * 1024)} MB)")
                f.write(chunk)
    except HTTPException:
        raise
    except Exception:
        save_path.unlink(missing_ok=True)
        raise HTTPException(500, "Upload failed")

    now = datetime.now(timezone.utc)
    mime = (file.content_type or "application/octet-stream").lower()
    doc = {
        "org_id": ObjectId(user["org_id"]),
        "owner_id": ObjectId(user["id"]),
        "scope": scope,
        "parent_id": parent_oid,
        "type": "file",
        "name": file.filename,
        "storage_name": storage_name,
        "size": total_bytes,
        "mime": mime,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.filemanager_items.insert_one(doc)
    doc["_id"] = result.inserted_id
    await log_audit(user.get("org_id"), user["id"], "create", "file", str(result.inserted_id))
    return _item_response(doc)


# ── Download ──

@router.get("/{item_id}/download")
async def download_file(item_id: str, user=Depends(get_current_user)):
    item = await db.filemanager_items.find_one({
        "_id": _to_oid(item_id),
        "org_id": ObjectId(user["org_id"]),
    })
    if not item:
        raise HTTPException(404, "File not found")
    if item.get("type") != "file":
        raise HTTPException(400, "Item is not a file")
    if not _can_read(item, user):
        raise HTTPException(403, "Not allowed to read this file")

    # SOP-backed items live at the SOP's oo_file path instead of filemanager storage
    sop_id = item.get("sop_id")
    if sop_id:
        sop = await db.sops.find_one({"_id": sop_id})
        if not sop or not sop.get("oo_file"):
            raise HTTPException(404, "Linked SOP file is missing")
        sop_path = UPLOADS_DIR / sop["oo_file"]
        if not sop_path.exists():
            raise HTTPException(404, "SOP file missing on disk")
        return FileResponse(
            str(sop_path),
            media_type=item.get("mime") or "application/octet-stream",
            filename=item["name"],
        )

    storage_name = item.get("storage_name")
    if not storage_name:
        raise HTTPException(404, "File has no stored contents")

    path = FM_ROOT / str(item["org_id"]) / storage_name
    if not path.exists():
        raise HTTPException(404, "File missing on disk")

    return FileResponse(
        str(path),
        media_type=item.get("mime") or "application/octet-stream",
        filename=item["name"],
    )


# ── Rename ──

@router.put("/{item_id}")
async def rename_item(item_id: str, req: ItemRename, user=Depends(get_current_user)):
    item = await db.filemanager_items.find_one({
        "_id": _to_oid(item_id),
        "org_id": ObjectId(user["org_id"]),
    })
    if not item:
        raise HTTPException(404, "Item not found")
    if item.get("sop_id"):
        raise HTTPException(400, "SOP-linked files are managed from the SOPs page")
    if not _can_mutate(item, user):
        raise HTTPException(403, "Not allowed to rename this item")

    name = (req.name or "").strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty")

    now = datetime.now(timezone.utc)
    await db.filemanager_items.update_one(
        {"_id": _to_oid(item_id)},
        {"$set": {"name": name, "updated_at": now}},
    )
    await log_audit(user.get("org_id"), user["id"], "update", "file", item_id)
    updated = await db.filemanager_items.find_one({"_id": _to_oid(item_id)})
    return _item_response(updated)


# ── Delete (recursive for folders) ──

async def _collect_descendants(root_oid: ObjectId, org_oid: ObjectId) -> List[dict]:
    """BFS all descendants of a folder (not including the folder itself)."""
    out: List[dict] = []
    frontier = [root_oid]
    while frontier:
        children = await db.filemanager_items.find({
            "org_id": org_oid,
            "parent_id": {"$in": frontier},
        }).to_list(None)
        if not children:
            break
        out.extend(children)
        frontier = [c["_id"] for c in children if c.get("type") == "folder"]
        if not frontier:
            break
    return out


@router.delete("/{item_id}")
async def delete_item(item_id: str, user=Depends(get_current_user)):
    item = await db.filemanager_items.find_one({
        "_id": _to_oid(item_id),
        "org_id": ObjectId(user["org_id"]),
    })
    if not item:
        raise HTTPException(404, "Item not found")
    if item.get("sop_id"):
        raise HTTPException(400, "SOP-linked files must be deleted from the SOPs page")
    if not _can_mutate(item, user):
        raise HTTPException(403, "Not allowed to delete this item")

    org_oid = ObjectId(user["org_id"])

    if item.get("type") == "folder":
        descendants = await _collect_descendants(item["_id"], org_oid)
        # Remove storage files for any descendant files
        for d in descendants:
            if d.get("type") == "file" and d.get("storage_name"):
                p = FM_ROOT / str(d["org_id"]) / d["storage_name"]
                p.unlink(missing_ok=True)
        # Delete descendants + the folder itself in one go
        all_ids = [d["_id"] for d in descendants] + [item["_id"]]
        await db.filemanager_items.delete_many({"_id": {"$in": all_ids}, "org_id": org_oid})
    else:
        if item.get("storage_name"):
            p = FM_ROOT / str(item["org_id"]) / item["storage_name"]
            p.unlink(missing_ok=True)
        await db.filemanager_items.delete_one({"_id": item["_id"], "org_id": org_oid})

    await log_audit(user.get("org_id"), user["id"], "delete", "file", item_id)
    return {"ok": True}


# ── Move ──

@router.post("/{item_id}/move")
async def move_item(item_id: str, req: ItemMove, user=Depends(get_current_user)):
    item = await db.filemanager_items.find_one({
        "_id": _to_oid(item_id),
        "org_id": ObjectId(user["org_id"]),
    })
    if not item:
        raise HTTPException(404, "Item not found")
    if item.get("sop_id"):
        raise HTTPException(400, "SOP-linked files cannot be moved")
    if not _can_mutate(item, user):
        raise HTTPException(403, "Not allowed to move this item")

    updates: dict = {}

    # Resolve target scope (defaults to current if not changing)
    target_scope = req.new_scope if req.new_scope is not None else item["scope"]
    if target_scope not in ("private", "shared"):
        raise HTTPException(400, "new_scope must be 'private' or 'shared'")

    # parent_id is optional in body; explicit presence means "change it"
    # (pydantic model defaults to None → treat as "move to root")
    new_parent_oid = _parse_parent(req.new_parent_id)

    if new_parent_oid is not None:
        if new_parent_oid == item["_id"]:
            raise HTTPException(400, "Cannot move an item into itself")
        parent = await db.filemanager_items.find_one({
            "_id": new_parent_oid,
            "org_id": ObjectId(user["org_id"]),
        })
        if not parent:
            raise HTTPException(404, "Target parent folder not found")
        if parent.get("type") != "folder":
            raise HTTPException(400, "Target parent must be a folder")
        if not _can_read(parent, user):
            raise HTTPException(403, "Not allowed to write to target folder")
        # Force target scope to match the parent's scope for consistency
        target_scope = parent["scope"]

        # Prevent moving a folder into one of its descendants (cycle)
        if item.get("type") == "folder":
            descendants = await _collect_descendants(item["_id"], ObjectId(user["org_id"]))
            if any(d["_id"] == new_parent_oid for d in descendants):
                raise HTTPException(400, "Cannot move a folder into its own descendant")

    updates["parent_id"] = new_parent_oid
    updates["scope"] = target_scope
    updates["updated_at"] = datetime.now(timezone.utc)

    await db.filemanager_items.update_one({"_id": item["_id"]}, {"$set": updates})
    await log_audit(user.get("org_id"), user["id"], "update", "file", item_id)
    updated = await db.filemanager_items.find_one({"_id": item["_id"]})
    return _item_response(updated)


# ── OnlyOffice embed for uploaded docx/xlsx/pptx files ──
import time as _time
import jwt as _pyjwt
import httpx as _httpx
from fastapi import Request as _Request

_OO_JWT_SECRET = os.getenv("ONLYOFFICE_JWT_SECRET", "")
_OO_BACKEND_URL = os.getenv("BACKEND_INTERNAL_URL", "http://backend:8000")
_OO_SUPPORTED_EXT = {"docx", "xlsx", "pptx"}
_OO_DOC_TYPE = {"docx": "word", "xlsx": "cell", "pptx": "slide"}


def _oo_ext_from_item(item: dict) -> Optional[str]:
    name = item.get("name") or ""
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return ext if ext in _OO_SUPPORTED_EXT else None


@router.get("/{item_id}/editor-config")
async def files_editor_config(item_id: str, user=Depends(get_current_user)):
    item = await db.filemanager_items.find_one({
        "_id": _to_oid(item_id),
        "org_id": ObjectId(user["org_id"]),
    })
    if not item:
        raise HTTPException(404, "File not found")
    if item.get("type") != "file" or not item.get("storage_name"):
        raise HTTPException(400, "Item is not an editable file")
    if item.get("sop_id"):
        raise HTTPException(400, "SOP-linked file — open from the SOPs page")
    if not _can_read(item, user):
        raise HTTPException(403, "Not allowed")

    ext = _oo_ext_from_item(item)
    if not ext:
        raise HTTPException(400, "File type not supported by OnlyOffice editor")

    _secret = _OO_JWT_SECRET or "oo-file-fallback-secret"
    file_token = _pyjwt.encode(
        {"item_id": item_id, "exp": int(_time.time()) + 3600},
        _secret,
        algorithm="HS256",
    )

    doc_url = f"{_OO_BACKEND_URL}/api/files/{item_id}/stream?t={file_token}"
    callback_url = f"{_OO_BACKEND_URL}/api/files/{item_id}/onlyoffice-callback"
    doc_key = f"fm_{item_id}_{int(_time.time())}"

    can_edit = _can_mutate(item, user)

    config = {
        "document": {
            "fileType": ext,
            "key": doc_key,
            "title": item["name"],
            "url": doc_url,
            "permissions": {"edit": can_edit, "download": True, "print": True},
        },
        "documentType": _OO_DOC_TYPE[ext],
        "editorConfig": {
            "callbackUrl": callback_url,
            "mode": "edit" if can_edit else "view",
            "user": {
                "id": user["id"],
                "name": user.get("full_name") or user.get("username", "User"),
            },
            "customization": {"autosave": True, "forcesave": True, "compactHeader": True},
        },
        "width": "100%",
        "height": "100%",
    }
    if _OO_JWT_SECRET:
        config["token"] = _pyjwt.encode(config.copy(), _OO_JWT_SECRET, algorithm="HS256")
    return config


@router.get("/{item_id}/stream")
async def files_stream(item_id: str, t: str):
    _secret = _OO_JWT_SECRET or "oo-file-fallback-secret"
    try:
        payload = _pyjwt.decode(t, _secret, algorithms=["HS256"])
        if payload.get("item_id") != item_id:
            raise HTTPException(403, "Token mismatch")
    except _pyjwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")

    item = await db.filemanager_items.find_one({"_id": _to_oid(item_id)})
    if not item or not item.get("storage_name"):
        raise HTTPException(404, "File not found")
    path = FM_ROOT / str(item["org_id"]) / item["storage_name"]
    if not path.exists():
        raise HTTPException(404, "File missing on disk")
    return FileResponse(str(path))


@router.post("/{item_id}/force-save")
async def files_force_save(item_id: str, request: _Request, user=Depends(get_current_user)):
    body = await request.json()
    doc_key = body.get("doc_key")
    if not doc_key:
        raise HTTPException(400, "doc_key required")
    if not _OO_JWT_SECRET:
        raise HTTPException(500, "OnlyOffice JWT not configured")

    item = await db.filemanager_items.find_one({
        "_id": _to_oid(item_id),
        "org_id": ObjectId(user["org_id"]),
    })
    if not item or item.get("type") != "file" or not item.get("storage_name"):
        raise HTTPException(404, "File not found")

    payload = {"c": "forcesave", "key": doc_key, "userdata": user["id"]}
    payload["token"] = _pyjwt.encode({"payload": payload}, _OO_JWT_SECRET, algorithm="HS256")
    oo_internal = os.getenv("ONLYOFFICE_INTERNAL_URL", "http://onlyoffice")
    url = f"{oo_internal}/coauthoring/CommandService.ashx"
    try:
        async with _httpx.AsyncClient() as client:
            resp = await client.post(
                url, json=payload,
                headers={"Authorization": f"Bearer {payload['token']}"},
                timeout=10.0,
            )
            return resp.json() if resp.status_code == 200 else {"error": resp.status_code}
    except Exception as e:
        raise HTTPException(502, f"Force-save failed: {e}")


@router.post("/{item_id}/onlyoffice-callback")
async def files_oo_callback(item_id: str, request: _Request):
    import logging
    logger = logging.getLogger("filemanager.oo_callback")
    body = await request.json()

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
    logger.info("files OO callback item=%s status=%s", item_id, status)

    if status in (2, 6):
        download_url = body.get("url")
        if not download_url:
            return {"error": 1}
        from urllib.parse import urlparse, urlunparse
        parsed = urlparse(download_url)
        if parsed.hostname in ("127.0.0.1", "localhost", "documentserver"):
            download_url = urlunparse(parsed._replace(netloc="onlyoffice"))

        item = await db.filemanager_items.find_one({"_id": _to_oid(item_id)})
        if not item or not item.get("storage_name"):
            return {"error": 1}
        file_path = FM_ROOT / str(item["org_id"]) / item["storage_name"]
        try:
            async with _httpx.AsyncClient(follow_redirects=True) as client:
                resp = await client.get(download_url, timeout=30.0)
                if resp.status_code != 200:
                    logger.error("files OO download failed %s", resp.status_code)
                    return {"error": 1}
                file_path.write_bytes(resp.content)
        except Exception as e:
            logger.exception("files OO download exception: %s", e)
            return {"error": 1}

        now = datetime.now(timezone.utc)
        await db.filemanager_items.update_one(
            {"_id": _to_oid(item_id)},
            {"$set": {"size": len(resp.content), "updated_at": now}},
        )

    return {"error": 0}
