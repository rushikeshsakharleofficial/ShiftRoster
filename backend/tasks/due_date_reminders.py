import asyncio
import logging
from datetime import datetime, timezone
from bson import ObjectId
from db import db
from auth_utils import create_notification

logger = logging.getLogger(__name__)


async def run_due_date_reminders():
    logger.info("Due-date reminder task started")
    while True:
        try:
            now = datetime.now(timezone.utc)
            tasks = await db.tasks.find({
                "status": "pending",
                "due_date": {"$ne": None},
            }).to_list(1000)

            for task in tasks:
                due = task.get("due_date")
                if not due:
                    continue
                if due.tzinfo is None:
                    due = due.replace(tzinfo=timezone.utc)

                delta = (due - now).total_seconds()
                reminders_sent = task.get("reminders_sent", [])
                assignee_id = str(task["assigned_to"])
                title_str = task.get("title", "Task")
                task_id = str(task["_id"])

                async def maybe_send(bucket, notif_title, notif_body):
                    if bucket in reminders_sent:
                        return
                    result = await db.tasks.update_one(
                        {"_id": task["_id"], "reminders_sent": {"$ne": bucket}},
                        {"$push": {"reminders_sent": bucket}},
                    )
                    if result.modified_count:
                        await create_notification(
                            assignee_id,
                            "task_reminder",
                            notif_title,
                            notif_body,
                            f"/tasks?open={task_id}",
                        )

                if 0 < delta <= 86400:
                    await maybe_send(
                        "24h",
                        "Task Due Soon",
                        f"'{title_str}' is due within 24 hours",
                    )
                elif -3600 <= delta <= 0:
                    await maybe_send(
                        "due_day",
                        "Task Due Now",
                        f"'{title_str}' is due right now",
                    )
                elif delta < -3600:
                    await maybe_send(
                        "overdue",
                        "Task Overdue",
                        f"'{title_str}' is overdue",
                    )

        except Exception as e:
            logger.error(f"Due-date reminder error: {e}")

        await asyncio.sleep(3600)
