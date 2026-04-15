from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from db import db, client
from auth_utils import hash_password, verify_password, serialize_doc, generate_unique_username
from datetime import datetime, timezone
from bson import ObjectId
import os
import logging
import json
import asyncio
from pathlib import Path

# Ensure uploads directory exists
UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

# Import routers
from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.departments import router as departments_router
from routes.manager_groups import router as manager_groups_router
from routes.shifts import router as shifts_router
from routes.leave import router as leave_router
from routes.operations import router as operations_router
from routes.sticky_notes import router as sticky_notes_router
from routes.chat import router as chat_router

app = FastAPI(title="ShiftRoster API", version="2.0.0")

# CORS - use permissive CORS since auth is via Bearer tokens
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded files
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Include all routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(departments_router)
app.include_router(manager_groups_router)
app.include_router(shifts_router)
app.include_router(leave_router)
app.include_router(operations_router)
app.include_router(sticky_notes_router)
app.include_router(chat_router)

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ── Health Check ──
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "ShiftRoster"}


# ── Setup (First-time SuperAdmin) ──

class SetupRequest(BaseModel):
    org_name: str
    admin_name: str
    admin_email: str
    admin_password: str
    timezone: str = "Asia/Kolkata"
    brand_name: Optional[str] = None
    logo_url: Optional[str] = None


@app.get("/api/setup/status")
async def setup_status():
    """Check if initial setup is needed (no users exist)."""
    user_count = await db.users.count_documents({})
    return {"setup_required": user_count == 0}


