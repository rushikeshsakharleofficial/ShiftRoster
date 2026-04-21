import asyncio
import base64
import hashlib
import logging
import os
import ssl
from datetime import datetime, timezone
from typing import Dict, Optional

from bson import ObjectId
from fastapi import HTTPException

from auth_utils import generate_unique_username, get_jwt_secret
from db import db

try:
    from cryptography.fernet import Fernet, InvalidToken
except ImportError:  # pragma: no cover - startup dependency guard
    Fernet = None
    InvalidToken = Exception

try:
    from ldap3 import ALL, Connection, Server, Tls
    from ldap3.core.exceptions import LDAPException
except ImportError:  # pragma: no cover - endpoint returns a clear error
    ALL = Connection = Server = Tls = None
    LDAPException = Exception

logger = logging.getLogger(__name__)

LDAP_PASSWORD_SENTINEL = "__KEEP_EXISTING_LDAP_PASSWORD__"

DEFAULT_LDAP_SETTINGS = {
    "enabled": False,
    "host": "",
    "port": 636,
    "use_ssl": True,
    "start_tls": False,
    "bind_dn": "",
    "bind_password": "",
    "search_base": "",
    "user_filter": "(&(objectClass=person)(sAMAccountName=*))",
    "mapping": {
        "username": "sAMAccountName",
        "email": "mail",
        "full_name": "displayName",
        "phone": "telephoneNumber",
    },
    "last_sync_at": None,
}


def _require_dependencies():
    if Connection is None:
        raise HTTPException(status_code=500, detail="LDAP support is not installed on the server")
    if Fernet is None:
        raise HTTPException(status_code=500, detail="Credential encryption support is not installed on the server")


