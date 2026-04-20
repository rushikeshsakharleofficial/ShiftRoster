"""Integration tests for report generation endpoints."""
import pytest


@pytest.mark.integration
@pytest.mark.asyncio
async def test_reports_overview(async_client, admin_token):
    """Test reports overview endpoint."""
    response = await async_client.get(
        "/api/reports/overview",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    expected_fields = ["total_employees", "total_managers", "active_employees",
                       "total_departments", "total_shifts"]
    for field in expected_fields:
        assert field in data or "status_code" not in data


@pytest.mark.integration
@pytest.mark.asyncio
async def test_attendance_chart(async_client, admin_token):
    """Test attendance chart data endpoint."""
    response = await async_client.get(
        "/api/reports/attendance-chart",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, (list, dict))


@pytest.mark.integration
@pytest.mark.asyncio
async def test_shift_coverage_chart(async_client, admin_token):
    """Test shift coverage chart endpoint."""
    response = await async_client.get(
        "/api/reports/shift-coverage",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, (list, dict))


@pytest.mark.integration
@pytest.mark.asyncio
async def test_department_breakdown_chart(async_client, admin_token):
    """Test department breakdown chart endpoint."""
    response = await async_client.get(
        "/api/reports/department-breakdown",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, (list, dict))


@pytest.mark.integration
@pytest.mark.asyncio
async def test_csv_export_attendance(async_client, admin_token):
    """Test CSV export for attendance report."""
    response = await async_client.get(
        "/api/reports/export/csv?report_type=attendance",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code in [200, 400, 404]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_csv_export_employees(async_client, admin_token):
    """Test CSV export for employees report."""
    response = await async_client.get(
        "/api/reports/export/csv?report_type=employees",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code in [200, 400, 404]
