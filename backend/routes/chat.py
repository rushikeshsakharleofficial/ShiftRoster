from fastapi import APIRouter, HTTPException, Request, Query, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from db import db
from auth_utils import get_current_user, create_notification
import uuid
import os
from pathlib import Path

MAX_MESSAGE_LEN = 50_000
UPLOADS_DIR = Path(__file__).parent.parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
MAX_FILE_BYTES = 100 * 1024 * 1024  # 100 MB

router = APIRouter(prefix="/api/chat", tags=["chat"])


# ── Pydantic Models ──

class ChannelCreate(BaseModel):
    name: str
    description: Optional[str] = None
    type: str = "public"  # "public" | "private"


class MessageCreate(BaseModel):
    text: str = ""
    reply_to_id: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    file_type: Optional[str] = None
    is_encrypted: bool = False
    encrypted_keys: Optional[dict] = None
    iv: Optional[str] = None


class MessageEdit(BaseModel):
    text: str


class ReactionToggle(BaseModel):
    emoji: str


class InviteUser(BaseModel):
    user_id: str


class DMCreate(BaseModel):
    user_id: str


# ── Helpers ──

def _serialize_channel(ch):
    if ch is None:
        return None
    result = {}
    for key, val in ch.items():
        if key == "_id":
            result["id"] = str(val)
        elif isinstance(val, ObjectId):
            result[key] = str(val)
        elif isinstance(val, datetime):
            result[key] = val.isoformat()
        elif isinstance(val, list):
            result[key] = [str(v) if isinstance(v, ObjectId) else v for v in val]
        else:
            result[key] = val
    return result


def _serialize_message(msg):
    if msg is None:
        return None
    result = {}
    for key, val in msg.items():
        if key == "_id":
            result["id"] = str(val)
        elif key == "reactions":
            serialized_reactions = []
            for r in (val or []):
                serialized_reactions.append({
                    "emoji": r.get("emoji", ""),
                    "user_ids": [str(u) for u in r.get("user_ids", [])],
                })
            result["reactions"] = serialized_reactions
        elif isinstance(val, ObjectId):
            result[key] = str(val)
        elif isinstance(val, datetime):
            result[key] = val.isoformat()
        else:
            result[key] = val
    return result


async def _get_channel_members(channel_id: str) -> List[str]:
    ch = await db.chat_channels.find_one({"_id": ObjectId(channel_id)})
    if not ch:
        return []
    return [str(m) for m in ch.get("members", [])]


async def _broadcast_chat(user_ids: List[str], payload: dict):
    """Fan-out via WebSocket presence manager."""
    from presence_manager import presence
    await presence.send_to_users(user_ids, payload)


def _user_initials(name: str) -> str:
    parts = name.strip().split()
    if not parts:
        return "?"
    return "".join(p[0] for p in parts[:2]).upper()


def _parse_timer(timer_str: str) -> Optional[timedelta]:
    if not timer_str:
        return None
    try:
        if timer_str.endswith("d"):
            return timedelta(days=int(timer_str[:-1]))
        if timer_str.endswith("h"):
            return timedelta(hours=int(timer_str[:-1]))
        if timer_str.endswith("m"):
            return timedelta(minutes=int(timer_str[:-1]))
    except Exception:
        pass
    return None


# ── Channel Endpoints ──

