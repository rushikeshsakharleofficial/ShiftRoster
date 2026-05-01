
import asyncio
import os
import secrets
from db import db
from auth_utils import hash_password
from datetime import datetime, timezone

async def create_admin():
    # Check if org exists
    org = await db.organizations.find_one({"name": "ShiftMaster"})
    if not org:
        org_id = await db.organizations.insert_one({
            "name": "ShiftMaster", 
            "created_at": datetime.now(timezone.utc),
            "attendance_enabled": True,
            "chat_features": {
                "encryption_enabled": True,
                "gifs_enabled": True,
                "disappearing_mode_enabled": True,
                "purge_policy_days": 30
            }
        })
        oid = org_id.inserted_id
    else:
        oid = org["_id"]
    
    # Check if admin exists
    admin = await db.users.find_one({"email": "admin@shiftmaster.com"})
    if not admin:
        admin_password = os.getenv("CREATE_ADMIN_PASSWORD")
        if not admin_password:
            admin_password = secrets.token_urlsafe(16)
            print("CREATE_ADMIN_PASSWORD not set. Generated admin password:", admin_password)
        await db.users.insert_one({
            "email": "admin@shiftmaster.com",
            "username": "admin",
            "password_hash": hash_password(admin_password),
            "full_name": "Admin User",
            "system_role": "admin",
            "org_id": oid,
            "is_active": True,
            "created_at": datetime.now(timezone.utc)
        })
        print("Admin created successfully.")
    else:
        print("Admin already exists.")

if __name__ == "__main__":
    asyncio.run(create_admin())
