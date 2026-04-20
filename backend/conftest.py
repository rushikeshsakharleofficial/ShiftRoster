import pytest
import asyncio
import os
from typing import AsyncGenerator, Generator
from fastapi.testclient import TestClient
from httpx import AsyncClient
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime, timezone
import sys
from pathlib import Path

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from server import app
from auth_utils import hash_password
from db import client as prod_client


# ─── Test Database Fixtures ───

@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def test_db_client() -> AsyncIOMotorClient:
    """Create test MongoDB client."""
    test_mongo_url = os.environ.get(
        'TEST_MONGO_URL',
        os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    )
    client = AsyncIOMotorClient(test_mongo_url)
    yield client
    client.close()


@pytest.fixture(scope="session")
async def test_db(test_db_client: AsyncIOMotorClient) -> AsyncIOMotorDatabase:
    """Get test database."""
    db_name = os.environ.get('TEST_DB_NAME', f"shift_roster_test_{ObjectId()}")
    db = test_db_client[db_name]
    yield db
    # Cleanup: drop test database after all tests
    await test_db_client.drop_database(db_name)


@pytest.fixture(autouse=True)
async def cleanup_db(test_db: AsyncIOMotorDatabase):
    """Clean up database before each test."""
    yield
    # Drop all collections after each test
    async for collection_name in test_db.list_collection_names():
        if not collection_name.startswith("system."):
            await test_db[collection_name].drop()


# ─── FastAPI Client Fixtures ───

@pytest.fixture
async def async_client(test_db: AsyncIOMotorDatabase) -> AsyncGenerator:
    """Create async test client with test database."""
    # Override db in app dependency
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client


@pytest.fixture
def sync_client() -> TestClient:
    """Create synchronous test client (for simple requests)."""
    return TestClient(app)


# ─── Test Data Fixtures ───

@pytest.fixture
async def test_org(test_db: AsyncIOMotorDatabase) -> dict:
    """Create test organization."""
    org_data = {
        "_id": ObjectId(),
        "name": "Test Organization",
        "domain": "test.example.com",
        "created_at": datetime.now(timezone.utc),
        "timezone": "UTC",
        "features": {
            "chat": True,
            "attendance": True,
            "announcements": True,
        }
    }
    await test_db["organizations"].insert_one(org_data)
    return org_data


@pytest.fixture
async def test_admin_user(test_db: AsyncIOMotorDatabase, test_org: dict) -> dict:
    """Create test admin user."""
    user_data = {
        "_id": ObjectId(),
        "org_id": test_org["_id"],
        "username": "testadmin",
        "email": "admin@test.example.com",
        "password_hash": hash_password("Admin@123456"),
        "full_name": "Test Admin",
        "phone": "+1234567890",
        "system_role": "admin",
        "employee_level": "manager",
        "status": "active",
        "department_id": None,
        "position_id": None,
        "mfa_enabled": False,
        "avatar_url": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await test_db["users"].insert_one(user_data)
    return user_data


@pytest.fixture
async def test_manager_user(test_db: AsyncIOMotorDatabase, test_org: dict) -> dict:
    """Create test manager user."""
    user_data = {
        "_id": ObjectId(),
        "org_id": test_org["_id"],
        "username": "testmanager",
        "email": "manager@test.example.com",
        "password_hash": hash_password("Manager@123456"),
        "full_name": "Test Manager",
        "phone": "+1234567891",
        "system_role": "manager",
        "employee_level": "manager",
        "status": "active",
        "department_id": None,
        "position_id": None,
        "mfa_enabled": False,
        "avatar_url": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await test_db["users"].insert_one(user_data)
    return user_data


@pytest.fixture
async def test_employee_user(test_db: AsyncIOMotorDatabase, test_org: dict) -> dict:
    """Create test employee user."""
    user_data = {
        "_id": ObjectId(),
        "org_id": test_org["_id"],
        "username": "testemployee",
        "email": "employee@test.example.com",
        "password_hash": hash_password("Employee@123456"),
        "full_name": "Test Employee",
        "phone": "+1234567892",
        "system_role": "user",
        "employee_level": "junior",
        "status": "active",
        "department_id": None,
        "position_id": None,
        "mfa_enabled": False,
        "avatar_url": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await test_db["users"].insert_one(user_data)
    return user_data


@pytest.fixture
async def test_department(test_db: AsyncIOMotorDatabase, test_org: dict) -> dict:
    """Create test department."""
    dept_data = {
        "_id": ObjectId(),
        "org_id": test_org["_id"],
        "name": "Engineering",
        "color_hex": "#3498db",
        "created_at": datetime.now(timezone.utc),
    }
    await test_db["departments"].insert_one(dept_data)
    return dept_data


@pytest.fixture
async def test_position(test_db: AsyncIOMotorDatabase, test_org: dict, test_department: dict) -> dict:
    """Create test position."""
    pos_data = {
        "_id": ObjectId(),
        "org_id": test_org["_id"],
        "name": "Senior Engineer",
        "department_id": test_department["_id"],
        "created_at": datetime.now(timezone.utc),
    }
    await test_db["positions"].insert_one(pos_data)
    return pos_data


# ─── Auth Token Fixtures ───

@pytest.fixture
async def admin_token(async_client: AsyncClient, test_admin_user: dict):
    """Get auth token for admin user."""
    response = await async_client.post(
        "/api/auth/login",
        json={
            "email": test_admin_user["email"],
            "password": "Admin@123456"
        }
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    return None


@pytest.fixture
async def manager_token(async_client: AsyncClient, test_manager_user: dict):
    """Get auth token for manager user."""
    response = await async_client.post(
        "/api/auth/login",
        json={
            "email": test_manager_user["email"],
            "password": "Manager@123456"
        }
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    return None


@pytest.fixture
async def employee_token(async_client: AsyncClient, test_employee_user: dict):
    """Get auth token for employee user."""
    response = await async_client.post(
        "/api/auth/login",
        json={
            "email": test_employee_user["email"],
            "password": "Employee@123456"
        }
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    return None
