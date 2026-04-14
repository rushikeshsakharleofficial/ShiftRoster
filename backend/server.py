from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from starlette.middleware.cors import CORSMiddleware
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

app = FastAPI(title="ShiftMaster API", version="1.0.0")

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

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ── Health Check ──
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "ShiftMaster"}


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
    logger.info("Starting ShiftMaster API...")

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

    # Seed default organization
    org = await db.organizations.find_one()
    if not org:
        org_result = await db.organizations.insert_one({
            "name": "ShiftMaster Corp",
            "timezone": "Asia/Kolkata",
            "locale": "en-IN",
            "currency": "INR",
            "work_week_start": 1,
            "overtime_daily_threshold": 8,
            "overtime_weekly_threshold": 40,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        })
        org_id = str(org_result.inserted_id)
        logger.info(f"Created default organization: {org_id}")
    else:
        org_id = str(org["_id"])

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@shiftmaster.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")

    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:
        await db.users.insert_one({
            "org_id": org_id,
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "full_name": "System Admin",
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
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        })
        logger.info(f"Seeded admin user: {admin_email}")
    elif not verify_password(admin_password, existing_admin["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )
        logger.info("Updated admin password")

    # Write test credentials
    os.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("# Test Credentials\n\n")
        f.write(f"## Admin\n- Email: {admin_email}\n- Password: {admin_password}\n- Role: admin\n\n")
        f.write("## Auth Endpoints\n")
        f.write("- POST /api/auth/login\n")
        f.write("- POST /api/auth/register\n")
        f.write("- GET /api/auth/me\n")
        f.write("- POST /api/auth/logout\n")
        f.write("- POST /api/auth/refresh\n\n")
        f.write("## Key API Endpoints\n")
        f.write("- GET/POST /api/users\n")
        f.write("- GET/POST /api/departments\n")
        f.write("- GET/POST /api/manager-groups\n")
        f.write("- GET/POST /api/shifts\n")
        f.write("- GET/POST /api/shift-templates\n")
        f.write("- GET/POST /api/leave-requests\n")
        f.write("- GET/POST /api/calendar-notes\n")
        f.write("- GET/POST /api/swap-requests\n")
        f.write("- POST /api/attendance/clock-in\n")
        f.write("- POST /api/attendance/clock-out\n")
        f.write("- GET /api/notifications\n")
        f.write("- GET /api/audit-logs\n")
        f.write("- GET /api/reports/overview\n")

    # Seed some demo departments if none exist
    dept_count = await db.departments.count_documents({"org_id": org_id})
    if dept_count == 0:
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
        logger.info("Seeded demo departments")

    logger.info("ShiftMaster API started successfully")


@app.on_event("shutdown")
async def shutdown():
    client.close()
