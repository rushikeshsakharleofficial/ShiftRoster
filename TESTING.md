# ShiftRoster Testing Guide

Complete testing infrastructure with unit, integration, and E2E tests.

## Setup

### Backend Testing

```bash
cd backend
pip install -r requirements-dev.txt
```

**Environment Variables:**
```bash
export MONGO_URL=mongodb://root:password@localhost:27017
export DB_NAME=shift_roster_test
export TEST_MONGO_URL=mongodb://root:password@localhost:27017
export TEST_DB_NAME=shift_roster_test
```

### Frontend Testing

```bash
cd frontend
npm install
```

## Running Tests

### Backend - All Tests
```bash
cd backend
pytest tests/ -v
```

### Backend - By Category
```bash
# Unit tests only
pytest tests/unit/ -v

# Integration tests only
pytest tests/integration/ -v

# E2E tests only (requires running services)
pytest tests/e2e/ -v

# Specific test file
pytest tests/integration/test_auth.py -v

# Specific test
pytest tests/integration/test_auth.py::test_login_success -v
```

### Backend - With Coverage
```bash
cd backend
pytest tests/ --cov=. --cov-report=html --cov-report=term-missing
# Open htmlcov/index.html for detailed coverage report
```

### Backend - Linting
```bash
cd backend
flake8 . --count --statistics
black --check .
isort --check .
```

### Frontend - Unit & Integration Tests
```bash
cd frontend
npm run test                  # Watch mode
npm run test:coverage         # Coverage report
npm run test:ui               # Vitest UI mode
```

### Frontend - Linting
```bash
cd frontend
npm run lint                  # Check
npm run format                # Fix
```

### E2E Tests (Frontend Selenium)
```bash
# Prerequisites:
# 1. Start backend: cd backend && python -m uvicorn server:app --reload
# 2. Start frontend: cd frontend && npm start
# 3. Run tests

cd backend
BROWSER_HEADLESS=true BASE_URL=http://localhost:3000 pytest tests/e2e/ -v --tb=short
```

## Test Coverage Targets

- **Backend:** 80% minimum (failing CI if below)
- **Frontend:** 70% minimum (failing CI if below)
- **E2E:** Critical user workflows

## With Docker Compose

```bash
# Start all services
docker-compose up -d

# Run backend tests
docker-compose exec backend pytest tests/ -v

# Run frontend tests
docker-compose exec frontend npm run test:coverage

# Stop services
docker-compose down
```

## CI/CD Pipeline

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests

**Pipeline Steps:**
1. Lint backend & frontend
2. Run backend tests with coverage (80% threshold)
3. Run frontend tests with coverage (70% threshold)
4. Run E2E tests (optional, slower)
5. Upload coverage to Codecov

**Status Check:** ❌ Blocks merge if tests/coverage fail

## Test Structure

```
backend/
├── tests/
│   ├── conftest.py              # Shared fixtures
│   ├── test_health.py           # Health endpoint
│   ├── unit/
│   │   ├── test_models.py
│   │   └── test_validation.py
│   ├── integration/
│   │   ├── test_auth.py         # Auth flows
│   │   ├── test_users.py        # User CRUD
│   │   ├── test_shifts.py       # Shift management
│   │   ├── test_attendance.py   # Attendance tracking
│   │   ├── test_chat.py         # Chat features
│   │   ├── test_reports.py      # Reports
│   │   └── ...
│   └── e2e/
│       ├── conftest.py          # Selenium fixtures
│       ├── test_auth.py         # Login/logout flow
│       ├── test_shift_scheduling.py
│       └── test_leave_workflow.py

frontend/
├── tests/
│   ├── unit/
│   │   ├── components/          # Component tests
│   │   ├── utils/               # Utility function tests
│   │   └── hooks/               # Custom hook tests
│   ├── integration/             # Multi-component flows
│   └── e2e/                     # Playwright tests (future)
└── vitest.config.js
```

## Writing Tests

### Backend Integration Test Example
```python
@pytest.mark.integration
@pytest.mark.asyncio
async def test_create_user(async_client, admin_token):
    """Test creating a new user."""
    response = await async_client.post(
        "/api/users",
        json={"email": "test@example.com", "full_name": "Test User"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code in [200, 201]
    data = response.json()
    assert data["email"] == "test@example.com"
```

### Frontend Component Test Example
```javascript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

describe("LoginForm", () => {
  it("submits form with email and password", async () => {
    const user = userEvent.setup();
    render(<LoginForm onSubmit={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Email"), "test@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "password");
    await user.click(screen.getByRole("button", { name: /login/i }));
  });
});
```

## Fixtures & Helpers

### Backend Conftest Fixtures
- `test_org` - Test organization
- `test_admin_user` - Admin user
- `test_manager_user` - Manager user
- `test_employee_user` - Employee user
- `test_department` - Department
- `test_position` - Position
- `admin_token`, `manager_token`, `employee_token` - Auth tokens
- `async_client` - FastAPI test client
- `test_db` - Test MongoDB instance

### Frontend Test Utilities
- `@testing-library/react` - Component testing
- `@testing-library/user-event` - User interactions
- Vitest - Test runner & mocking

## Debugging

### Backend
```bash
# Verbose output
pytest tests/ -vv --tb=long

# Show print statements
pytest tests/ -s

# Stop on first failure
pytest tests/ -x

# Run only failed tests (after running once)
pytest tests/ --lf
```

### Frontend
```bash
# Run in UI mode
npm run test:ui

# Debug specific test
npm run test -- --reporter=verbose LoginForm.test.jsx

# Watch mode
npm run test -- --watch
```

## Database State During Tests

- **Before each test:** Database is cleaned (all collections dropped)
- **Fixtures create:** Org, users, departments for consistent state
- **Real MongoDB:** Tests use actual MongoDB instance (not mocks)
- **Isolation:** Each test runs in isolation with fresh data

## Performance

**Test Runtimes:**
- Backend unit tests: ~5-10 seconds
- Backend integration tests: ~30-60 seconds
- Frontend tests: ~10-20 seconds
- E2E tests: ~3-5 minutes per suite

Run specific test categories for faster feedback during development.

## Troubleshooting

### Backend Tests Fail with Connection Error
```bash
# Ensure MongoDB is running
docker-compose up -d mongodb
# Or
mongod --dbpath /path/to/data
```

### Frontend Tests Fail with Module Not Found
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### E2E Tests Fail
1. Check services running: `curl http://localhost:8000/api/health`
2. Verify credentials in test files match test data
3. Run with `BROWSER_HEADLESS=false` to see browser

## Coverage Reports

**Backend Coverage Report**
```bash
cd backend
pytest tests/ --cov=. --cov-report=html
open htmlcov/index.html
```

**Frontend Coverage Report**
```bash
cd frontend
npm run test:coverage
open coverage/index.html
```

## Resources

- [Pytest Documentation](https://docs.pytest.org/)
- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [FastAPI Testing](https://fastapi.tiangolo.com/advanced/testing-dependencies/)
- [Selenium Documentation](https://www.selenium.dev/documentation/)
