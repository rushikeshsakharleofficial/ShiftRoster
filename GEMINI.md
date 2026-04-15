# ShiftMaster - Shift Roster & Management Dashboard

## Project Overview
ShiftMaster is a full-stack application designed for efficient shift roster management. It provides a comprehensive dashboard for administrators, managers, and employees to handle shift assignments, leave requests, attendance tracking, and performance reporting.

### Core Technologies
- **Frontend**: React 19, Tailwind CSS, shadcn/UI, Recharts, Axios, React Router.
- **Backend**: FastAPI (Python 3), MongoDB (via Motor async driver), JWT Authentication.
- **Realtime**: WebSockets for live presence tracking.
- **Containerization**: Docker & Docker Compose for rapid deployment.
- **Styling**: Vanilla CSS + Tailwind + shadcn/UI (Radix primitives).

### Architecture
- `backend/`: FastAPI application.
    - `routes/`: Modularized API endpoints (auth, users, shifts, leave, sticky notes, etc.).
    - `server.py`: Application entry point and WebSocket handling.
    - `db.py`: MongoDB connection management.
- `frontend/`: React application (bootstrapped with CRA + craco).
    - `src/components/`: Reusable UI components (including shadcn/UI).
    - `src/pages/`: Main application screens (including new Sticky Notes, Audit Log, Reports, Setup pages, etc.).
    - `src/lib/api.js`: Axios client and API interceptors.

---

## Getting Started

### Using Docker (Recommended)
The easiest way to get started is using Docker Compose:
```bash
docker-compose up -d --build
```
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- MongoDB: `mongodb://localhost:27017`

### Manual Backend Setup
1. Navigate to `backend/`.
2. Create a `.env` file with `MONGO_URL`, `DB_NAME`, and `JWT_SECRET`.
3. Install dependencies: `pip install -r requirements.txt`
4. Run: `uvicorn server:app --reload`

### Manual Frontend Setup
1. Navigate to `frontend/`.
2. Install dependencies: `yarn install`
3. Start: `yarn start`

---

## Key Features

### Core Management
- **Role-Based Access Control**: Separate workflows for Admin, Manager, and Employee (L1/L2/L3).
- **Organization Setup**: Streamlined first-time setup workflow.
- **Entity Management**: Comprehensive CRUD for Employees, Departments, and Manager Groups.
- **Manager Workflows**: Manager nomination workflow with admin approval.

### Shift & Roster Capabilities
- **Shift Scheduling**: Drag-and-drop scheduling with conflict detection.
- **Recurring Shifts**: Full support via iCal RRULE (e.g., weekdays, MWF, TTh).
- **Calendar Views**: Both standard week/month views and a dedicated Fullscreen Calendar for large-scale coordination.
- **Sticky Notes**: Overlay notes on the calendar for quick coordination.

### Monitoring & Analytics
- **Live Presence**: Realtime WebSocket presence bar to see who is online.
- **Attendance & Leave**: Automated attendance tracking and leave request management.
- **Detailed Charts (Recharts)**: Visualizations for attendance trends, shift coverage, and department breakdown.
- **Exporting & Reporting**: CSV exports for attendance, employee, and shift reports.
- **Audit Logs & Notifications**: System-wide notifications and tracking of critical changes.

### User Experience
- **Responsive Design**: Collapsible sidebar, mobile-first design, touch-friendly targets, and responsive grids.
- **Theming**: Integrated Dark/Light mode toggle.

---

## Development Conventions

### Backend
- **API Versioning**: All routes are prefixed with `/api`.
- **Auth**: JWT Bearer tokens with fallback HTTP-only cookies.
- **Database**: Async operations with `motor`.

### Frontend
- **State**: React Hooks + `AuthContext.js`.
- **Components**: Follow shadcn/UI patterns in `src/components/ui/`.
- **Responsive**: Use `use-media-query.js` for dynamic layout adjustments.

---

## Testing & Validation
- **Backend**: `python3 backend_test.py` (Tests all 35+ endpoints).
- **Frontend**: `yarn lint` and `yarn test`.

### Credentials
- **Admin**: `admin@shiftmaster.com` / `admin123`

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
