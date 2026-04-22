from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from db import db
from auth_utils import get_current_user
import uuid
import os
from pathlib import Path

router = APIRouter(prefix="/api/stories", tags=["stories"])

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
STORY_TTL_HOURS = 24
MAX_FILE_BYTES = 50 * 1024 * 1024
CHUNK_SIZE = 1024 * 1024
BLOCKED_EXTENSIONS = {".php", ".exe", ".bat", ".sh", ".py", ".js", ".html", ".htm"}
ALLOWED_MIME_PREFIXES = ("image/", "video/")


def _serialize(story):
    story["id"] = str(story["_id"])
    del story["_id"]
    story["user_id"] = str(story["user_id"])
    return story


@router.get("")
async def list_stories(request: Request):
    user = await get_current_user(request)
    now = datetime.now(timezone.utc)
    stories = []
    async for s in db.stories.find(
        {"org_id": user["org_id"], "expires_at": {"$gt": now}},
        sort=[("created_at", 1)],
    ):
        stories.append(_serialize(s))
    return {"stories": stories}


@router.post("")
async def create_text_story(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    text = (body.get("text") or "").strip()
    ciphertext = body.get("ciphertext")  # encrypted story text (Phase 4 E2EE)
    e2ee_keys = body.get("e2ee_keys")   # {user_id: {wrapped, eph_pub}}
    if not text and not ciphertext:
        raise HTTPException(400, "text required")
    bg_color = body.get("bg_color", "#6366f1")
    now = datetime.now(timezone.utc)
    doc = {
        "org_id": user["org_id"],
        "user_id": ObjectId(user["id"]),
        "user_name": user.get("full_name") or user.get("username", ""),
        "user_avatar": user.get("avatar_url", ""),
        "user_initials": ((user.get("full_name") or user.get("username") or "?")[:2]).upper(),
        "type": "text",
        "text": text,
        "ciphertext": ciphertext,
        "e2ee_keys": e2ee_keys or {},
        "bg_color": bg_color,
        "file_url": None,
        "file_type": None,
        "created_at": now,
        "expires_at": now + timedelta(hours=STORY_TTL_HOURS),
        "viewers": [],
    }
    res = await db.stories.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialize(doc)


@router.post("/upload")
async def upload_story(request: Request, file: UploadFile = File(...)):
    user = await get_current_user(request)
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext in BLOCKED_EXTENSIONS:
        raise HTTPException(400, f"File type '{ext}' not allowed")
    content_type = (file.content_type or "").lower()
    if not any(content_type.startswith(p) for p in ALLOWED_MIME_PREFIXES):
        raise HTTPException(400, "Only images and videos allowed")

    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = UPLOADS_DIR / unique_name
    total = 0
    try:
        with open(save_path, "wb") as f:
            while chunk := await file.read(CHUNK_SIZE):
                total += len(chunk)
                if total > MAX_FILE_BYTES:
                    f.close()
                    save_path.unlink(missing_ok=True)
                    raise HTTPException(400, "File too large (max 50 MB)")
                f.write(chunk)
    except HTTPException:
        raise
    except Exception:
        save_path.unlink(missing_ok=True)
        raise HTTPException(500, "Upload failed")

    now = datetime.now(timezone.utc)
    doc = {
        "org_id": user["org_id"],
        "user_id": ObjectId(user["id"]),
        "user_name": user.get("full_name") or user.get("username", ""),
        "user_avatar": user.get("avatar_url", ""),
        "user_initials": ((user.get("full_name") or user.get("username") or "?")[:2]).upper(),
        "type": "image" if content_type.startswith("image/") else "video",
        "text": None,
        "bg_color": None,
        "file_url": f"/uploads/{unique_name}",
        "file_type": content_type,
        "created_at": now,
        "expires_at": now + timedelta(hours=STORY_TTL_HOURS),
        "viewers": [],
    }
    res = await db.stories.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialize(doc)


@router.post("/{story_id}/view")
async def mark_viewed(story_id: str, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(story_id)
    except Exception:
        raise HTTPException(400, "Invalid ID")
    await db.stories.update_one({"_id": oid}, {"$addToSet": {"viewers": user["id"]}})
    return {"ok": True}


@router.delete("/{story_id}")
async def delete_story(story_id: str, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(story_id)
    except Exception:
        raise HTTPException(400, "Invalid ID")
    story = await db.stories.find_one({"_id": oid, "org_id": user["org_id"]})
    if not story:
        raise HTTPException(404, "Not found")
    if str(story["user_id"]) != user["id"] and user.get("system_role") not in ("admin", "manager"):
        raise HTTPException(403, "Not your story")
    await db.stories.delete_one({"_id": oid})
    if story.get("file_url"):
        (Path(__file__).parent.parent / story["file_url"].lstrip("/")).unlink(missing_ok=True)
    return {"ok": True}