def _fernet() -> Fernet:
    _require_dependencies()
    raw = os.getenv("ENCRYPTION_KEY") or get_jwt_secret()
    digest = hashlib.sha256(raw.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_bind_password(password: str) -> str:
    if not password:
        return ""
    return _fernet().encrypt(password.encode("utf-8")).decode("utf-8")


def decrypt_bind_password(value: str) -> str:
    if not value:
        return ""
    try:
        return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        logger.warning("LDAP bind password could not be decrypted")
        return ""


def public_ldap_settings(settings: Optional[dict]) -> dict:
    merged = {**DEFAULT_LDAP_SETTINGS, **(settings or {})}
    mapping = {**DEFAULT_LDAP_SETTINGS["mapping"], **(merged.get("mapping") or {})}
    merged["mapping"] = mapping
    merged["bind_password"] = LDAP_PASSWORD_SENTINEL if merged.get("bind_password") else ""
    return merged


def normalize_ldap_settings(payload: dict, existing: Optional[dict] = None) -> dict:
    existing = existing or {}
    settings = {**DEFAULT_LDAP_SETTINGS, **existing}

    for key in ("enabled", "use_ssl", "start_tls"):
        if key in payload:
            settings[key] = bool(payload[key])

    for key in ("host", "bind_dn", "search_base", "user_filter"):
        if key in payload:
            settings[key] = str(payload.get(key) or "").strip()

    if "port" in payload:
        try:
            port = int(payload.get("port"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="LDAP port must be a number")
        if port < 1 or port > 65535:
            raise HTTPException(status_code=400, detail="LDAP port must be between 1 and 65535")
        settings["port"] = port

    if "mapping" in payload and isinstance(payload["mapping"], dict):
        mapping = {**DEFAULT_LDAP_SETTINGS["mapping"], **(settings.get("mapping") or {})}
        for key in DEFAULT_LDAP_SETTINGS["mapping"]:
            if key in payload["mapping"]:
                mapping[key] = str(payload["mapping"].get(key) or "").strip()
        settings["mapping"] = mapping

    if "bind_password" in payload:
        bind_password = payload.get("bind_password") or ""
        if bind_password and bind_password != LDAP_PASSWORD_SENTINEL:
            settings["bind_password"] = encrypt_bind_password(bind_password)
        elif not bind_password:
            settings["bind_password"] = ""

    if settings["enabled"]:
        missing = [k for k in ("host", "bind_dn", "bind_password", "search_base") if not settings.get(k)]
        if missing:
            raise HTTPException(status_code=400, detail=f"Missing LDAP settings: {', '.join(missing)}")
        if not settings.get("use_ssl") and not settings.get("start_tls"):
            raise HTTPException(status_code=400, detail="Enable LDAPS or StartTLS before enabling LDAP")

    return settings


def _server(settings: dict):
    tls = Tls(validate=ssl.CERT_REQUIRED) if settings.get("use_ssl") or settings.get("start_tls") else None
    return Server(
        settings["host"],
        port=int(settings.get("port") or (636 if settings.get("use_ssl") else 389)),
        use_ssl=bool(settings.get("use_ssl")),
        tls=tls,
        get_info=ALL,
    )


def _entry_value(entry, attr_name: str) -> str:
    if not attr_name:
        return ""
    attr = getattr(entry, attr_name, None)
    if attr is None:
        return ""
    value = attr.value
    if isinstance(value, list):
        return str(value[0]) if value else ""
    return str(value or "")


def _connect(settings: dict, user: Optional[str] = None, password: Optional[str] = None) -> Connection:
    _require_dependencies()
    bind_user = user or settings.get("bind_dn")
    bind_password = password if password is not None else decrypt_bind_password(settings.get("bind_password", ""))
    server = _server(settings)
    conn = Connection(server, user=bind_user, password=bind_password, auto_bind=False)
    if settings.get("start_tls") and not settings.get("use_ssl"):
        conn.open()
        if not conn.start_tls():
            raise HTTPException(status_code=400, detail="LDAP StartTLS negotiation failed")
    if not conn.bind():
        raise HTTPException(status_code=400, detail="LDAP bind failed")
    return conn


def _test_connection_sync(settings: dict) -> dict:
    try:
        conn = _connect(settings)
        conn.unbind()
        return {"ok": True, "message": "LDAP connection succeeded"}
    except HTTPException:
        raise
    except LDAPException:
        logger.exception("LDAP connection test failed")
        raise HTTPException(status_code=400, detail="LDAP connection failed")


async def test_connection(settings: dict) -> dict:
    return await asyncio.to_thread(_test_connection_sync, settings)


async def get_org_settings(org_id: str) -> dict:
    org = await db.organizations.find_one({"_id": ObjectId(org_id)}, {"ldap_settings": 1})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {**DEFAULT_LDAP_SETTINGS, **(org.get("ldap_settings") or {})}


def _search_user_dn(settings: dict, username: str, ldap_dn: str = "") -> str:
    conn = _connect(settings)
    try:
        if ldap_dn:
            return ldap_dn
        mapping = {**DEFAULT_LDAP_SETTINGS["mapping"], **(settings.get("mapping") or {})}
        username_attr = mapping["username"]
        safe_username = username.replace("\\", "\\5c").replace("*", "\\2a").replace("(", "\\28").replace(")", "\\29")
        user_filter = f"(&{settings.get('user_filter') or '(objectClass=person)'}({username_attr}={safe_username}))"
        if not conn.search(settings["search_base"], user_filter, attributes=[username_attr]):
            raise HTTPException(status_code=401, detail="Invalid email/username or password")
        return conn.entries[0].entry_dn
    finally:
        conn.unbind()


def _authenticate_user_sync(settings: dict, username: str, password: str, ldap_dn: str = "") -> bool:
    if not password:
        return False
    user_dn = _search_user_dn(settings, username, ldap_dn)
    conn = _connect(settings, user=user_dn, password=password)
    conn.unbind()
    return True


async def authenticate_user(org_id: str, username: str, password: str, ldap_dn: str = "") -> bool:
    settings = await get_org_settings(org_id)
    if not settings.get("enabled"):
        raise HTTPException(status_code=401, detail="LDAP login is disabled")
    try:
        return await asyncio.to_thread(_authenticate_user_sync, settings, username, password, ldap_dn)
    except HTTPException:
        raise
    except LDAPException:
        logger.warning("LDAP authentication failed for user %s", username)
        return False


def _sync_users_sync(org_id: str, settings: dict) -> dict:
    mapping = {**DEFAULT_LDAP_SETTINGS["mapping"], **(settings.get("mapping") or {})}
    attrs = list({v for v in mapping.values() if v})
    conn = _connect(settings)
    try:
        if not conn.search(settings["search_base"], settings["user_filter"], attributes=attrs):
            return {"created": 0, "updated": 0, "skipped": 0, "total": 0}
        entries = list(conn.entries)
    finally:
        conn.unbind()

    return {"entries": entries, "mapping": mapping}


async def sync_users(org_id: str, settings: Optional[dict] = None) -> dict:
    settings = settings or await get_org_settings(org_id)
    if not settings.get("enabled"):
        return {"created": 0, "updated": 0, "skipped": 0, "total": 0, "message": "LDAP is disabled"}

    result = await asyncio.to_thread(_sync_users_sync, org_id, settings)
    entries = result.pop("entries", [])
    mapping = result.pop("mapping", DEFAULT_LDAP_SETTINGS["mapping"])
    now = datetime.now(timezone.utc)
    created = updated = skipped = 0

    for entry in entries:
        username = _entry_value(entry, mapping["username"]).strip().lower()
        email = _entry_value(entry, mapping["email"]).strip().lower()
        full_name = _entry_value(entry, mapping["full_name"]).strip()
        phone = _entry_value(entry, mapping["phone"]).strip()
        ldap_dn = entry.entry_dn

        if not username or not email:
            skipped += 1
            continue

        existing = await db.users.find_one({
            "org_id": org_id,
            "$or": [{"ldap_dn": ldap_dn}, {"username": username}, {"email": email}],
        })
        if existing and existing.get("auth_provider", "local") != "ldap":
            skipped += 1
            continue

        payload = {
            "org_id": org_id,
            "email": email,
            "username": username,
            "full_name": full_name or username,
            "phone": phone,
            "auth_provider": "ldap",
            "ldap_dn": ldap_dn,
            "status": "active",
            "updated_at": now,
        }
        if existing:
            await db.users.update_one({"_id": existing["_id"]}, {"$set": payload})
            updated += 1
        else:
            if await db.users.find_one({"email": email}):
                skipped += 1
                continue
            payload.update({
                "password_hash": "",
                "avatar_url": "",
                "system_role": "employee",
                "employee_level": None,
                "department_id": None,
                "position_id": None,
                "hourly_rate": None,
                "employment_type": "full_time",
                "skills": [],
                "mfa_enabled": False,
                "mfa_mandated": False,
                "mfa_secret": None,
                "created_at": now,
            })
            if await db.users.find_one({"username": username}):
                payload["username"] = await generate_unique_username(username, db)
            await db.users.insert_one(payload)
            created += 1

    await db.organizations.update_one(
        {"_id": ObjectId(org_id)},
        {"$set": {"ldap_settings.last_sync_at": now, "updated_at": now}},
    )
    return {"created": created, "updated": updated, "skipped": skipped, "total": len(entries)}


async def run_ldap_sync_task(interval_seconds: int = 3600):
    while True:
        try:
            cursor = db.organizations.find({"ldap_settings.enabled": True}, {"ldap_settings": 1})
            async for org in cursor:
                org_id = str(org["_id"])
                try:
                    summary = await sync_users(org_id, org.get("ldap_settings") or {})
                    logger.info("LDAP sync complete for org=%s summary=%s", org_id, summary)
                except Exception:
                    logger.exception("LDAP sync failed for org=%s", org_id)
        except Exception:
            logger.exception("LDAP background sync loop failed")
        await asyncio.sleep(interval_seconds)
