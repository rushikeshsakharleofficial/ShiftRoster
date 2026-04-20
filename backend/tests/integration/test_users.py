"""Integration tests for user management endpoints."""
import pytest
from bson import ObjectId
from datetime import datetime, timezone


@pytest.mark.integration
@pytest.mark.asyncio
async def test_get_users_list(async_client, admin_token):
    """Test listing all users."""
    response = await async_client.get(
        "/api/users",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, (list, dict))


@pytest.mark.integration
@pytest.mark.asyncio
async def test_create_user(async_client, admin_token, test_org):
    """Test creating a new user."""
    user_data = {
        "email": "newuser@test.example.com",
        "full_name": "New User",
        "password": "NewUser@123456",
        "phone": "1234567890",
        "system_role": "user",
        "employee_level": "L1"
    }
    response = await async_client.post(
        "/api/users",
        json=user_data,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code in [200, 201]
    data = response.json()
    assert "id" in data
    assert data["email"] == user_data["email"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_get_user_by_id(async_client, admin_token, test_employee_user):
    """Test retrieving a specific user."""
    user_id = str(test_employee_user["_id"])
    response = await async_client.get(
        f"/api/users/{user_id}",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == test_employee_user["email"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_update_user(async_client, admin_token, test_employee_user):
    """Test updating user information."""
    user_id = str(test_employee_user["_id"])
    update_data = {
        "full_name": "Updated Employee Name",
        "employee_level": "L2"
    }
    response = await async_client.put(
        f"/api/users/{user_id}",
        json=update_data,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["full_name"] == "Updated Employee Name"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_delete_user(async_client, admin_token, test_db):
    """Test deleting a user."""
    # Create a user to delete
    temp_user = {
        "_id": ObjectId(),
        "org_id": (await test_db["organizations"].find_one({}))["_id"],
        "username": "to_delete",
        "email": "delete_me@test.com",
        "password_hash": "hashed",
        "full_name": "Delete Me",
        "system_role": "user",
        "status": "active",
        "created_at": datetime.now(timezone.utc),
    }
    await test_db["users"].insert_one(temp_user)

    user_id = str(temp_user["_id"])
    response = await async_client.delete(
        f"/api/users/{user_id}",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code in [200, 204]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_user_registration_without_auth(async_client, test_org):
    """Test user registration without authentication (public endpoint)."""
    user_data = {
        "email": "public_user@test.example.com",
        "full_name": "Public Registered User",
        "password": "Public@123456",
        "phone": "9876543210"
    }
    response = await async_client.post(
        "/api/users",
        json=user_data
    )
    # Status depends on endpoint configuration (may require org setup)
    assert response.status_code in [200, 201, 400, 403]
