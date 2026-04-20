"""Integration tests for authentication endpoints."""
import pytest


@pytest.mark.integration
@pytest.mark.asyncio
async def test_login_success(async_client, test_admin_user):
    """Test successful admin login."""
    response = await async_client.post(
        "/api/auth/login",
        json={
            "email": test_admin_user["email"],
            "password": "Admin@123456"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data


@pytest.mark.integration
@pytest.mark.asyncio
async def test_login_invalid_credentials(async_client):
    """Test login with invalid credentials."""
    response = await async_client.post(
        "/api/auth/login",
        json={
            "email": "nonexistent@test.com",
            "password": "wrongpassword"
        }
    )
    assert response.status_code in [401, 400]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_me_endpoint(async_client, admin_token):
    """Test current user endpoint returns user details."""
    response = await async_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    expected_fields = ["id", "email", "full_name", "system_role"]
    assert all(field in data for field in expected_fields)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_me_endpoint_without_auth(async_client):
    """Test current user endpoint without authorization."""
    response = await async_client.get("/api/auth/me")
    assert response.status_code in [401, 403]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_login_manager_user(async_client, test_manager_user):
    """Test login with manager credentials."""
    response = await async_client.post(
        "/api/auth/login",
        json={
            "email": test_manager_user["email"],
            "password": "Manager@123456"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["system_role"] == "manager"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_login_employee_user(async_client, test_employee_user):
    """Test login with employee credentials."""
    response = await async_client.post(
        "/api/auth/login",
        json={
            "email": test_employee_user["email"],
            "password": "Employee@123456"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["system_role"] == "user"