@app.post("/api/setup")
async def initial_setup(data: SetupRequest):
    """First-time SuperAdmin setup. Only works when database has zero users."""
    user_count = await db.users.count_documents({})
    if user_count > 0:
        raise HTTPException(status_code=403, detail="Setup already completed. System already has users.")

    email = data.admin_email.strip().lower()
    if len(data.admin_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Create organization
    org_result = await db.organizations.insert_one({
        "name": data.org_name,
        "brand_name": data.brand_name or data.org_name,
        "logo_url": data.logo_url or "",
        "timezone": data.timezone,
        "locale": "en-IN",
        "currency": "INR",
        "work_week_start": 1,
        "overtime_daily_threshold": 8,
        "overtime_weekly_threshold": 40,
        "mfa_org_mandate": False,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    })
    org_id = str(org_result.inserted_id)

    # Create SuperAdmin user
    admin_username = await generate_unique_username(email.split("@")[0], db)
    now = datetime.now(timezone.utc)
    admin_result = await db.users.insert_one({
        "org_id": org_id,
        "email": email,
        "username": admin_username,
        "password_hash": hash_password(data.admin_password),
        "full_name": data.admin_name,
        "phone": "",
        "avatar_url": "",
        "system_role": "admin",
        "employee_level": None,
        "department_id": None,
        "position_id": None,
        "hourly_rate": None,
        "employment_type": "full_time",
        "skills": [],
        "status": "active",
        "mfa_enabled": False,
        "mfa_mandated": False,
        "mfa_secret": None,
        "created_at": now,
        "updated_at": now,
    })
    admin_id = str(admin_result.inserted_id)

    # Create default #general channel
    await db.chat_channels.insert_one({
        "org_id": org_id,
        "name": "general",
        "description": "Company-wide announcements and conversations",
        "type": "public",
        "created_by": admin_id,
        "members": [admin_id],
        "admins": [admin_id],
        "created_at": now,
        "updated_at": now,
        "last_message_at": now,
        "last_message_preview": "",
        "message_count": 0,
    })

    # Seed demo departments
    demo_depts = [
        {"name": "Engineering", "color_hex": "#10B981"},
        {"name": "Operations", "color_hex": "#F59E0B"},
        {"name": "Support", "color_hex": "#3B82F6"},
        {"name": "Management", "color_hex": "#6366F1"},
    ]
    for d in demo_depts:
        await db.departments.insert_one({
            "org_id": org_id,
            "name": d["name"],
            "color_hex": d["color_hex"],
            "created_at": datetime.now(timezone.utc),
        })

    logger.info(f"Initial setup completed: org={data.org_name}, admin={email}")
    return {"message": "Setup completed successfully", "org_id": org_id}


# ── WebSocket Presence ──
from presence_manager import presence


@app.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    user_id = None
    try:
        # Wait for auth message
        auth_msg = await asyncio.wait_for(ws.receive_text(), timeout=10)
        auth_data = json.loads(auth_msg)
        user_id = auth_data.get("user_id")
        if not user_id:
            await ws.close()
            return

        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
        if not user:
            await ws.close()
            return

        user_info = serialize_doc(user)

        # Auto-detect initial status: check for approved leave today
        initial_status = "active"
        try:
            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            leave = await db.leave_requests.find_one({
                "user_id": user_id,
                "status": "approved",
                "start_date": {"$lte": today_str},
                "end_date": {"$gte": today_str},
            })
            if leave:
                initial_status = "leave"
        except Exception:
            pass

        presence.connections[user_id] = ws
        presence.user_data[user_id] = {
            "id": user_id,
            "name": user_info.get("full_name", ""),
            "username": user_info.get("username", ""),
            "avatar": user_info.get("avatar_url", ""),
            "department_id": user_info.get("department_id", ""),
            "system_role": user_info.get("system_role", ""),
            "view": "",
            "status": initial_status,
            "last_seen": datetime.now(timezone.utc).isoformat(),
        }
        await presence.broadcast_presence()

        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "heartbeat":
                await presence.heartbeat(user_id, msg)
            elif msg.get("type") == "set_status":
                await presence.set_status(user_id, msg.get("status", "active"))
            elif msg.get("type") == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
            elif msg.get("type") == "chat_typing":
                channel_id = msg.get("channel_id", "")
                user_name = msg.get("user_name", "")
                is_typing = msg.get("is_typing", True)
                if channel_id:
                    try:
                        ch = await db.chat_channels.find_one({"_id": ObjectId(channel_id)})
                        if ch:
                            members = [str(m) for m in ch.get("members", [])]
                            others = [m for m in members if m != user_id]
                            await presence.send_to_users(others, {
                                "type": "chat_typing",
                                "channel_id": channel_id,
                                "user_id": user_id,
                                "user_name": user_name,
                                "is_typing": is_typing,
                            })
                    except Exception as e:
                        logger.error(f"chat_typing error: {e}")
            elif msg.get("type") == "chat_read":
                channel_id = msg.get("channel_id", "")
                if channel_id:
                    try:
                        now = datetime.now(timezone.utc)
                        await db.chat_read_receipts.update_one(
                            {"channel_id": channel_id, "user_id": user_id},
                            {"$set": {"last_read_at": now, "updated_at": now}},
                            upsert=True,
                        )
                    except Exception as e:
                        logger.error(f"chat_read error: {e}")

    except WebSocketDisconnect:
        pass
    except asyncio.TimeoutError:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        if user_id:
            presence.disconnect(user_id)
            await presence.broadcast_presence()


@app.get("/api/presence")
async def get_presence():
    return presence.get_online_users()


# ── Startup ──
@app.on_event("startup")
async def startup():
    logger.info("Starting ShiftRoster API...")

    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username", unique=True, sparse=True)
    await db.login_attempts.create_index("identifier")
    await db.shifts.create_index([("org_id", 1), ("start_time", 1)])
    await db.shift_assignments.create_index("shift_id")
    await db.shift_assignments.create_index("user_id")
    await db.attendance_logs.create_index([("user_id", 1), ("clock_in", 1)])
    await db.leave_requests.create_index([("user_id", 1), ("status", 1)])
    await db.calendar_notes.create_index([("org_id", 1), ("note_date", 1)])
    await db.notifications.create_index([("user_id", 1), ("is_read", 1)])
    await db.audit_logs.create_index([("entity", 1), ("entity_id", 1)])
    await db.sticky_notes.create_index([("org_id", 1), ("note_date", 1)])
    await db.sticky_notes.create_index([("user_id", 1)])

    # Chat indexes
    await db.chat_channels.create_index([("org_id", 1), ("type", 1)])
    await db.chat_channels.create_index([("members", 1)])
    await db.chat_channels.create_index([("org_id", 1), ("name", 1)])
    await db.chat_messages.create_index([("channel_id", 1), ("created_at", -1)])
    await db.chat_read_receipts.create_index(
        [("channel_id", 1), ("user_id", 1)], unique=True
    )

    logger.info("ShiftRoster API started successfully")


@app.on_event("shutdown")
async def shutdown():
    client.close()
