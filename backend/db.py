from motor.motor_asyncio import AsyncIOMotorClient
import os

mongo_url = os.environ['MONGO_URL']

# Performance: tune connection pool for concurrent async workload
client = AsyncIOMotorClient(
    mongo_url,
    maxPoolSize=int(os.getenv("MONGO_MAX_POOL", "50")),
    minPoolSize=int(os.getenv("MONGO_MIN_POOL", "5")),
    maxIdleTimeMS=30_000,
    serverSelectionTimeoutMS=5_000,
    connectTimeoutMS=10_000,
    socketTimeoutMS=30_000,
    retryWrites=True,
    retryReads=True,
)
db = client[os.environ['DB_NAME']]
