"""Email utility — sends via org SMTP config stored in MongoDB."""
import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional


async def send_email(
    org: dict,
    to: str,
    subject: str,
    html: str,
    text: Optional[str] = None,
) -> bool:
    """Send email using org SMTP config. Returns True on success, False on failure."""
    host = org.get("smtp_host", "")
    port = int(org.get("smtp_port", 587))
    username = org.get("smtp_username", "")
    password = org.get("smtp_password", "")
    from_email = org.get("smtp_from_email", "")
    from_name = org.get("smtp_from_name", org.get("name", "ShiftRoster"))
    use_tls = org.get("smtp_use_tls", True)

    if not host or not from_email or not org.get("smtp_enabled", False):
        return False

    def _send():
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to
        if text:
            msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        if use_tls:
            server = smtplib.SMTP(host, port, timeout=10)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(host, port, timeout=10)

        if username and password:
            server.login(username, password)
        server.sendmail(from_email, [to], msg.as_string())
        server.quit()

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send)
    return True
