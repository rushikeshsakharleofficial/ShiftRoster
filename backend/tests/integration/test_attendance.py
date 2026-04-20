"""Integration tests for attendance tracking endpoints."""
import pytest


@pytest.mark.integration
@pytest.mark.asyncio
async def test_clock_in(async_client, admin_token):
    """Test employee clock-in."""
    clock_in_data = {"method": "web"}
    response = await async_client.post(
        "/api/attendance/clock-in",
        json=clock_in_data,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code in [200, 201, 400, 409]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_clock_out(async_client, admin_token):
    """Test employee clock-out."""
    response = await async_client.post(
        "/api/attendance/clock-out",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code in [200, 201, 400, 409]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_list_attendance(async_client, admin_token):
    """Test listing attendance records."""
    response = await async_client.get(
        "/api/attendance",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, (list, dict))
