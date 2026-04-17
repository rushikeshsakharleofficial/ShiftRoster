import asyncio
from datetime import datetime, timezone, timedelta
import logging
from db import db

logger = logging.getLogger(__name__)

async def run_purging_task():
    """Background task to delete old chat messages based on organization policy."""
    logger.info("Chat purging task started")
    while True:
        try:
            # Fetch all organizations
            orgs = await db.organizations.find({}).to_list(1000)
            
            for org in orgs:
                chat_features = org.get("chat_features", {})
                purge_days = chat_features.get("purge_policy_days")
                
                if purge_days and isinstance(purge_days, int) and purge_days > 0:
                    cutoff = datetime.now(timezone.utc) - timedelta(days=purge_days)
                    
                    # Delete messages older than cutoff
                    result = await db.chat_messages.delete_many({
                        "org_id": str(org["_id"]),
                        "created_at": {"$lt": cutoff}
                    })
                    
                    if result.deleted_count > 0:
                        logger.info(f"Purged {result.deleted_count} messages for org {org.get('name', str(org['_id']))} (Policy: {purge_days} days)")
            
        except Exception as e:
            logger.error(f"Error in purging task: {e}")
            
        # Run once a day (86400 seconds)
        await asyncio.sleep(86400)
