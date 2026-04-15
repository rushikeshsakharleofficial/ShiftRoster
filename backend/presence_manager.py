"""Shared PresenceManager instance — importable by both server.py and route modules."""
import json
from datetime import datetime, timezone
from fastapi import WebSocket


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

    async def update_user_data(self, user_id: str, updates: dict):
        """Update a user's presence data (e.g. name, avatar) if they are online."""
        if user_id in self.user_data:
            self.user_data[user_id].update(updates)
            await self.broadcast_presence()

    async def heartbeat(self, user_id: str, data: dict):
        if user_id in self.user_data:
            self.user_data[user_id]["view"] = data.get("current_view", "")
            # Preserve user-set statuses (break, leave) — only reset if currently "idle"
            current_status = self.user_data[user_id].get("status", "active")
            if current_status not in ("break", "leave"):
                self.user_data[user_id]["status"] = "active"
            self.user_data[user_id]["last_seen"] = datetime.now(timezone.utc).isoformat()
            await self.broadcast_presence()

    async def set_status(self, user_id: str, status: str):
        """Explicitly set a user's status (active | break | leave)."""
        valid = {"active", "break", "leave"}
        if status not in valid:
            return
        if user_id in self.user_data:
            self.user_data[user_id]["status"] = status
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

    async def send_to_user(self, user_id: str, payload: dict):
        ws = self.connections.get(user_id)
        if ws:
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                self.connections.pop(user_id, None)
                self.user_data.pop(user_id, None)

    async def send_to_users(self, user_ids: list, payload: dict):
        for uid in user_ids:
            await self.send_to_user(uid, payload)


# Singleton instance — import this everywhere
presence = PresenceManager()
