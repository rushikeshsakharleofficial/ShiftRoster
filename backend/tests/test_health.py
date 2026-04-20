"""Health check endpoint tests."""
import pytest


@pytest.mark.asyncio
async def test_health_check(async_client):
    """Test health check endpoint."""
    response = await async_client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "service" in data