@router.get("/channels/search")
async def search_channels(request: Request, q: str = Query("")):
    user = await get_current_user(request)
    org_id = user["org_id"]
    user_id = user["id"]

    if not q:
        return {"channels": []}

    # Search public channels by name or description
    query = {
        "org_id": org_id,
        "type": "public",
        "deleted_at": {"$exists": False},
        "$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    }
    
    results = await db.chat_channels.find(query).sort("name", 1).to_list(50)
    
    channels = []
    for ch in results:
        ch_data = _serialize_channel(ch)
        ch_data["is_member"] = user_id in [str(m) for m in ch.get("members", [])]
        channels.append(ch_data)
        
    return {"channels": channels}


@router.get("/channels")
async def list_channels(request: Request):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    # All public channels + private channels where user is member
    public_channels = await db.chat_channels.find({
        "org_id": org_id,
        "type": "public",
        "deleted_at": {"$exists": False},
    }).sort("last_message_at", -1).to_list(200)

    private_channels = await db.chat_channels.find({
        "org_id": org_id,
        "type": "private",
        "members": user_id,
        "deleted_at": {"$exists": False},
    }).sort("last_message_at", -1).to_list(200)

    # Deduplicate (user may be member of public too)
    seen = set()
    channels = []
    for ch in public_channels + private_channels:
        cid = str(ch["_id"])
        if cid not in seen:
            seen.add(cid)
            ch_data = _serialize_channel(ch)
            ch_data["is_member"] = user_id in [str(m) for m in ch.get("members", [])]
            channels.append(ch_data)

    # Attach unread counts
    channel_ids = [ch["id"] for ch in channels]
    read_receipts = {}
    if channel_ids:
        receipts = await db.chat_read_receipts.find({
            "channel_id": {"$in": channel_ids},
            "user_id": user_id,
        }).to_list(1000)
        read_receipts = {r["channel_id"]: r for r in receipts}

    for ch in channels:
        receipt = read_receipts.get(ch["id"])
        if receipt and receipt.get("last_read_at"):
            unread = await db.chat_messages.count_documents({
                "channel_id": ch["id"],
                "created_at": {"$gt": receipt["last_read_at"]},
                "deleted_at": {"$exists": False},
                "sender_id": {"$ne": user_id},
            })
        else:
            unread = await db.chat_messages.count_documents({
                "channel_id": ch["id"],
                "deleted_at": {"$exists": False},
                "sender_id": {"$ne": user_id},
            })
        ch["unread_count"] = unread

    return {"channels": channels}


@router.post("/channels")
async def create_channel(data: ChannelCreate, request: Request):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    if data.type not in ("public", "private"):
        raise HTTPException(400, "type must be 'public' or 'private'")

    name = data.name.strip().lower().replace(" ", "-")
    if not name:
        raise HTTPException(400, "Channel name is required")

    # Check duplicate name within org
    existing = await db.chat_channels.find_one({
        "org_id": org_id,
        "name": name,
        "type": {"$in": ["public", "private"]},
        "deleted_at": {"$exists": False},
    })
    if existing:
        raise HTTPException(400, f"Channel '{name}' already exists")

    now = datetime.now(timezone.utc)
    result = await db.chat_channels.insert_one({
        "org_id": org_id,
        "name": name,
        "description": data.description or "",
        "type": data.type,
        "created_by": user_id,
        "members": [user_id],
        "admins": [user_id],
        "created_at": now,
        "updated_at": now,
        "last_message_at": now,
        "last_message_preview": "",
        "message_count": 0,
    })

    # System message
    await db.chat_messages.insert_one({
        "org_id": org_id,
        "channel_id": str(result.inserted_id),
        "sender_id": user_id,
        "sender_name": user.get("full_name", ""),
        "sender_initials": _user_initials(user.get("full_name", "")),
        "sender_avatar": user.get("avatar_url", ""),
        "text": f"{user.get('full_name', 'Someone')} created the channel",
        "type": "system",
        "reactions": [],
        "reply_to": None,
        "created_at": now,
    })

    ch = await db.chat_channels.find_one({"_id": result.inserted_id})
    ch_data = _serialize_channel(ch)
    ch_data["is_member"] = True
    ch_data["unread_count"] = 0
    return ch_data


@router.get("/channels/{channel_id}")
async def get_channel(channel_id: str, request: Request):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    ch = await db.chat_channels.find_one({
        "_id": ObjectId(channel_id),
        "org_id": org_id,
        "deleted_at": {"$exists": False},
    })
    if not ch:
        raise HTTPException(404, "Channel not found")

    members = [str(m) for m in ch.get("members", [])]
    if ch["type"] == "private" and user_id not in members:
        raise HTTPException(403, "Not a member of this channel")

    ch_data = _serialize_channel(ch)
    ch_data["is_member"] = user_id in members
    return ch_data


@router.post("/channels/{channel_id}/join")
async def join_channel(channel_id: str, request: Request):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    ch = await db.chat_channels.find_one({
        "_id": ObjectId(channel_id),
        "org_id": org_id,
        "deleted_at": {"$exists": False},
    })
    if not ch:
        raise HTTPException(404, "Channel not found")
    if ch["type"] != "public":
        raise HTTPException(403, "Cannot join a private channel without an invite")

    members = [str(m) for m in ch.get("members", [])]
    if user_id in members:
        return {"message": "Already a member"}

    now = datetime.now(timezone.utc)
    await db.chat_channels.update_one(
        {"_id": ObjectId(channel_id)},
        {"$addToSet": {"members": user_id}, "$set": {"updated_at": now}},
    )

    # System message
    await db.chat_messages.insert_one({
        "org_id": org_id,
        "channel_id": channel_id,
        "sender_id": user_id,
        "sender_name": user.get("full_name", ""),
        "sender_initials": _user_initials(user.get("full_name", "")),
        "sender_avatar": user.get("avatar_url", ""),
        "text": f"{user.get('full_name', 'Someone')} joined the channel",
        "type": "system",
        "reactions": [],
        "reply_to": None,
        "created_at": now,
    })

    return {"message": "Joined successfully"}


@router.post("/channels/{channel_id}/leave")
async def leave_channel(channel_id: str, request: Request):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    ch = await db.chat_channels.find_one({
        "_id": ObjectId(channel_id),
        "org_id": org_id,
        "deleted_at": {"$exists": False},
    })
    if not ch:
        raise HTTPException(404, "Channel not found")

    now = datetime.now(timezone.utc)
    await db.chat_channels.update_one(
        {"_id": ObjectId(channel_id)},
        {"$pull": {"members": user_id}, "$set": {"updated_at": now}},
    )

    # Check if last member left a private channel
    if ch["type"] == "private":
        updated_ch = await db.chat_channels.find_one({"_id": ObjectId(channel_id)})
        if updated_ch and not updated_ch.get("members"):
            await db.chat_channels.update_one(
                {"_id": ObjectId(channel_id)},
                {"$set": {"deleted_at": now}}
            )
            return {"message": "Left and channel closed (no more members)"}

    await db.chat_messages.insert_one({
        "org_id": org_id,
        "channel_id": channel_id,
        "sender_id": user_id,
        "sender_name": user.get("full_name", ""),
        "sender_initials": _user_initials(user.get("full_name", "")),
        "text": f"{user.get('full_name', 'Someone')} left the channel",
        "type": "system",
        "reactions": [],
        "reply_to": None,
        "created_at": now,
    })

    return {"message": "Left channel"}


class MuteChannelRequest(BaseModel):
    is_muted: bool


@router.post("/channels/{channel_id}/mute")
async def mute_channel(channel_id: str, data: MuteChannelRequest, request: Request):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    await db.chat_muted_channels.update_one(
        {"channel_id": channel_id, "user_id": user_id, "org_id": org_id},
        {"$set": {"is_muted": data.is_muted, "updated_at": datetime.now(timezone.utc)}},
        upsert=True
    )

    return {"message": "Preference updated", "is_muted": data.is_muted}


@router.post("/channels/{channel_id}/invite")
async def invite_to_channel(channel_id: str, data: InviteUser, request: Request):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    ch = await db.chat_channels.find_one({
        "_id": ObjectId(channel_id),
        "org_id": org_id,
        "deleted_at": {"$exists": False},
    })
    if not ch:
        raise HTTPException(404, "Channel not found")

    admins = [str(a) for a in ch.get("admins", [])]
    if user_id not in admins and user.get("system_role") != "admin":
        raise HTTPException(403, "Only channel admins can invite members")

    # Validate the invited user exists and is in the same org
    invitee = await db.users.find_one({"_id": ObjectId(data.user_id), "org_id": org_id})
    if not invitee:
        raise HTTPException(404, "User not found")

    now = datetime.now(timezone.utc)
    await db.chat_channels.update_one(
        {"_id": ObjectId(channel_id)},
        {"$addToSet": {"members": data.user_id}, "$set": {"updated_at": now}},
    )

    invitee_name = invitee.get("full_name", "Someone")
    await db.chat_messages.insert_one({
        "org_id": org_id,
        "channel_id": channel_id,
        "sender_id": user_id,
        "sender_name": user.get("full_name", ""),
        "sender_initials": _user_initials(user.get("full_name", "")),
        "text": f"{user.get('full_name', 'Someone')} added {invitee_name} to the channel",
        "type": "system",
        "reactions": [],
        "reply_to": None,
        "created_at": now,
    })

    # Notify the invitee via WS
    updated_ch = await db.chat_channels.find_one({"_id": ObjectId(channel_id)})
    ch_data = _serialize_channel(updated_ch)
    ch_data["is_member"] = True
    ch_data["unread_count"] = 0
    await _broadcast_chat([data.user_id], {
        "type": "chat_channel_added",
        "channel": ch_data,
    })

    return {"message": "User invited"}


@router.get("/channels/{channel_id}/members")
async def get_channel_members(channel_id: str, request: Request):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    ch = await db.chat_channels.find_one({
        "_id": ObjectId(channel_id),
        "org_id": org_id,
        "deleted_at": {"$exists": False},
    })
    if not ch:
        raise HTTPException(404, "Channel not found")

    members = [str(m) for m in ch.get("members", [])]
    if ch["type"] == "private" and user_id not in members:
        raise HTTPException(403, "Not a member")

    # Fetch user details
    from presence_manager import presence
    online_ids = set(presence.connections.keys())

    member_docs = await db.users.find(
        {"_id": {"$in": [ObjectId(m) for m in members]}, "org_id": org_id},
        {"password_hash": 0},
    ).to_list(500)

    result = []
    for m in member_docs:
        mid = str(m["_id"])
        result.append({
            "id": mid,
            "full_name": m.get("full_name", ""),
            "initials": _user_initials(m.get("full_name", "")),
            "avatar_url": m.get("avatar_url", ""),
            "system_role": m.get("system_role", ""),
            "is_online": mid in online_ids,
            "is_admin": mid in [str(a) for a in ch.get("admins", [])],
        })

    return {"members": result}


# ── Channel Messages ──

@router.get("/channels/{channel_id}/messages")
async def get_channel_messages(
    channel_id: str,
    request: Request,
    before: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    ch = await db.chat_channels.find_one({
        "_id": ObjectId(channel_id),
        "org_id": org_id,
        "deleted_at": {"$exists": False},
    })
    if not ch:
        raise HTTPException(404, "Channel not found")

    members = [str(m) for m in ch.get("members", [])]
    if ch["type"] == "private" and user_id not in members:
        raise HTTPException(403, "Not a member")

    query = {"channel_id": channel_id}
    if before:
        try:
            before_doc = await db.chat_messages.find_one({"_id": ObjectId(before)})
            if before_doc:
                query["created_at"] = {"$lt": before_doc["created_at"]}
        except Exception:
            pass

    messages = await db.chat_messages.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    messages.reverse()

    return {"messages": [_serialize_message(m) for m in messages]}


@router.post("/channels/{channel_id}/messages")
async def send_channel_message(channel_id: str, data: MessageCreate, request: Request):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    ch = await db.chat_channels.find_one({
        "_id": ObjectId(channel_id),
        "org_id": org_id,
        "deleted_at": {"$exists": False},
    })
    if not ch:
        raise HTTPException(404, "Channel not found")

    members = [str(m) for m in ch.get("members", [])]
    if ch["type"] == "private" and user_id not in members:
        raise HTTPException(403, "Not a member of this channel")
    if ch["type"] == "public" and user_id not in members:
        # Auto-join public channels on send
        now_join = datetime.now(timezone.utc)
        await db.chat_channels.update_one(
            {"_id": ObjectId(channel_id)},
            {"$addToSet": {"members": user_id}, "$set": {"updated_at": now_join}},
        )
        members.append(user_id)

    text = data.text.strip()
    if len(text) > MAX_MESSAGE_LEN:
        raise HTTPException(400, f"Message too long (max {MAX_MESSAGE_LEN:,} characters)")
    if not text and not data.file_url:
        raise HTTPException(400, "Message text or file is required")

    # Resolve reply
    reply_to = None
    if data.reply_to_id:
        try:
            reply_doc = await db.chat_messages.find_one({"_id": ObjectId(data.reply_to_id)})
            if reply_doc:
                reply_to = {
                    "id": str(reply_doc["_id"]),
                    "sender_name": reply_doc.get("sender_name", ""),
                    "text": (reply_doc.get("text", "")[:100] + "...") if len(reply_doc.get("text", "")) > 100 else reply_doc.get("text", ""),
                }
        except Exception:
            pass

    now = datetime.now(timezone.utc)
    
    # Calculate expires_at for disappearing mode
    expires_at = None
    try:
        org = await db.organizations.find_one({"_id": ObjectId(org_id)})
        chat_features = org.get("chat_features", {})
        if chat_features.get("disappearing_mode_enabled"):
            timer = _parse_timer(user.get("disappearing_timer"))
            if timer:
                expires_at = now + timer
    except Exception:
        pass

    msg_doc = {
        "org_id": org_id,
        "channel_id": channel_id,
        "sender_id": user_id,
        "sender_name": user.get("full_name", ""),
        "sender_initials": _user_initials(user.get("full_name", "")),
        "sender_avatar": user.get("avatar_url", ""),
        "text": text,
        "type": "file" if data.file_url and not text else "text",
        "reply_to": reply_to,
        "reactions": [],
        "is_encrypted": data.is_encrypted,
        "encrypted_keys": data.encrypted_keys,
        "iv": data.iv,
        "created_at": now,
    }
    if expires_at:
        msg_doc["expires_at"] = expires_at

    if data.file_url:
        msg_doc["file_url"] = data.file_url
        msg_doc["file_name"] = data.file_name or ""
        msg_doc["file_size"] = data.file_size or 0
        msg_doc["file_type"] = data.file_type or ""

    result = await db.chat_messages.insert_one(msg_doc)
    msg_doc["_id"] = result.inserted_id

    preview = data.file_name or text
    await db.chat_channels.update_one(
        {"_id": ObjectId(channel_id)},
        {
            "$set": {
                "last_message_at": now,
                "last_message_preview": preview[:80],
                "updated_at": now,
            },
            "$inc": {"message_count": 1},
        },
    )

    serialized = _serialize_message(msg_doc)

    # Fan-out to all channel members via WebSocket
    ch_updated = await db.chat_channels.find_one({"_id": ObjectId(channel_id)})
    all_members = [str(m) for m in ch_updated.get("members", [])]
    await _broadcast_chat(all_members, {
        "type": "chat_new_message",
        "channel_id": channel_id,
        "message": serialized,
    })

    # ── @all / @anyone mention notifications ──
    sender_name = user.get("full_name", "Someone")
    ch_name = ch_updated.get("name", "a channel")
    notif_title = f"@mention in #{ch_name}"
    notif_body = f"{sender_name}: {text[:120]}" if text else f"{sender_name} shared a file"

    if "@all" in text:
        # Notify every org member except sender
        async for u in db.users.find({"org_id": org_id, "status": "active"}, {"_id": 1}):
            uid = str(u["_id"])
            if uid != user_id:
                await create_notification(uid, "mention", notif_title, notif_body, org_id)
    elif "@anyone" in text:
        # Notify only currently online org members except sender
        from presence_manager import presence
        online_ids = set(presence.connections.keys())
        for uid in online_ids:
            if uid != user_id:
                u_doc = await db.users.find_one({"_id": ObjectId(uid), "org_id": org_id}, {"_id": 1})
                if u_doc:
                    await create_notification(uid, "mention", notif_title, notif_body, org_id)
    else:
        # Parse @username mentions
        import re as _re
        mentioned_usernames = set(_re.findall(r"@([\w.]+)", text))
        mentioned_usernames.discard("all")
        mentioned_usernames.discard("anyone")
        for uname in mentioned_usernames:
            u_doc = await db.users.find_one({"username": uname, "org_id": org_id}, {"_id": 1})
            if u_doc:
                uid = str(u_doc["_id"])
                if uid != user_id:
                    await create_notification(uid, "mention", notif_title, notif_body, org_id)

    return serialized


# ── Message Edit / Delete / React ──

@router.put("/messages/{message_id}")
async def edit_message(message_id: str, data: MessageEdit, request: Request):
    user = await get_current_user(request)
    user_id = user["id"]

    msg = await db.chat_messages.find_one({"_id": ObjectId(message_id)})
    if not msg:
        raise HTTPException(404, "Message not found")
    if str(msg["sender_id"]) != user_id:
        raise HTTPException(403, "Cannot edit others' messages")
    if msg.get("deleted_at"):
        raise HTTPException(400, "Cannot edit a deleted message")

    text = data.text.strip()
    if not text:
        raise HTTPException(400, "Message text is required")

    now = datetime.now(timezone.utc)
    await db.chat_messages.update_one(
        {"_id": ObjectId(message_id)},
        {"$set": {"text": text, "edited_at": now}},
    )

    updated = await db.chat_messages.find_one({"_id": ObjectId(message_id)})
    serialized = _serialize_message(updated)

    members = await _get_channel_members(msg["channel_id"])
    await _broadcast_chat(members, {
        "type": "chat_message_updated",
        "channel_id": msg["channel_id"],
        "message": serialized,
    })

    return serialized


@router.delete("/messages/{message_id}")
async def delete_message(message_id: str, request: Request):
    user = await get_current_user(request)
    user_id = user["id"]

    msg = await db.chat_messages.find_one({"_id": ObjectId(message_id)})
    if not msg:
        raise HTTPException(404, "Message not found")

    is_channel_admin = False
    ch = await db.chat_channels.find_one({"_id": ObjectId(msg["channel_id"])})
    if ch:
        is_channel_admin = user_id in [str(a) for a in ch.get("admins", [])]

    if str(msg["sender_id"]) != user_id and not is_channel_admin and user.get("system_role") != "admin":
        raise HTTPException(403, "Cannot delete others' messages")

    now = datetime.now(timezone.utc)
    await db.chat_messages.update_one(
        {"_id": ObjectId(message_id)},
        {"$set": {"deleted_at": now, "text": ""}},
    )

    updated = await db.chat_messages.find_one({"_id": ObjectId(message_id)})
    serialized = _serialize_message(updated)

    members = await _get_channel_members(msg["channel_id"])
    await _broadcast_chat(members, {
        "type": "chat_message_updated",
        "channel_id": msg["channel_id"],
        "message": serialized,
    })

    return {"message": "Deleted"}


@router.post("/messages/{message_id}/react")
async def toggle_reaction(message_id: str, data: ReactionToggle, request: Request):
    user = await get_current_user(request)
    user_id = user["id"]

    msg = await db.chat_messages.find_one({"_id": ObjectId(message_id)})
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg.get("deleted_at"):
        raise HTTPException(400, "Cannot react to a deleted message")

    reactions = msg.get("reactions", [])
    emoji = data.emoji

    # Find existing reaction bucket
    found = False
    new_reactions = []
    for r in reactions:
        if r["emoji"] == emoji:
            found = True
            uids = [str(u) for u in r.get("user_ids", [])]
            if user_id in uids:
                uids.remove(user_id)
            else:
                uids.append(user_id)
            if uids:
                new_reactions.append({"emoji": emoji, "user_ids": uids})
        else:
            new_reactions.append(r)

    if not found:
        new_reactions.append({"emoji": emoji, "user_ids": [user_id]})

    await db.chat_messages.update_one(
        {"_id": ObjectId(message_id)},
        {"$set": {"reactions": new_reactions}},
    )

    updated = await db.chat_messages.find_one({"_id": ObjectId(message_id)})
    serialized = _serialize_message(updated)

    members = await _get_channel_members(msg["channel_id"])
    await _broadcast_chat(members, {
        "type": "chat_message_updated",
        "channel_id": msg["channel_id"],
        "message": serialized,
    })

    return serialized


# ── Direct Messages ──

async def _get_or_create_dm(org_id: str, user_a: str, user_b: str):
    """Get existing DM channel or create a new one between two users."""
    # Look for an existing DM between exactly these two users
    dm = await db.chat_channels.find_one({
        "org_id": org_id,
        "type": "dm",
        "members": {"$all": [user_a, user_b], "$size": 2},
        "deleted_at": {"$exists": False},
    })
    if dm:
        return dm

    now = datetime.now(timezone.utc)
    result = await db.chat_channels.insert_one({
        "org_id": org_id,
        "name": f"dm_{user_a}_{user_b}",
        "description": "",
        "type": "dm",
        "created_by": user_a,
        "members": [user_a, user_b],
        "admins": [],
        "created_at": now,
        "updated_at": now,
        "last_message_at": now,
        "last_message_preview": "",
        "message_count": 0,
    })
    return await db.chat_channels.find_one({"_id": result.inserted_id})


@router.get("/dms")
async def list_dms(request: Request):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    dms = await db.chat_channels.find({
        "org_id": org_id,
        "type": "dm",
        "members": user_id,
        "deleted_at": {"$exists": False},
    }).sort("last_message_at", -1).to_list(200)

    from presence_manager import presence
    online_ids = set(presence.connections.keys())

    result = []
    for dm in dms:
        members = [str(m) for m in dm.get("members", [])]
        other_id = next((m for m in members if m != user_id), None)
        other_user = None
        if other_id:
            other_doc = await db.users.find_one(
                {"_id": ObjectId(other_id)},
                {"password_hash": 0},
            )
            if other_doc:
                other_user = {
                    "id": str(other_doc["_id"]),
                    "full_name": other_doc.get("full_name", ""),
                    "initials": _user_initials(other_doc.get("full_name", "")),
                    "avatar_url": other_doc.get("avatar_url", ""),
                    "is_online": str(other_doc["_id"]) in online_ids,
                }

        # Unread count
        receipt = await db.chat_read_receipts.find_one({
            "channel_id": str(dm["_id"]),
            "user_id": user_id,
        })
        if receipt and receipt.get("last_read_at"):
            unread = await db.chat_messages.count_documents({
                "channel_id": str(dm["_id"]),
                "created_at": {"$gt": receipt["last_read_at"]},
                "deleted_at": {"$exists": False},
                "sender_id": {"$ne": user_id},
            })
        else:
            unread = await db.chat_messages.count_documents({
                "channel_id": str(dm["_id"]),
                "deleted_at": {"$exists": False},
                "sender_id": {"$ne": user_id},
            })

        dm_data = _serialize_channel(dm)
        dm_data["other_user"] = other_user
        dm_data["unread_count"] = unread
        result.append(dm_data)

    return {"dms": result}


@router.post("/dms")
async def open_dm(data: DMCreate, request: Request):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    if data.user_id == user_id:
        raise HTTPException(400, "Cannot DM yourself")

    other = await db.users.find_one({"_id": ObjectId(data.user_id), "org_id": org_id})
    if not other:
        raise HTTPException(404, "User not found")

    from presence_manager import presence
    online_ids = set(presence.connections.keys())

    dm = await _get_or_create_dm(org_id, user_id, data.user_id)
    dm_data = _serialize_channel(dm)
    dm_data["other_user"] = {
        "id": str(other["_id"]),
        "full_name": other.get("full_name", ""),
        "initials": _user_initials(other.get("full_name", "")),
        "avatar_url": other.get("avatar_url", ""),
        "is_online": str(other["_id"]) in online_ids,
    }
    dm_data["unread_count"] = 0
    return dm_data


@router.get("/dms/{dm_id}/messages")
async def get_dm_messages(
    dm_id: str,
    request: Request,
    before: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    dm = await db.chat_channels.find_one({
        "_id": ObjectId(dm_id),
        "org_id": org_id,
        "type": "dm",
        "members": user_id,
        "deleted_at": {"$exists": False},
    })
    if not dm:
        raise HTTPException(404, "DM not found")

    query = {"channel_id": dm_id}
    if before:
        try:
            before_doc = await db.chat_messages.find_one({"_id": ObjectId(before)})
            if before_doc:
                query["created_at"] = {"$lt": before_doc["created_at"]}
        except Exception:
            pass

    messages = await db.chat_messages.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    messages.reverse()

    return {"messages": [_serialize_message(m) for m in messages]}


@router.post("/dms/{dm_id}/messages")
async def send_dm_message(dm_id: str, data: MessageCreate, request: Request):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    dm = await db.chat_channels.find_one({
        "_id": ObjectId(dm_id),
        "org_id": org_id,
        "type": "dm",
        "members": user_id,
        "deleted_at": {"$exists": False},
    })
    if not dm:
        raise HTTPException(404, "DM not found")

    text = data.text.strip()
    if len(text) > MAX_MESSAGE_LEN:
        raise HTTPException(400, f"Message too long (max {MAX_MESSAGE_LEN:,} characters)")
    if not text and not data.file_url:
        raise HTTPException(400, "Message text or file is required")

    reply_to = None
    if data.reply_to_id:
        try:
            reply_doc = await db.chat_messages.find_one({"_id": ObjectId(data.reply_to_id)})
            if reply_doc:
                reply_to = {
                    "id": str(reply_doc["_id"]),
                    "sender_name": reply_doc.get("sender_name", ""),
                    "text": (reply_doc.get("text", "")[:100] + "...") if len(reply_doc.get("text", "")) > 100 else reply_doc.get("text", ""),
                }
        except Exception:
            pass

    now = datetime.now(timezone.utc)
    
    # Calculate expires_at for disappearing mode
    expires_at = None
    try:
        org = await db.organizations.find_one({"_id": ObjectId(org_id)})
        chat_features = org.get("chat_features", {})
        if chat_features.get("disappearing_mode_enabled"):
            timer = _parse_timer(user.get("disappearing_timer"))
            if timer:
                expires_at = now + timer
    except Exception:
        pass

    msg_doc = {
        "org_id": org_id,
        "channel_id": dm_id,
        "sender_id": user_id,
        "sender_name": user.get("full_name", ""),
        "sender_initials": _user_initials(user.get("full_name", "")),
        "sender_avatar": user.get("avatar_url", ""),
        "text": text,
        "type": "file" if data.file_url and not text else "text",
        "reply_to": reply_to,
        "reactions": [],
        "is_encrypted": data.is_encrypted,
        "encrypted_keys": data.encrypted_keys,
        "iv": data.iv,
        "created_at": now,
    }
    if expires_at:
        msg_doc["expires_at"] = expires_at

    if data.file_url:
        msg_doc["file_url"] = data.file_url
        msg_doc["file_name"] = data.file_name or ""
        msg_doc["file_size"] = data.file_size or 0
        msg_doc["file_type"] = data.file_type or ""

    result = await db.chat_messages.insert_one(msg_doc)
    msg_doc["_id"] = result.inserted_id

    preview = data.file_name or text
    await db.chat_channels.update_one(
        {"_id": ObjectId(dm_id)},
        {
            "$set": {
                "last_message_at": now,
                "last_message_preview": preview[:80],
                "updated_at": now,
            },
            "$inc": {"message_count": 1},
        },
    )

    serialized = _serialize_message(msg_doc)

    members = [str(m) for m in dm.get("members", [])]
    await _broadcast_chat(members, {
        "type": "chat_new_message",
        "channel_id": dm_id,
        "message": serialized,
    })

    return serialized


# ── Read Receipts ──

@router.post("/channels/{channel_id}/read")
async def mark_channel_read(channel_id: str, request: Request):
    user = await get_current_user(request)
    user_id = user["id"]

    now = datetime.now(timezone.utc)
    await db.chat_read_receipts.update_one(
        {"channel_id": channel_id, "user_id": user_id},
        {"$set": {"last_read_at": now, "updated_at": now}},
        upsert=True,
    )
    return {"message": "Marked as read"}


@router.post("/dms/{dm_id}/read")
async def mark_dm_read(dm_id: str, request: Request):
    user = await get_current_user(request)
    user_id = user["id"]

    now = datetime.now(timezone.utc)
    await db.chat_read_receipts.update_one(
        {"channel_id": dm_id, "user_id": user_id},
        {"$set": {"last_read_at": now, "updated_at": now}},
        upsert=True,
    )
    return {"message": "Marked as read"}


@router.get("/unread")
async def get_unread_counts(request: Request):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    # All channels + DMs user is in
    all_channels = await db.chat_channels.find({
        "org_id": org_id,
        "members": user_id,
        "deleted_at": {"$exists": False},
    }).to_list(500)

    receipts = await db.chat_read_receipts.find({"user_id": user_id}).to_list(1000)
    receipt_map = {r["channel_id"]: r for r in receipts}

    counts = {}
    total = 0
    for ch in all_channels:
        cid = str(ch["_id"])
        receipt = receipt_map.get(cid)
        if receipt and receipt.get("last_read_at"):
            n = await db.chat_messages.count_documents({
                "channel_id": cid,
                "created_at": {"$gt": receipt["last_read_at"]},
                "deleted_at": {"$exists": False},
                "sender_id": {"$ne": user_id},
            })
        else:
            n = await db.chat_messages.count_documents({
                "channel_id": cid,
                "deleted_at": {"$exists": False},
                "sender_id": {"$ne": user_id},
            })
        counts[cid] = n
        total += n

    return {"counts": counts, "total": total}


# ── Users for DM picker / invite ──

@router.get("/users")
async def list_chat_users(request: Request, q: Optional[str] = Query(None)):
    user = await get_current_user(request)
    user_id = user["id"]
    org_id = user["org_id"]

    from presence_manager import presence
    online_ids = set(presence.connections.keys())

    query: dict = {"org_id": org_id, "status": "active"}
    if q:
        import re
        escaped = re.escape(q)
        query["$or"] = [
            {"full_name": {"$regex": escaped, "$options": "i"}},
            {"username": {"$regex": escaped, "$options": "i"}},
        ]

    users = await db.users.find(query, {"password_hash": 0}).to_list(200)
    result = []
    for u in users:
        uid = str(u["_id"])
        if uid == user_id:
            continue
        result.append({
            "id": uid,
            "full_name": u.get("full_name", ""),
            "username": u.get("username", ""),
            "initials": _user_initials(u.get("full_name", "")),
            "avatar_url": u.get("avatar_url", ""),
            "system_role": u.get("system_role", ""),
            "is_online": uid in online_ids,
        })

    return {"users": result}


# ── @mention Autocomplete ──

@router.get("/mention-users")
async def mention_users(request: Request, q: Optional[str] = Query("")):
    """Returns users matching a username/name prefix for @mention autocomplete."""
    user = await get_current_user(request)
    org_id = user["org_id"]
    user_id = user["id"]

    import re as _re
    query: dict = {"org_id": org_id, "status": "active"}
    if q:
        escaped = _re.escape(q)
        query["$or"] = [
            {"username": {"$regex": f"^{escaped}", "$options": "i"}},
            {"full_name": {"$regex": escaped, "$options": "i"}},
        ]

    users = await db.users.find(query, {"password_hash": 0}).to_list(20)
    result = []
    for u in users:
        uid = str(u["_id"])
        if uid == user_id:
            continue
        result.append({
            "id": uid,
            "username": u.get("username", ""),
            "full_name": u.get("full_name", ""),
            "avatar_url": u.get("avatar_url", ""),
            "initials": _user_initials(u.get("full_name", "")),
        })
    return {"users": result}


# ── File Upload ──

@router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...)):
    """Upload a file attachment (max 100 MB). Returns {url, file_name, file_size, file_type}."""
    user = await get_current_user(request)

    if not file.filename:
        raise HTTPException(400, "No file provided")

    # Read file and check size
    content = await file.read(MAX_FILE_BYTES + 1)
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(400, "File too large (max 100 MB)")

    # Generate unique filename preserving extension
    ext = os.path.splitext(file.filename)[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = UPLOADS_DIR / unique_name

    with open(save_path, "wb") as f:
        f.write(content)

    file_url = f"/uploads/{unique_name}"
    return {
        "url": file_url,
        "file_name": file.filename,
        "file_size": len(content),
        "file_type": file.content_type or "application/octet-stream",
    }
