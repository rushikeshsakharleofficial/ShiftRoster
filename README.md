# ShiftRoster

Shift management platform for operations teams. Schedule rosters, track attendance, route leave/swap requests, run handovers, and chat — all in one workspace.

## Stack

**Backend** — FastAPI · MongoDB (Motor async driver) · JWT + MFA (pyotp) · WebSockets for chat presence and live messaging.

**Frontend** — React 19 · Vite · Tailwind CSS · Radix UI primitives · shadcn-style component library · React Router 7 · Recharts for analytics.

**Infra** — Docker Compose (mongo + backend + frontend + nginx).

## Features

- **Shift calendar** — week/month views, drag-and-drop assignment, shift templates, swap requests
- **Employees** — directory, departments, manager groups, presence indicators
- **Leave management** — request, approve, audit trail
- **Attendance** — clock-in/out, late tracking, reports
- **Handovers** — structured shift handover notes
- **Chat** — channels + DMs, file attachments, emojis, optional E2E encryption, real-time via WebSockets, AMOLED-friendly dark theme
- **Sticky notes** — draggable team notes board
- **Reports** — filled-shift, late, attendance analytics (recharts)
- **Settings** — org branding, theme toggle (light + AMOLED), MFA setup, audit log, notifications

## Quick Start (Docker)

Create a `.env` at the repo root (no template is committed). Required keys consumed by `docker-compose.yml`:

```
JWT_SECRET=change-me
```
Optional: `MONGO_URL`, `DB_NAME` (defaults set in compose).

```bash
docker compose up -d
docker compose logs -f backend
```

App available at `http://localhost` (nginx). Backend health: `http://localhost:8000/api/health`.

Create the first admin:
```bash
docker compose exec backend python create_admin.py
```

## Local Dev

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm start                  # vite dev server on :3000
```

Frontend expects `REACT_APP_BACKEND_URL` in `frontend/.env`:
```
REACT_APP_BACKEND_URL=http://localhost:8000
```

## Project Structure

```
backend/
  server.py              # FastAPI entry
  db.py                  # Motor MongoDB client
  auth_utils.py          # JWT + MFA helpers
  presence_manager.py    # WS presence tracking
  email_utils.py         # SMTP notifications
  routes/                # auth, chat, shifts, leave,
                         # departments, handovers,
                         # manager_groups, operations,
                         # sticky_notes, tasks, users,
                         # announcements
  tasks/                 # background jobs
  Dockerfile

frontend/
  src/
    pages/               # 17 route-level pages
    components/
      ui/                # shadcn primitives
      blocks/            # higher-level blocks (Sidebar)
      chat/              # MediaMenu etc.
      layout/            # AppLayout, ChatLayout, ThemeToggle
    contexts/            # AuthContext, ChatContext
    hooks/               # use-media-query, use-is-mobile, use-toast
    lib/                 # api, crypto, utils
    index.css            # CSS vars (light + AMOLED dark)
  tailwind.config.js
  vite.config.js

docker-compose.yml
nginx/                   # reverse proxy + static frontend
docs/plans/              # design/implementation plans
```

## Theming

Two themes, toggled via header button (state in `localStorage` key `theme`):
- **Light** — default off-white
- **AMOLED dark** — pure black (`#000000`) background, OLED-friendly

CSS variables live in `frontend/src/index.css` (`:root` + `.dark`). Tailwind tokens defined in `frontend/tailwind.config.js`.

## Tests

`backend_test.py` and `qa_test_suite.py` at the repo root contain end-to-end test scripts. Run with the Python interpreter that has the backend deps installed (`pytest` is not pinned in `backend/requirements.txt` — verify before invoking via pytest). Additional scaffolding lives in `tests/`.

## License

License TBD — no LICENSE file in the repo.
