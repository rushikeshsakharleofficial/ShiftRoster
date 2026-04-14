# ShiftMaster - Shift Roster & Management Dashboard PRD

## Original Problem Statement
Full-stack Shift Roster & Management Dashboard covering all 4 phases:
- Phase 1: Auth, roles, Employee CRUD, Manager Groups, Departments
- Phase 2: Shift CRUD, templates, calendar, assignments, availability, leave
- Phase 3: WebSocket presence, calendar sticky notes, notifications, swaps
- Phase 4: Attendance, dashboard widgets, reports, audit log

## Architecture
- **Frontend**: React + Tailwind + shadcn/UI
- **Backend**: FastAPI (Python) + MongoDB
- **Auth**: JWT Bearer tokens (localStorage)
- **Realtime**: FastAPI WebSocket (in-memory presence)
- **Theme**: Dark/Light mode with Swiss aesthetic

## User Personas
1. **Admin** - Full system access, org management
2. **Manager** - Shift management, employee oversight, approvals
3. **Employee L1** - View own shifts, clock in/out
4. **Employee L2** - L1 + availability, leave, swaps, team view
5. **Employee L3** - L2 + dept schedule, calendar notes, replies

## Core Requirements
- JWT auth with role-based access control
- Department/Position management
- Manager Groups with dept assignments
- Shift calendar (week/month views) with dept color coding
- Shift templates and assignments
- Leave requests with approval workflow
- Availability management
- Swap requests with approval
- Calendar sticky notes with visibility levels + replies
- Attendance clock-in/out
- In-app notifications
- Reports overview dashboard
- Audit log (admin)
- Organization settings
- WebSocket real-time presence (avatar bar)
- Dark/Light mode toggle

## What's Been Implemented (April 14, 2026)
### Backend (FastAPI + MongoDB)
- Modular route architecture: auth, users, departments, manager_groups, shifts, leave, operations
- 22+ API endpoints all tested and working
- JWT Bearer token auth with role enforcement
- Admin seeding with demo departments
- Audit logging on all CRUD operations
- Notification system
- WebSocket presence endpoint

### Frontend (React + shadcn/UI)
- 12 pages: Login, Register, Dashboard, Employees, Departments, ManagerGroups, ShiftCalendar, LeaveManagement, Attendance, SwapRequests, Notifications, Reports, AuditLog, Settings
- Role-based sidebar navigation
- Split-screen login page
- Interactive shift calendar with week/month views
- Employee management with search, filters, level change
- Leave request approval workflow
- Clock-in/out functionality
- Theme toggle (dark/light)
- Presence bar with online user avatars

## Prioritized Backlog
### P0 (Next)
- Drag-and-drop shift scheduling
- Shift conflict detection
- Recurring shift support

### P1
- CSV/PDF export for reports
- Detailed attendance reports with charts
- Manager nomination workflow
- Open shift claims approval

### P2
- QR code clock-in/out
- Email notifications via SMTP
- Mobile responsive improvements
- Shift templates with quick-apply
- Employee skills-based assignment suggestions
- Leave balance tracking

## Test Credentials
- Admin: admin@shiftmaster.com / admin123
