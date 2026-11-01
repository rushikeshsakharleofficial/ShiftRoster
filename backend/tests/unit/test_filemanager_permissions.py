"""Tenant-isolation regression tests for file manager permission helpers."""
import pytest
from bson import ObjectId
from routes.filemanager import _can_read, _can_mutate


@pytest.fixture
def item():
    return {
        "org_id": ObjectId(),
        "owner_id": ObjectId(),
        "scope": "private",
    }


def user_for(item, role, *, same_org=True, owner=False):
    return {
        "id": str(item["owner_id"] if owner else ObjectId()),
        "org_id": str(item["org_id"] if same_org else ObjectId()),
        "system_role": role,
    }


@pytest.mark.parametrize("role", ["admin", "manager", "employee"])
def test_other_organisations_denied_even_to_admin(item, role):
    user = user_for(item, role, same_org=False, owner=True)
    for scope in ("private", "shared"):
        item["scope"] = scope
        assert not _can_read(item, user)
        assert not _can_mutate(item, user)


def test_owner_can_read_and_mutate_private_file(item):
    user = user_for(item, "employee", owner=True)
    assert _can_read(item, user)
    assert _can_mutate(item, user)


@pytest.mark.parametrize("role", ["admin", "manager"])
def test_in_tenant_privileged_users_can_manage_private_files(item, role):
    user = user_for(item, role)
    assert _can_read(item, user)
    assert _can_mutate(item, user)


def test_other_employee_cannot_read_or_mutate_private_file(item):
    user = user_for(item, "employee")
    assert not _can_read(item, user)
    assert not _can_mutate(item, user)


def test_shared_file_visible_but_not_editable_by_other_employee(item):
    item["scope"] = "shared"
    user = user_for(item, "employee")
    assert _can_read(item, user)
    assert not _can_mutate(item, user)


@pytest.mark.parametrize("missing_org_on", ["item", "user"])
def test_missing_organisation_denied(item, missing_org_on):
    user = user_for(item, "admin")
    if missing_org_on == "item":
        item.pop("org_id")
    else:
        user.pop("org_id")
    assert not _can_read(item, user)
    assert not _can_mutate(item, user)


def test_unknown_scope_cannot_be_read(item):
    user = user_for(item, "admin")
    item["scope"] = "unexpected"
    assert not _can_read(item, user)


@pytest.mark.parametrize("missing", ["both", "owner", "user"])
def test_missing_ownership_identifiers_never_grant_access(item, missing):
    user = user_for(item, "employee")
    if missing in ("both", "owner"):
        item.pop("owner_id")
    if missing in ("both", "user"):
        user.pop("id")
    assert not _can_read(item, user)
    assert not _can_mutate(item, user)
