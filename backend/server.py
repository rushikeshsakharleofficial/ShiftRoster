from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from db import db, client
from auth_utils import hash_password, verify_password, serialize_doc
from datetime import datetime, timezone
import os
import logging
import json
import asyncio

# Import routers
from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.departments import router as departments_router
from routes.manager_groups import router as manager_groups_router
from routes.shifts import router as shifts_router
from routes.leave import router as leave_router
from routes.operations import router as operations_router
from routes.sticky_notes import router as sticky_notes_router

app = FastAPI(title="ShiftRoster API", version="2.0.0")

# CORS - use permissive CORS since auth is via Bearer tokens
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(departments_router)
app.include_router(manager_groups_router)
app.include_router(shifts_router)
app.include_router(leave_router)
app.include_router(operations_router)
app.include_router(sticky_notes_router)

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
    await db.users.insert_one({
        "org_id": org_id,
        "email": email,
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
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
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
class PresenceManager:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}
        self.user_data: dict[str, dict] = {}

    async def connect(self, user_id: str, ws: WebSocket, user_info: dict):
        await ws.accept()
        self.connections[user_id] = ws
        self.user_data[user_id] = {
            "id": user_id,
            "name": user_info.get("full_name", ""),
            "avatar": user_info.get("avatar_url", ""),
            "department_id": user_info.get("department_id", ""),
            "system_role": user_info.get("system_role", ""),
            "view": "",
            "status": "active",
            "last_seen": datetime.now(timezone.utc).isoformat(),
        }
        await self.broadcast_presence()

    def disconnect(self, user_id: str):
        self.connections.pop(user_id, None)
        self.user_data.pop(user_id, None)

    async def heartbeat(self, user_id: str, data: dict):
        if user_id in self.user_data:
            self.user_data[user_id]["view"] = data.get("current_view", "")
            self.user_data[user_id]["status"] = "active"
            self.user_data[user_id]["last_seen"] = datetime.now(timezone.utc).isoformat()
            await self.broadcast_presence()

    async def broadcast_presence(self):
        online = list(self.user_data.values())
        message = json.dumps({"type": "presence_update", "online_users": online})
        disconnected = []
        for uid, ws in self.connections.items():
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(uid)
        for uid in disconnected:
            self.disconnect(uid)

    def get_online_users(self):
        return list(self.user_data.values())


presence = PresenceManager()


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

        from bson import ObjectId
        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
        if not user:
            await ws.close()
            return

        user_info = serialize_doc(user)
        presence.connections[user_id] = ws
        presence.user_data[user_id] = {
            "id": user_id,
            "name": user_info.get("full_name", ""),
            "avatar": user_info.get("avatar_url", ""),
            "department_id": user_info.get("department_id", ""),
            "system_role": user_info.get("system_role", ""),
            "view": "",
            "status": "active",
            "last_seen": datetime.now(timezone.utc).isoformat(),
        }
        await presence.broadcast_presence()

        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "heartbeat":
                await presence.heartbeat(user_id, msg)
            elif msg.get("type") == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))

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

    logger.info("ShiftRoster API started successfully")


@app.on_event("shutdown")
async def shutdown():
    client.close()
