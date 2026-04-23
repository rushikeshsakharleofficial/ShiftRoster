from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

import os

# Security: validate critical secrets at startup (fail fast, not at first auth request)
_REQUIRED_ENV_VARS = ["JWT_SECRET", "MONGO_URL", "DB_NAME"]
_missing = [v for v in _REQUIRED_ENV_VARS if not os.getenv(v)]
if _missing:
    raise RuntimeError(f"Required environment variables not set: {', '.join(_missing)}")

# Security: enforce strong JWT_SECRET length
if len(os.getenv("JWT_SECRET", "")) < 32:
    raise RuntimeError("JWT_SECRET must be at least 32 characters")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from db import db, client
from auth_utils import hash_password, verify_password, serialize_doc, generate_unique_username
from datetime import datetime, timezone
from bson import ObjectId
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
from routes.handovers import router as handovers_router
from routes.tasks import router as tasks_router
from routes.announcements import router as announcements_router
from routes.iam import router as iam_router
from routes.ldap import router as ldap_router
from routes.sops import router as sops_router
from routes.stories import router as stories_router
from tasks.purging import run_purging_task
from tasks.due_date_reminders import run_due_date_reminders
from ldap_service import run_ldap_sync_task

app = FastAPI(
    title="ShiftRoster API",
    version="2.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

# CORS - allow credentials for HTTP-only cookies
# Security: explicit methods/headers instead of wildcards when allow_credentials=True
_CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:8080,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _CORS_ORIGINS if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "Accept", "Origin"],
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
app.include_router(handovers_router)
app.include_router(tasks_router)
app.include_router(announcements_router)
app.include_router(iam_router)
app.include_router(ldap_router)
app.include_router(sops_router)
app.include_router(stories_router)

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


@app.get("/api/public/branding")
async def public_branding():
    """Public branding (brand_name, logo_url) used for favicon + login page.
    Only returns logo_url if admin has uploaded one — no default."""
    org = await db.organizations.find_one({}, {"brand_name": 1, "name": 1, "logo_url": 1, "slack_oidc": 1, "google_oidc": 1})
    if not org:
        return {"brand_name": "", "logo_url": "", "slack_enabled": False, "google_enabled": False}
    slack = org.get("slack_oidc") or {}
    google = org.get("google_oidc") or {}
    return {
        "brand_name": org.get("brand_name") or org.get("name") or "",
        "logo_url": org.get("logo_url") or "",
        "slack_enabled": bool(slack.get("enabled")),
        "google_enabled": bool(google.get("enabled")),
    }


@app.post("/api/setup")
async def initial_setup(data: SetupRequest):
    """First-time SuperAdmin setup. Only works when database has zero users."""
    user_count = await db.users.count_documents({})
    if user_count > 0:
        raise HTTPException(status_code=403, detail="Setup already completed. System already has users.")

    email = data.admin_email.strip().lower()
    # Initial setup uses default policy (no org yet exists)
    from auth_utils import validate_password_policy
    validate_password_policy(data.admin_password, None)

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

    masked_email = f"{email[:2]}***@{email.split('@')[1]}"
    logger.info(f"Initial setup completed: org={data.org_name}, admin={masked_email}")
    return {"message": "Setup completed successfully", "org_id": org_id}


# ── WebSocket Presence ──
from presence_manager import presence
from auth_utils import verify_access_token


