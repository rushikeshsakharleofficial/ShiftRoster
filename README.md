# ShiftRoster — Operational OS for Mission-Critical Teams

[![CI/CD](https://github.com/rushikeshsakharleofficial/ShiftRoster/actions/workflows/deploy.yml/badge.svg)](https://github.com/rushikeshsakharleofficial/ShiftRoster/actions/workflows/deploy.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React 19](https://img.shields.io/badge/Frontend-React%2019-61DAFB.svg?style=flat&logo=react)](https://react.dev/)
[![MongoDB 7](https://img.shields.io/badge/Database-MongoDB%207-47A248.svg?style=flat&logo=mongodb)](https://www.mongodb.com/)
[![Vite 6](https://img.shields.io/badge/Build-Vite%206-646CFF.svg?style=flat&logo=vite)](https://vitejs.dev/)

**ShiftRoster** is a self-hosted, open-source operational platform for shift-based teams. It combines scheduling, encrypted messaging, document management, task tracking, and identity in a single deployable Docker stack — no third-party SaaS dependencies.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Security](#security)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Shift Scheduling
- Interactive calendar with drag-and-drop shift management
- RRULE-based recurrence engine for repeating shifts
- Shift templates for reusable patterns
- Automated conflict detection on assignment
- Swap request workflow with manager approval
- Leave management with department-scoped review

### Encrypted Team Messaging
- Real-time channels (public/private) and direct messages
- **End-to-End Encryption (E2EE)** — P-256 ECDH key exchange + AES-256-GCM payloads
- BIP39 mnemonic backup for key recovery
- Thread replies, message reactions, file attachments
- Compact slide-over panel mode + full-screen mode
- Stories (disappear after 24 hours)
- WebSocket-based typing indicators and presence

### File Manager
- Private and shared (org-wide) scoped storage
- Native in-browser previews: PDF, DOCX, XLSX, Markdown, JSON, images, video, audio
- Folder hierarchy with drag-and-drop upload
- Admin-configurable max file size
- Attach files from library directly in chat

### Standard Operating Procedures (SOPs)
- Rich TipTap editor (documents, presentations, spreadsheets, checklists)
- Version history with revert
- Proposal → approval workflow for non-privileged users
- Acknowledgement tracking per user
- PDF export, CSV import/export for spreadsheet type
- DOMPurify-sanitized HTML rendering

### Task & Handover Management
- Structured shift handover logbook with task cascading
- Tasks assignable to users, with transfer and completion tracking
- Notes per task, pending count badge

### Attendance & Presence
- Clock-in / clock-out with shift assignment awareness
- Extend shift functionality
- WebSocket-driven real-time online user presence

### Notifications & Announcements
- In-app notification feed with unread badge
- Org-wide announcements with active/inactive toggle
- Security alerts for MFA changes, password resets

### Identity & Access Control
- Role-based system roles: `admin`, `manager`, `employee`
- Manager Groups: scope managers to specific departments
- IAM groups with resource-action permission rules
- Multi-Factor Authentication (TOTP) with backup codes
- Admin-mandated MFA enforcement
- LDAP/Active Directory sync
- Slack OIDC and Google OIDC single sign-on
- Manager nomination workflow

### Reporting
- Attendance overview, charts, and CSV export
- Shift coverage analysis
- Department breakdown
- Audit log for all admin actions

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend framework | FastAPI 0.115 (Python 3.11+) |
| Database | MongoDB 7 + Motor async driver |
| Real-time | WebSocket — presence, chat events, typing |
| Auth | PyJWT (HTTP-only cookies), Bcrypt, PyOTP |
| Encryption | Python Cryptography (Fernet/AES-256-GCM), WebCrypto API |
| Frontend framework | React 19 + Vite 6 |
| Routing | React Router 7 |
| Styling | Tailwind CSS 3 + shadcn/ui + Radix UI |
| Animation | Framer Motion |
| Rich text | Tiptap |
| File parsing | mammoth (DOCX), ExcelJS (XLSX), JSZip |
| HTML sanitization | DOMPurify |
| Reverse proxy | Nginx (SSL termination, rate limiting) |
| Containerization | Docker + Docker Compose |

---

## Architecture

```
ShiftRoster/
├── backend/
│   ├── routes/              # Domain API modules
│   │   ├── auth.py          # Login, MFA, SSO, password reset
│   │   ├── chat.py          # Channels, DMs, messages, file upload
│   │   ├── filemanager.py   # File manager CRUD + streaming download
│   │   ├── sops.py          # SOP CRUD, versioning, approval flow
│   │   ├── shifts.py        # Shifts, recurrence, conflict detection
│   │   ├── users.py         # User management, avatars, presence
│   │   ├── iam.py           # IAM groups and permission rules
│   │   ├── operations.py    # Organization settings, LDAP, branding
│   │   └── ...              # Leave, attendance, tasks, handovers, etc.
│   ├── tasks/               # Background jobs (purging, reminders)
│   ├── server.py            # App entrypoint, WebSocket handler
│   ├── auth_utils.py        # JWT, MFA, permission helpers
│   ├── presence_manager.py  # WebSocket presence tracking
│   ├── db.py                # MongoDB connection pool
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── pages/           # 25+ page components
│   │   ├── components/      # Shared UI (layout, chat, ui primitives)
│   │   ├── contexts/        # AuthContext, ChatContext
│   │   ├── lib/
│   │   │   ├── api.js       # Axios instance + all API calls
│   │   │   └── crypto.js    # WebCrypto E2EE helpers
│   │   └── hooks/
│   └── Dockerfile
│
├── nginx/
│   ├── entrypoint.sh        # Dynamic nginx config (HTTP/HTTPS, rate limiting, CSP)
│   └── Dockerfile
│
└── docker-compose.yml
```

---

## Quick Start

### Prerequisites
- Docker + Docker Compose
- A domain name (for HTTPS) or `localhost` for local testing

### 1. Clone and configure

```bash
git clone https://github.com/rushikeshsakharleofficial/ShiftRoster.git
cd ShiftRoster
cp .env.example .env
```

### 2. Generate required secrets

```bash
# JWT secret (minimum 32 characters)
openssl rand -hex 32

# Message encryption key (Fernet)
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# MongoDB password
openssl rand -hex 16
```

Fill the generated values into `.env`.

### 3. Launch

```bash
docker compose up -d --build
```

### 4. First-time setup

Visit `http://localhost:8080/setup` to create the initial SuperAdmin account.

### HTTPS (production)

Place your SSL certificate and key in `./ssl/`:
```
ssl/cert.pem
ssl/key.pem
```

Set in `.env`:
```
DOMAIN=yourdomain.com
PROTOCOL=https
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | ✅ | — | JWT signing secret, min 32 chars |
| `MONGO_PASSWORD` | ✅ | — | MongoDB root password |
| `MSG_ENCRYPT_KEY` | ✅ | — | Fernet key for DB field encryption |
| `APP_URL` | ✅ (for email) | `http://localhost` | Public URL — used in password reset links |
| `SECURE_COOKIES` | — | `true` | Set to `false` only for local HTTP dev |
| `MONGO_USER` | — | `shiftroster` | MongoDB username |
| `DOMAIN` | — | `localhost` | Nginx server name |
| `PROTOCOL` | — | `http` | `http` or `https` |

> **`APP_URL` must be set** before enabling SMTP or password reset emails. Reset links default to `http://localhost` otherwise.

---

## Security

### What's protected
- **SQL/NoSQL injection**: MongoDB queries use parameterized ObjectId lookups; no string interpolation in queries
- **XSS**: All user-authored HTML (SOP slides, DOCX previews) sanitized with DOMPurify before rendering
- **Path traversal**: File deletion validates paths are contained within `UPLOADS_DIR` before `unlink()`
- **File upload**: Extension blocklist + MIME whitelist on all upload endpoints; avatar uploads restricted to `{.jpg,.jpeg,.png,.gif,.webp}`
- **Authentication**: HTTP-only, Secure, SameSite=Lax cookies; refresh token rotation; MFA (TOTP)
- **Password reset**: Reset links built from server-controlled `APP_URL` env var — never from request headers
- **Rate limiting**: Nginx applies `5r/m` on auth endpoints (login, MFA, forgot-password), `30r/s` on general API
- **CSP**: `script-src 'self' 'unsafe-inline'` — `unsafe-eval` removed
- **Audit trail**: All admin actions logged with actor, entity, and diff

### Known limitations
- Backend container runs as root (Docker named volume is root-owned; non-root requires `gosu` entrypoint). Acceptable on a private/internal network behind nginx.
- CSP still allows `unsafe-inline` — removing it requires nonce-based CSP (frontend refactor). Tracked for a future release.
- MIME type validation trusts client-supplied `Content-Type` header; no magic-byte check (`python-magic` not installed). Extension blocklist is the primary guard.

### Security configuration checklist
- [ ] Set `JWT_SECRET` to 32+ random chars
- [ ] Set `SECURE_COOKIES=true` (default)
- [ ] Set `APP_URL` to your public domain
- [ ] Place SSL certs in `./ssl/` and set `PROTOCOL=https`
- [ ] Configure SMTP in org settings for email-based password reset
- [ ] Enable MFA mandate for admin/manager roles in Settings → Security

---

## Development

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

Environment needed locally:
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=shiftroster_dev
JWT_SECRET=dev-secret-at-least-32-chars-long
MSG_ENCRYPT_KEY=<fernet key>
```

### Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev       # dev server on :3000
npm run build     # production build → ./build/
```

Set `REACT_APP_BACKEND_URL=http://localhost:8000` in `frontend/.env.local`.

### Run tests

```bash
# Backend
cd backend && pytest

# Frontend
cd frontend && npm run test
```

---

## CI/CD

Pushes to `master` trigger:
1. **Code Review** — flake8 (syntax errors), bandit (security scan), pip-audit (CVE check), npm audit, frontend build check
2. **Version Bump** — auto-increments patch version in `package.json`
3. **Deploy** — self-hosted runner on production server runs `docker compose up -d --build`

---

## Contributing

1. Fork the repo and create a feature branch
2. Follow the Midnight Shift design system (amber primary, Syne/Outfit fonts, Linear-style sidebar)
3. Backend: add tests for new routes in `backend/tests/integration/`
4. Frontend: no `console.log` in production code (stripped by Vite build)
5. Open a PR against `master`

---

## License

Licensed under the [Apache License 2.0](https://opensource.org/licenses/Apache-2.0).
