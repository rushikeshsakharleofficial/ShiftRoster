from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth_utils import get_current_user, log_audit
from db import db
from ldap_service import (
    normalize_ldap_settings,
    public_ldap_settings,
    sync_users,
    test_connection,
)

router = APIRouter(prefix="/api/settings/ldap", tags=["ldap"])


class LdapSettingsPayload(BaseModel):
    enabled: bool = False
    host: str = ""
    port: int = 636
    use_ssl: bool = True
    start_tls: bool = False
    bind_dn: str = ""
    bind_password: str = ""
    search_base: str = ""
    user_filter: str = "(&(objectClass=person)(sAMAccountName=*))"
    mapping: dict = {}


def _require_admin(user: dict):
    if user.get("system_role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


@router.get("")
async def get_ldap_settings(user=Depends(get_current_user)):
    _require_admin(user)
    org = await db.organizations.find_one({"_id": ObjectId(user["org_id"])}, {"ldap_settings": 1})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return public_ldap_settings(org.get("ldap_settings") or {})


@router.put("")
async def update_ldap_settings(payload: LdapSettingsPayload, user=Depends(get_current_user)):
    _require_admin(user)
    org = await db.organizations.find_one({"_id": ObjectId(user["org_id"])}, {"ldap_settings": 1})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    settings = normalize_ldap_settings(payload.model_dump(), org.get("ldap_settings") or {})
    now = datetime.now(timezone.utc)
    db_set = {"ldap_settings": settings, "updated_at": now}
    # Mutual exclusion: enabling LDAP disables Slack SSO
    if settings.get("enabled"):
        db_set["slack_oidc.enabled"] = False
    await db.organizations.update_one(
        {"_id": ObjectId(user["org_id"])},
        {"$set": db_set},
    )
    await log_audit(user["org_id"], user["id"], "update_ldap_settings", "organization", user["org_id"])
    return public_ldap_settings(settings)


@router.post("/test")
async def test_ldap_settings(payload: LdapSettingsPayload, user=Depends(get_current_user)):
    _require_admin(user)
    org = await db.organizations.find_one({"_id": ObjectId(user["org_id"])}, {"ldap_settings": 1})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    settings = normalize_ldap_settings(payload.model_dump(), org.get("ldap_settings") or {})
    return await test_connection(settings)


@router.post("/sync")
async def sync_ldap_users(user=Depends(get_current_user)):
    _require_admin(user)
    settings_doc = await db.organizations.find_one({"_id": ObjectId(user["org_id"])}, {"ldap_settings": 1})
    if not settings_doc:
        raise HTTPException(status_code=404, detail="Organization not found")
    summary = await sync_users(user["org_id"], settings_doc.get("ldap_settings") or {})
    await log_audit(user["org_id"], user["id"], "sync_ldap_users", "organization", user["org_id"], summary)
    return summary