@app.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    user_id = None
    user = None
    user_info = None
    try:
        # Auth strategy 1: cookie (same-origin requests via nginx proxy)
        token = ws.cookies.get("access_token")
        if token:
            payload = verify_access_token(token)
            if payload:
                uid = payload.get("sub")
                u = await db.users.find_one({"_id": ObjectId(uid)}, {"password_hash": 0})
                if u:
                    user_id = uid
                    user = u
                    user_info = serialize_doc(user)

        # Auth strategy 2: first-message token (fallback / legacy clients)
        if not user_id:
            auth_msg = await asyncio.wait_for(ws.receive_text(), timeout=10)
            auth_data = json.loads(auth_msg)
            token = auth_data.get("access_token")

            if not token:
                await ws.close(code=1008)
                return

            payload = verify_access_token(token)
            if not payload:
                await ws.close(code=1008)
                return

            user_id = payload.get("sub")
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

    # Create indexes in parallel to reduce startup await overhead
    index_tasks = [
        db.users.create_index("email", unique=True),
        db.users.create_index("username", unique=True, sparse=True),
        db.users.create_index([("org_id", 1), ("auth_provider", 1)]),
        db.users.create_index([("org_id", 1), ("ldap_dn", 1)], sparse=True),
        db.login_attempts.create_index("identifier"),
        db.shifts.create_index([("org_id", 1), ("start_time", 1)]),
        db.shift_assignments.create_index("shift_id"),
        db.shift_assignments.create_index("user_id"),
        db.attendance_logs.create_index([("user_id", 1), ("clock_in", 1)]),
        db.leave_requests.create_index([("user_id", 1), ("status", 1)]),
        db.calendar_notes.create_index([("org_id", 1), ("note_date", 1)]),
        db.notifications.create_index([("user_id", 1), ("is_read", 1)]),
        db.audit_logs.create_index([("entity", 1), ("entity_id", 1)]),
        db.sticky_notes.create_index([("org_id", 1), ("note_date", 1)]),
        db.sticky_notes.create_index([("user_id", 1)]),
        db.tasks.create_index([("org_id", 1), ("assigned_to", 1), ("status", 1)]),
        db.tasks.create_index([("status", 1), ("due_date", 1)]),
        db.handovers.create_index([("org_id", 1), ("created_at", -1)]),
        db.sops.create_index([("org_id", 1), ("created_at", -1)]),
        db.sops.create_index([("org_id", 1), ("owner", 1)]),
        db.sops.create_index([("org_id", 1), ("has_pending_edit", 1)]),
        db.sop_versions.create_index([("sop_id", 1), ("version", -1)]),
        # IAM indexes
        db.iam_groups.create_index([("org_id", 1), ("name", 1)]),
        db.iam_groups.create_index("is_global"),
        # Chat indexes
        db.chat_channels.create_index([("org_id", 1), ("type", 1)]),
        db.chat_channels.create_index([("members", 1)]),
        db.chat_channels.create_index([("org_id", 1), ("name", 1)]),
        db.chat_messages.create_index([("channel_id", 1), ("created_at", -1)]),
        db.chat_read_receipts.create_index(
            [("channel_id", 1), ("user_id", 1)], unique=True
        ),
        # TTL for expiring messages
        db.chat_messages.create_index("expires_at", expireAfterSeconds=0),
        # Stories — auto-expire after 24 h
        db.stories.create_index("expires_at", expireAfterSeconds=0),
        db.stories.create_index([("org_id", 1), ("expires_at", 1)]),
    ]
    await asyncio.gather(*index_tasks)

    # Seed global IAM templates (idempotent — skip if name already exists)
    from iam_constants import GLOBAL_TEMPLATES
    from datetime import datetime, timezone as tz
    for tmpl in GLOBAL_TEMPLATES:
        exists = await db.iam_groups.find_one({"name": tmpl["name"], "is_global": True})
        if not exists:
            await db.iam_groups.insert_one({
                "org_id": None,
                "name": tmpl["name"],
                "description": tmpl["description"],
                "permissions": tmpl["permissions"],
                "is_template": True,
                "is_global": True,
                "created_by": None,
                "created_at": datetime.now(tz.utc),
                "updated_at": datetime.now(tz.utc),
            })

    # Start background tasks
    asyncio.create_task(run_purging_task())
    asyncio.create_task(run_due_date_reminders())
    asyncio.create_task(run_ldap_sync_task())

    logger.info("ShiftRoster API started successfully")


@app.on_event("shutdown")
async def shutdown():
    client.close()
