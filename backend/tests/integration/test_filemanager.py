"""Integration tests for the file manager endpoints."""
import io
import pytest
from bson import ObjectId
from datetime import datetime, timezone

from auth_utils import hash_password


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── Folder CRUD ──

@pytest.mark.integration
@pytest.mark.asyncio
async def test_create_folder(async_client, employee_token):
    resp = await async_client.post(
        "/api/files/folder",
        json={"name": "My Folder", "scope": "private"},
        headers=_auth(employee_token),
    )
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["name"] == "My Folder"
    assert data["type"] == "folder"
    assert data["scope"] == "private"
    assert data.get("parent_id") is None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_list_items_in_folder(async_client, employee_token):
    # Create parent
    parent_resp = await async_client.post(
        "/api/files/folder",
        json={"name": "Parent", "scope": "private"},
        headers=_auth(employee_token),
    )
    parent_id = parent_resp.json()["id"]

    # Create child folder
    await async_client.post(
        "/api/files/folder",
        json={"name": "Child", "scope": "private", "parent_id": parent_id},
        headers=_auth(employee_token),
    )

    # List inside parent
    list_resp = await async_client.get(
        f"/api/files/?scope=private&parent_id={parent_id}",
        headers=_auth(employee_token),
    )
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert any(i["name"] == "Child" for i in items)


# ── Upload / Download ──

@pytest.mark.integration
@pytest.mark.asyncio
async def test_upload_file(async_client, employee_token, test_employee_user):
    content = b"hello filemanager"
    files = {"file": ("greeting.txt", io.BytesIO(content), "text/plain")}
    resp = await async_client.post(
        "/api/files/upload?scope=private",
        files=files,
        headers=_auth(employee_token),
    )
    assert resp.status_code in (200, 201)
    data = resp.json()
    assert data["name"] == "greeting.txt"
    assert data["size"] == len(content)
    assert data["type"] == "file"
    assert data["storage_name"]

    # Verify bytes saved on disk at the expected path
    from routes.filemanager import FM_ROOT
    org_id = str(test_employee_user["org_id"])
    path = FM_ROOT / org_id / data["storage_name"]
    assert path.exists()
    assert path.read_bytes() == content


@pytest.mark.integration
@pytest.mark.asyncio
async def test_download_file(async_client, employee_token):
    content = b"download me please"
    files = {"file": ("dl.txt", io.BytesIO(content), "text/plain")}
    up = await async_client.post(
        "/api/files/upload?scope=private",
        files=files,
        headers=_auth(employee_token),
    )
    item_id = up.json()["id"]

    dl = await async_client.get(
        f"/api/files/{item_id}/download",
        headers=_auth(employee_token),
    )
    assert dl.status_code == 200
    assert dl.content == content


# ── Rename / Move ──

@pytest.mark.integration
@pytest.mark.asyncio
async def test_rename_item(async_client, employee_token):
    create = await async_client.post(
        "/api/files/folder",
        json={"name": "OldName", "scope": "private"},
        headers=_auth(employee_token),
    )
    item_id = create.json()["id"]

    rename = await async_client.put(
        f"/api/files/{item_id}",
        json={"name": "NewName"},
        headers=_auth(employee_token),
    )
    assert rename.status_code == 200
    assert rename.json()["name"] == "NewName"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_move_item(async_client, employee_token):
    # Create two folders at root
    a = await async_client.post(
        "/api/files/folder",
        json={"name": "FolderA", "scope": "private"},
        headers=_auth(employee_token),
    )
    b = await async_client.post(
        "/api/files/folder",
        json={"name": "FolderB", "scope": "private"},
        headers=_auth(employee_token),
    )
    a_id = a.json()["id"]
    b_id = b.json()["id"]

    # Move A under B
    move = await async_client.post(
        f"/api/files/{a_id}/move",
        json={"new_parent_id": b_id},
        headers=_auth(employee_token),
    )
    assert move.status_code == 200
    moved = move.json()
    assert str(moved["parent_id"]) == b_id


# ── Delete (recursive) ──

