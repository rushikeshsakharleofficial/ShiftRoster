import os
from cryptography.fernet import Fernet, InvalidToken

_raw = os.getenv("MSG_ENCRYPT_KEY", "").strip().encode()
if not _raw:
    raise RuntimeError("MSG_ENCRYPT_KEY env var is not set — message encryption is required")
_fernet: Fernet = Fernet(_raw)


def encrypt_text(text: str) -> str:
    if not _fernet or not text:
        return text
    return _fernet.encrypt(text.encode()).decode()


def decrypt_text(token: str) -> str:
    if not _fernet or not token:
        return token
    try:
        return _fernet.decrypt(token.encode()).decode()
    except (InvalidToken, Exception):
        return token  # plaintext passthrough (pre-encryption messages)
