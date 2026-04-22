"""Google OIDC helpers — mirrors slack_service.py pattern."""
import os
import base64
import hashlib
import logging
from typing import Optional

logger = logging.getLogger(__name__)

try:
    from cryptography.fernet import Fernet, InvalidToken
except ImportError:
    Fernet = None

GOOGLE_SECRET_SENTINEL = "__KEEP_EXISTING_GOOGLE_SECRET__"

DEFAULT_GOOGLE_SETTINGS = {
    "enabled": False,
    "client_id": "",
    "client_secret": "",
    "allowed_domain": "",
    "auto_provision": True,
    "default_role": "employee",
    "trust_google_as_mfa": False,
    "instance_base_url": "",
}

VALID_ROLES = {"employee", "manager", "admin", "readonly"}


def _fernet():
    secret_key = os.getenv("SECRET_KEY", "")
    if not secret_key:
        raise RuntimeError("SECRET_KEY env var not set — cannot encrypt Google client secret")
    digest = hashlib.sha256(secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_client_secret(secret: str) -> str:
    if Fernet is None:
        raise RuntimeError("cryptography package not installed")
    return _fernet().encrypt(secret.encode("utf-8")).decode("utf-8")


def decrypt_client_secret(value: str) -> str:
    if not value or Fernet is None:
        return ""
    try:
        return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except Exception:
        logger.warning("Google client secret could not be decrypted")
        return ""


def public_google_settings(settings: Optional[dict]) -> dict:
    merged = {**DEFAULT_GOOGLE_SETTINGS, **(settings or {})}
    merged["client_secret"] = GOOGLE_SECRET_SENTINEL if merged.get("client_secret") else ""
    return merged


def normalize_google_settings(payload: dict, existing: Optional[dict] = None) -> dict:
    from fastapi import HTTPException
    existing = existing or {}
    settings = {**DEFAULT_GOOGLE_SETTINGS, **existing}

    for key in ("enabled", "auto_provision", "trust_google_as_mfa"):
        if key in payload:
            settings[key] = bool(payload[key])

    for key in ("client_id", "allowed_domain", "instance_base_url"):
        if key in payload:
            settings[key] = str(payload.get(key) or "").strip()

    if "default_role" in payload:
        role = str(payload["default_role"]).strip()
        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"default_role must be one of: {', '.join(sorted(VALID_ROLES))}")
        settings["default_role"] = role

    if "client_secret" in payload:
        secret = payload.get("client_secret") or ""
        if secret and secret != GOOGLE_SECRET_SENTINEL:
            settings["client_secret"] = encrypt_client_secret(secret)
        elif not secret:
            settings["client_secret"] = ""
        # sentinel → keep existing (already in settings from existing)

    return settings
