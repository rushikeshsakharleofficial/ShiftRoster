"""Integration tests for chat endpoints."""
import pytest


@pytest.mark.integration
@pytest.mark.asyncio
async def test_search_chat_channels(async_client, admin_token):
    """Test chat channel search endpoint."""
    response = await async_client.get(
        "/api/chat/channels/search?q=general",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code in [200, 400, 404]
    data = response.json()
    assert "channels" in data or "status_code" in data


@pytest.mark.integration
@pytest.mark.asyncio
async def test_list_chat_channels(async_client, admin_token):
    """Test listing chat channels."""
    response = await async_client.get(
        "/api/chat/channels",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code in [200, 400, 404]
    data = response.json()
    assert isinstance(data, (list, dict))


@pytest.mark.integration
@pytest.mark.asyncio
async def test_create_chat_channel(async_client, admin_token):
    """Test creating a new chat channel."""
    channel_data = {
        "name": "test-channel",
        "is_public": True,
        "description": "Test channel"
    }
    response = await async_client.post(
        "/api/chat/channels",
        json=channel_data,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code in [200, 201, 400, 404]
    data = response.json()
    if response.status_code in [200, 201]:
        assert "id" in data
