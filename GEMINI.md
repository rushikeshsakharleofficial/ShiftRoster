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
    - `src/pages/`: Main application screens (including new Sticky Notes and Setup pages).
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

## Key Features & Recent Additions
- **Sticky Notes**: Overlay notes on the calendar for quick coordination.
- **Fullscreen Calendar**: Dedicated view for large-scale shift management.
- **Setup Workflow**: Streamlined first-time organization setup.
- **Responsive Sidebar**: Collapsible navigation with mobile-first design.
- **Shift Management**: Drag-and-drop scheduling, recurring shifts, and conflict detection.

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