@pytest.mark.integration
@pytest.mark.asyncio
async def test_delete_folder_recursive(async_client, employee_token, test_db):
    # Create parent folder + child folder + child file
    parent = await async_client.post(
        "/api/files/folder",
        json={"name": "ParentDel", "scope": "private"},
        headers=_auth(employee_token),
    )
    parent_id = parent.json()["id"]

    child_folder = await async_client.post(
        "/api/files/folder",
        json={"name": "ChildDel", "scope": "private", "parent_id": parent_id},
        headers=_auth(employee_token),
    )
    child_folder_id = child_folder.json()["id"]

    files = {"file": ("nested.txt", io.BytesIO(b"nested"), "text/plain")}
    child_file = await async_client.post(
        f"/api/files/upload?scope=private&parent_id={parent_id}",
        files=files,
        headers=_auth(employee_token),
    )
    child_file_id = child_file.json()["id"]

    # Delete the parent
    resp = await async_client.delete(
        f"/api/files/{parent_id}",
        headers=_auth(employee_token),
    )
    assert resp.status_code == 200

    # Verify everything gone from DB
    remaining = await test_db["filemanager_items"].find({
        "_id": {"$in": [ObjectId(parent_id), ObjectId(child_folder_id), ObjectId(child_file_id)]}
    }).to_list(None)
    assert remaining == []


# ── Scope isolation ──

@pytest.mark.integration
@pytest.mark.asyncio
async def test_private_scope_hidden_from_other_user(
    async_client, test_db, test_org, test_employee_user, employee_token
):
    # Create a second employee in the same org
    other = {
        "_id": ObjectId(),
        "org_id": test_org["_id"],
        "username": "otheremp",
        "email": "other@test.example.com",
        "password_hash": hash_password("Other@123456"),
        "full_name": "Other Employee",
        "phone": "+1234567893",
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
    await test_db["users"].insert_one(other)

    login = await async_client.post(
        "/api/auth/login",
        json={"email": other["email"], "password": "Other@123456"},
    )
    other_token = login.json()["access_token"]

    # First employee uploads a private folder
    await async_client.post(
        "/api/files/folder",
        json={"name": "OnlyMine", "scope": "private"},
        headers=_auth(employee_token),
    )

    # Other employee lists private root
    resp = await async_client.get(
        "/api/files/?scope=private",
        headers=_auth(other_token),
    )
    assert resp.status_code == 200
    names = [i["name"] for i in resp.json()]
    assert "OnlyMine" not in names


@pytest.mark.integration
@pytest.mark.asyncio
async def test_shared_scope_visible_to_org(
    async_client, test_db, test_org, employee_token
):
    # Create a second employee
    other = {
        "_id": ObjectId(),
        "org_id": test_org["_id"],
        "username": "otheremp2",
        "email": "other2@test.example.com",
        "password_hash": hash_password("Other@123456"),
        "full_name": "Other Employee 2",
        "phone": "+1234567894",
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
    await test_db["users"].insert_one(other)

    login = await async_client.post(
        "/api/auth/login",
        json={"email": other["email"], "password": "Other@123456"},
    )
    other_token = login.json()["access_token"]

    # Employee #1 creates a shared folder
    await async_client.post(
        "/api/files/folder",
        json={"name": "SharedFolder", "scope": "shared"},
        headers=_auth(employee_token),
    )

    # Employee #2 should see it under shared scope
    resp = await async_client.get(
        "/api/files/?scope=shared",
        headers=_auth(other_token),
    )
    assert resp.status_code == 200
    names = [i["name"] for i in resp.json()]
    assert "SharedFolder" in names


@pytest.mark.integration
@pytest.mark.asyncio
async def test_admin_can_delete_others_item(
    async_client, employee_token, admin_token
):
    # Employee creates a folder
    create = await async_client.post(
        "/api/files/folder",
        json={"name": "EmpFolder", "scope": "private"},
        headers=_auth(employee_token),
    )
    item_id = create.json()["id"]

    # Admin deletes it
    resp = await async_client.delete(
        f"/api/files/{item_id}",
        headers=_auth(admin_token),
    )
    assert resp.status_code == 200


# ── Limits & blocks ──

@pytest.mark.integration
@pytest.mark.asyncio
async def test_upload_rejected_over_max_size(
    async_client, test_db, test_org, employee_token
):
    # Set org's max_file_mb to 1
    await test_db["organizations"].update_one(
        {"_id": test_org["_id"]},
        {"$set": {"file_manager": {"max_file_mb": 1}}},
    )

    # 2 MB payload
    big = b"A" * (2 * 1024 * 1024)
    files = {"file": ("too_big.txt", io.BytesIO(big), "text/plain")}
    resp = await async_client.post(
        "/api/files/upload?scope=private",
        files=files,
        headers=_auth(employee_token),
    )
    assert resp.status_code == 413


@pytest.mark.integration
@pytest.mark.asyncio
async def test_blocked_extension_rejected(async_client, employee_token):
    files = {"file": ("evil.exe", io.BytesIO(b"MZ"), "application/octet-stream")}
    resp = await async_client.post(
        "/api/files/upload?scope=private",
        files=files,
        headers=_auth(employee_token),
    )
    assert resp.status_code == 400
