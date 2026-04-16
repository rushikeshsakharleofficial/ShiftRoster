#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for ShiftMaster
Tests all major API endpoints with proper authentication
"""

import requests
import sys
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

class ShiftMasterAPITester:
    def __init__(self, base_url: str = "http://localhost:8000/api"):
        self.base_url = base_url
        self.session = requests.Session()
        self.access_token = None
        self.refresh_token = None
        self.admin_user = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []

    def log_result(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {test_name}")
        else:
            self.failed_tests.append({"test": test_name, "details": details})
            print(f"❌ {test_name} - {details}")

    def make_request(self, method: str, endpoint: str, data: Optional[Dict] = None, 
                    expected_status: int = 200, use_auth: bool = True) -> tuple[bool, Dict]:
        """Make HTTP request with proper error handling"""
        url = f"{self.base_url}{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if use_auth and self.access_token:
            headers['Authorization'] = f'Bearer {self.access_token}'

        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers, timeout=30)
            else:
                return False, {"error": f"Unsupported method: {method}"}

            success = response.status_code == expected_status
            try:
                response_data = response.json()
            except:
                response_data = {"status_code": response.status_code, "text": response.text[:200]}

            return success, response_data

        except requests.exceptions.RequestException as e:
            return False, {"error": str(e)}

    def test_health_check(self) -> bool:
        """Test basic health endpoint"""
        success, data = self.make_request('GET', '/health', use_auth=False)
        self.log_result("Health Check", success and data.get('status') == 'ok', 
                       f"Response: {data}")
        return success

    def test_admin_login(self) -> bool:
        """Test admin login and store tokens"""
        login_data = {
            "email": "admin@shiftmaster.com",
            "password": "admin1234567"
        }

        success, data = self.make_request('POST', '/auth/login', login_data, use_auth=False)

        # Check for token in response OR cookies (since we moved to secure cookies)
        self.access_token = data.get('access_token') or self.session.cookies.get('access_token')
        self.refresh_token = data.get('refresh_token') or self.session.cookies.get('refresh_token')

        if success and self.access_token:
            self.admin_user = data
            self.log_result("Admin Login", True, f"Logged in as {data.get('full_name')}")
            return True
        else:
            self.log_result("Admin Login", False, f"Login failed: {data}")
            return False
    def test_auth_me(self) -> bool:
        """Test /auth/me endpoint"""
        success, data = self.make_request('GET', '/auth/me')
        expected_fields = ['id', 'email', 'full_name', 'system_role']
        has_fields = all(field in data for field in expected_fields)
        
        self.log_result("Auth Me", success and has_fields, 
                       f"Missing fields: {[f for f in expected_fields if f not in data]}" if not has_fields else "")
        return success and has_fields

    def test_user_registration(self) -> bool:
        """Test user registration"""
        timestamp = datetime.now().strftime("%H%M%S")
        register_data = {
            "email": f"test_user_{timestamp}@example.com",
            "password": "TestPass123456!",
            "full_name": f"Test User {timestamp}",
            "phone": "1234567890"
        }
        
        success, data = self.make_request('POST', '/auth/register', register_data, 
                                        expected_status=200, use_auth=False)
        
        self.log_result("User Registration", success and 'id' in data, 
                       f"Registration response: {data}")
        return success

    def test_departments_crud(self) -> bool:
        """Test departments CRUD operations"""
        # List departments
        success, data = self.make_request('GET', '/departments')
        if not success:
            self.log_result("List Departments", False, f"Failed to list: {data}")
            return False
        
        initial_count = len(data) if isinstance(data, list) else 0
        self.log_result("List Departments", True, f"Found {initial_count} departments")
        
        # Create department
        dept_data = {
            "name": f"Test Dept {datetime.now().strftime('%H%M%S')}",
            "color_hex": "#FF5733"
        }
        
        success, created_dept = self.make_request('POST', '/departments', dept_data, expected_status=200)
        if not success:
            self.log_result("Create Department", False, f"Failed to create: {created_dept}")
            return False
        
        dept_id = created_dept.get('id')
        self.log_result("Create Department", success and dept_id, f"Created dept ID: {dept_id}")
        
        # Update department
        if dept_id:
            update_data = {"name": "Updated Test Dept", "color_hex": "#33FF57"}
            success, updated_dept = self.make_request('PUT', f'/departments/{dept_id}', update_data)
            self.log_result("Update Department", success, f"Update response: {updated_dept}")
            
            # Delete department
            success, _ = self.make_request('DELETE', f'/departments/{dept_id}')
            self.log_result("Delete Department", success, "Department deleted")
        
        return True

    def test_users_crud(self) -> bool:
        """Test users CRUD operations"""
        # List users
        success, data = self.make_request('GET', '/users')
        if not success:
            self.log_result("List Users", False, f"Failed to list: {data}")
            return False
        
        users_count = data.get('total', 0) if isinstance(data, dict) else 0
        self.log_result("List Users", True, f"Found {users_count} users")
        
        # Create user
        timestamp = datetime.now().strftime("%H%M%S")
        user_data = {
            "email": f"test_emp_{timestamp}@example.com",
            "password": "TestPass123!",
            "full_name": f"Test Employee {timestamp}",
            "phone": "9876543210",
            "system_role": "employee",
            "employee_level": "L1",
            "employment_type": "full_time"
        }
        
        success, created_user = self.make_request('POST', '/users', user_data)
        if not success:
            self.log_result("Create User", False, f"Failed to create: {created_user}")
            return False
        
        user_id = created_user.get('id')
        self.log_result("Create User", success and user_id, f"Created user ID: {user_id}")
        
        # Update user
        if user_id:
            update_data = {"full_name": "Updated Test Employee", "employee_level": "L2"}
            success, updated_user = self.make_request('PUT', f'/users/{user_id}', update_data)
            self.log_result("Update User", success, f"Update response: {updated_user}")
            
            # Get user
            success, user_detail = self.make_request('GET', f'/users/{user_id}')
            self.log_result("Get User", success and user_detail.get('id') == user_id, 
                           f"User detail: {user_detail}")
        
        return True

    def test_shifts_crud(self) -> bool:
        """Test shifts CRUD operations"""
        # List shifts
        success, data = self.make_request('GET', '/shifts')
        if not success:
            self.log_result("List Shifts", False, f"Failed to list: {data}")
            return False
        
        shifts_count = len(data) if isinstance(data, list) else 0
        self.log_result("List Shifts", True, f"Found {shifts_count} shifts")
        
        # Create shift
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%dT09:00:00")
        end_time = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%dT17:00:00")
        
        shift_data = {
            "title": f"Test Shift {datetime.now().strftime('%H%M%S')}",
            "start_time": tomorrow,
            "end_time": end_time,
            "required_count": 2,
            "location": "Test Location",
            "notes": "Test shift notes",
            "is_open": False
        }
        
        success, created_shift = self.make_request('POST', '/shifts', shift_data)
        if not success:
            self.log_result("Create Shift", False, f"Failed to create: {created_shift}")
            return False
        
        shift_id = created_shift.get('id')
        self.log_result("Create Shift", success and shift_id, f"Created shift ID: {shift_id}")
        
        # Get shift detail
        if shift_id:
            success, shift_detail = self.make_request('GET', f'/shifts/{shift_id}')
            self.log_result("Get Shift", success and shift_detail.get('id') == shift_id, 
                           f"Shift detail: {shift_detail}")
        
        return True

    def test_attendance_operations(self) -> bool:
        """Test attendance clock in/out operations"""
        # Clock in
        clock_in_data = {"method": "web"}
        success, clock_in_response = self.make_request('POST', '/attendance/clock-in', clock_in_data)
        
        if success:
            self.log_result("Clock In", True, f"Clocked in: {clock_in_response}")
            
            # Clock out
            success, clock_out_response = self.make_request('POST', '/attendance/clock-out')
            self.log_result("Clock Out", success, f"Clock out: {clock_out_response}")
        else:
            # Might already be clocked in, try clock out first
            success, _ = self.make_request('POST', '/attendance/clock-out')
            if success:
                # Now try clock in again
                success, clock_in_response = self.make_request('POST', '/attendance/clock-in', clock_in_data)
                self.log_result("Clock In (after clock out)", success, f"Clocked in: {clock_in_response}")
            else:
                self.log_result("Clock In", False, f"Failed: {clock_in_response}")
        
        # List attendance
        success, attendance_list = self.make_request('GET', '/attendance')
        self.log_result("List Attendance", success, f"Attendance records: {len(attendance_list) if isinstance(attendance_list, list) else 0}")
        
        return True

    def test_notifications(self) -> bool:
        """Test notifications endpoint"""
        success, data = self.make_request('GET', '/notifications')
        
        if success and isinstance(data, dict):
            notifications = data.get('notifications', [])
            unread_count = data.get('unread_count', 0)
            self.log_result("List Notifications", True, 
                           f"Found {len(notifications)} notifications, {unread_count} unread")
        else:
            self.log_result("List Notifications", False, f"Failed: {data}")
        
        return success

    def test_reports_overview(self) -> bool:
        """Test reports overview endpoint"""
        success, data = self.make_request('GET', '/reports/overview')
        
        if success:
            expected_fields = ['total_employees', 'total_managers', 'active_employees', 
                             'total_departments', 'total_shifts']
            has_fields = all(field in data for field in expected_fields)
            self.log_result("Reports Overview", has_fields, 
                           f"Stats: {data}" if has_fields else f"Missing fields: {[f for f in expected_fields if f not in data]}")
        else:
            self.log_result("Reports Overview", False, f"Failed: {data}")
        
        return success

    def test_audit_logs(self) -> bool:
        """Test audit logs endpoint"""
        success, data = self.make_request('GET', '/audit-logs')
        
        if success and isinstance(data, dict):
            logs = data.get('logs', [])
            total = data.get('total', 0)
            self.log_result("Audit Logs", True, f"Found {len(logs)} logs, total: {total}")
        else:
            self.log_result("Audit Logs", False, f"Failed: {data}")
        
        return success

    def test_websocket_presence(self) -> bool:
        """Test WebSocket presence endpoint"""
        success, data = self.make_request('GET', '/presence')
        
        if success and isinstance(data, list):
            self.log_result("WebSocket Presence", True, f"Online users: {len(data)}")
        else:
            self.log_result("WebSocket Presence", False, f"Failed: {data}")
        
        return success

    def test_shift_drag_drop(self) -> bool:
        """Test drag-and-drop shift move functionality"""
        # First create a shift to move
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%dT09:00:00")
        end_time = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%dT17:00:00")
        
        shift_data = {
            "title": f"Movable Shift {datetime.now().strftime('%H%M%S')}",
            "start_time": tomorrow,
            "end_time": end_time,
            "required_count": 1,
            "location": "Test Location"
        }
        
        success, created_shift = self.make_request('POST', '/shifts', shift_data)
        if not success:
            self.log_result("Create Shift for Move", False, f"Failed to create: {created_shift}")
            return False
        
        shift_id = created_shift.get('id')
        if not shift_id:
            self.log_result("Create Shift for Move", False, "No shift ID returned")
            return False
        
        # Test moving the shift to next day
        next_day = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%dT10:00:00")
        next_end = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%dT18:00:00")
        
        move_data = {
            "new_start_time": next_day,
            "new_end_time": next_end
        }
        
        success, move_response = self.make_request('PUT', f'/shifts/{shift_id}/move', move_data)
        self.log_result("Shift Drag-Drop Move", success, 
                       f"Move response: {move_response}")
        
        return success

    def test_conflict_detection(self) -> bool:
        """Test shift conflict detection"""
        # Create a user first to test conflicts
        timestamp = datetime.now().strftime("%H%M%S")
        user_data = {
            "email": f"conflict_test_{timestamp}@example.com",
            "password": "TestPass123!",
            "full_name": f"Conflict Test User {timestamp}",
            "phone": "5555555555",
            "system_role": "employee"
        }
        
        success, created_user = self.make_request('POST', '/users', user_data)
        if not success:
            self.log_result("Create User for Conflict Test", False, f"Failed: {created_user}")
            return False
        
        user_id = created_user.get('id')
        
        # Test conflict detection
        conflict_data = {
            "user_id": user_id,
            "start_time": "2024-12-20T09:00:00",
            "end_time": "2024-12-20T17:00:00"
        }
        
        success, conflict_response = self.make_request('POST', '/shifts/check-conflicts', conflict_data)
        self.log_result("Conflict Detection", success and 'has_conflicts' in conflict_response, 
                       f"Conflict check: {conflict_response}")
        
        return success

    def test_recurring_shifts(self) -> bool:
        """Test recurring shift creation"""
        recurring_data = {
            "title": f"Recurring Test Shift {datetime.now().strftime('%H%M%S')}",
            "start_time": "09:00",
            "end_time": "17:00",
            "rrule": "FREQ=WEEKLY;BYDAY=MO,WE,FR",
            "range_start": "2024-12-20",
            "range_end": "2024-12-27",
            "required_count": 1,
            "location": "Test Location"
        }
        
        success, recurring_response = self.make_request('POST', '/shifts/recurring', recurring_data)
        
        if success and 'created_count' in recurring_response:
            created_count = recurring_response.get('created_count', 0)
            self.log_result("Recurring Shifts", True, 
                           f"Created {created_count} recurring shifts")
        else:
            self.log_result("Recurring Shifts", False, f"Failed: {recurring_response}")
        
        return success

    def test_csv_export(self) -> bool:
        """Test CSV export functionality"""
        export_types = ['attendance', 'employees', 'shifts']
        all_success = True
        
        for export_type in export_types:
            success, response = self.make_request('GET', f'/reports/export/csv?report_type={export_type}')
            
            # For CSV export, we expect either success or a specific response
            if success or (isinstance(response, dict) and response.get('status_code') == 200):
                self.log_result(f"CSV Export ({export_type})", True, 
                               f"Export successful for {export_type}")
            else:
                self.log_result(f"CSV Export ({export_type})", False, 
                               f"Export failed: {response}")
                all_success = False
        
        return all_success

    def test_chart_data_endpoints(self) -> bool:
        """Test chart data endpoints for reports"""
        chart_endpoints = [
            ('/reports/attendance-chart', 'Attendance Chart'),
            ('/reports/shift-coverage', 'Shift Coverage Chart'),
            ('/reports/department-breakdown', 'Department Breakdown Chart')
        ]
        
        all_success = True
        
        for endpoint, name in chart_endpoints:
            success, data = self.make_request('GET', endpoint)
            
            if success and isinstance(data, list):
                self.log_result(name, True, f"Chart data: {len(data)} items")
            else:
                self.log_result(name, False, f"Failed: {data}")
                all_success = False
        
        return all_success

    def test_manager_nominations(self) -> bool:
        """Test manager nomination workflow"""
        # List nominations
        success, nominations_list = self.make_request('GET', '/manager-nominations')
        if not success:
            self.log_result("List Manager Nominations", False, f"Failed: {nominations_list}")
            return False
        
        initial_count = len(nominations_list) if isinstance(nominations_list, list) else 0
        self.log_result("List Manager Nominations", True, f"Found {initial_count} nominations")
        
        # Create a test user to nominate
        timestamp = datetime.now().strftime("%H%M%S")
        user_data = {
            "email": f"nominee_{timestamp}@example.com",
            "password": "TestPass123!",
            "full_name": f"Nominee {timestamp}",
            "phone": "7777777777",
            "system_role": "employee"
        }
        
        success, created_user = self.make_request('POST', '/users', user_data)
        if not success:
            self.log_result("Create Nominee User", False, f"Failed: {created_user}")
            return False
        
        nominee_id = created_user.get('id')
        
        # Create a manager group first
        group_data = {
            "name": f"Test Manager Group {timestamp}"
        }
        
        success, created_group = self.make_request('POST', '/manager-groups', group_data)
        if not success:
            self.log_result("Create Manager Group", False, f"Failed: {created_group}")
            return False
        
        group_id = created_group.get('id')
        
        # Create nomination
        nomination_data = {
            "nominee_id": nominee_id,
            "group_id": group_id,
            "reason": "Test nomination for automated testing"
        }
        
        success, created_nomination = self.make_request('POST', '/manager-nominations', nomination_data)
        if not success:
            self.log_result("Create Manager Nomination", False, f"Failed: {created_nomination}")
            return False
        
        nomination_id = created_nomination.get('id')
        self.log_result("Create Manager Nomination", True, f"Created nomination ID: {nomination_id}")
        
        # Test approval
        if nomination_id:
            review_data = {"status": "approved"}
            success, review_response = self.make_request('PUT', f'/manager-nominations/{nomination_id}/review', review_data)
            self.log_result("Approve Manager Nomination", success, f"Review response: {review_response}")
        
        return True

    def run_all_tests(self) -> bool:
        """Run all backend tests"""
        print("🚀 Starting ShiftMaster Backend API Tests")
        print("=" * 50)
        
        # Basic connectivity
        if not self.test_health_check():
            print("❌ Health check failed - stopping tests")
            return False
        
        # Authentication
        if not self.test_admin_login():
            print("❌ Admin login failed - stopping tests")
            return False
        
        # Run all tests
        test_methods = [
            self.test_auth_me,
            self.test_user_registration,
            self.test_departments_crud,
            self.test_users_crud,
            self.test_shifts_crud,
            self.test_shift_drag_drop,
            self.test_conflict_detection,
            self.test_recurring_shifts,
            self.test_csv_export,
            self.test_chart_data_endpoints,
            self.test_manager_nominations,
            self.test_attendance_operations,
            self.test_notifications,
            self.test_reports_overview,
            self.test_audit_logs,
            self.test_websocket_presence,
        ]
        
        for test_method in test_methods:
            try:
                test_method()
            except Exception as e:
                self.log_result(test_method.__name__, False, f"Exception: {str(e)}")
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} passed")
        
        if self.failed_tests:
            print("\n❌ Failed Tests:")
            for failed in self.failed_tests:
                print(f"  • {failed['test']}: {failed['details']}")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"✨ Success Rate: {success_rate:.1f}%")
        
        return success_rate >= 80  # Consider 80%+ as passing

def main():
    """Main test runner"""
    tester = ShiftMasterAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())