# 📅 ShiftRoster: Enterprise-Grade Shift Management & Roster Automation

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React 19](https://img.shields.io/badge/Frontend-React%2019-61DAFB.svg?style=flat&logo=react)](https://react.dev/)
[![MongoDB](https://img.shields.io/badge/Database-MongoDB-47A248.svg?style=flat&logo=mongodb)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Infrastructure-Docker-2496ED.svg?style=flat&logo=docker)](https://www.docker.com/)

**ShiftRoster** is a high-performance, open-source shift management platform designed for mission-critical operations teams. It consolidates scheduling, attendance tracking, real-time collaboration, and complex permission management into a single, cohesive workspace.

## 📍 Table of Contents
- [🚀 Key Features](#-key-features)
- [🛡️ Enterprise-Grade Security](#️-enterprise-grade-security)
- [⚡ Performance](#-performance)
- [⚙️ Tech Stack](#️-tech-stack)
- [📦 Project Architecture](#-project-structure)
- [🛠️ Quick Start (Docker)](#️-quick-start-docker)
- [🧪 Testing](#-testing)
- [🔐 Password Policy](#-password-policy)
- [🎨 Branding](#-branding)
- [🧠 How-to: Agentic Automation](#-how-to-agentic-automation)
- [🤝 Contributing](#-contributing)
- [⚖️ License](#️-license)

## 🚀 Key Features

*   **Intelligent Shift Calendar**: Interactive week/month views with drag-and-drop assignments, automated shift templates, and position-based staffing.
*   **Real-Time Collaboration**: Built-in chat engine with channels, DMs, and presence indicators powered by high-concurrency WebSockets.
*   **Presence & Attendance**: Biometric-ready clock-in/out system with late tracking, automated reports, and proximity indicators.
*   **Dynamic IAM (Identity & Access Management)**: Granular resource-based access control (RBAC) allowing for custom permission groups and secure delegation.
*   **Automated Handovers**: Structured digital handover notes to ensure zero information loss between operational shifts.
*   **AMOLED-Friendly Interface**: Modern, ultra-dark theme support optimized for low-light operations and high-end displays.

## 🛡️ Enterprise-Grade Security

ShiftRoster is built with a **Security-First** philosophy:
-   **Multi-Factor Authentication (MFA)**: Native TOTP support (Google Authenticator/Authy) with QR code setup.
-   **Secure Session Management**: JWT-based authentication using **HTTP-only, Secure, and SameSite** cookies to prevent XSS and CSRF attacks.
-   **Refresh Token Rotation**: Each `/refresh` issues a new refresh token; old tokens are invalidated to limit replay window.
-   **Atomic Password Setup**: TOCTOU-safe `find_one_and_update` prevents setup-token reuse on password creation.
-   **Rate Limiting**: `/forgot-password` throttled to 3 attempts/hour per IP+email to block enumeration and SMTP DoS.
-   **File Upload Hardening**: Blocked extension list (`.php`, `.exe`, `.sh`, ...) + MIME whitelist + streaming writer (no in-memory buffering).
-   **Startup Secret Validation**: Missing `JWT_SECRET` / `MONGO_URL` / `DB_NAME` fails boot; `JWT_SECRET` enforced ≥ 32 chars.
-   **CORS Tightening**: Explicit method/header lists instead of wildcards when `allow_credentials=True`.
-   **Admin-Configurable Password Policy**: Per-org min/max length, uppercase/lowercase/digit/special requirements.
-   **Comprehensive Audit Logs**: Every administrative action is cryptographically timestamped and logged for compliance and security auditing.
-   **Fine-Grained IAM**: Custom groups with `Resource x Action` mapping (e.g., `Shifts:Edit`, `Financials:Read`).

## ⚡ Performance

-   **Tuned Mongo Pool**: `maxPoolSize=50`, retry reads/writes, idle timeouts to handle concurrent async workload without queueing.
-   **Parallel WebSocket Broadcasts**: Presence fan-out via `asyncio.gather` (one slow client no longer blocks others).
-   **N+1 Query Elimination**: Calendar notes batched (≈400 queries → 3); chat unread counts aggregated (≈100 queries → 2).
-   **Streaming File Uploads**: 1 MB chunks instead of full in-memory read; 100 MB uploads no longer spike memory.
-   **Parallel Startup Indexes**: All collection index creations run concurrently; fast cold-start.
-   **Frontend Code Splitting**: Heavy pages (Reports/recharts) and chat emoji picker (`emoji-mart` 3.2 MB) lazy-loaded via `React.lazy`.

## ⚙️ Tech Stack

### **Backend (Performance Core)**
-   **Runtime**: Python 3.11+
-   **Framework**: **FastAPI** (Fully Asynchronous)
-   **Database**: **MongoDB** with Motor Async Driver
-   **Task Queue**: Integrated background tasks for automated purging and reminders.

### **Frontend (Modern UX)**
-   **Framework**: **React 19** + Vite
-   **Styling**: Tailwind CSS & Radix UI Primitives
-   **Components**: shadcn/ui (Enterprise standard)
-   **State/Routing**: React Router 7 & Context API

### **Infrastructure (Reliability)**
-   **Reverse Proxy**: Nginx (Optimized for WebSockets)
-   **Containerization**: Docker & Docker Compose
-   **SSL**: Built-in support for custom certificates.

## 📦 Project Architecture

```
backend/
  routes/                # Modular API (IAM, Auth, Chat, Shifts, etc.)
  tasks/                 # Automated background operations
  auth_utils.py          # Cryptography and Token handling
  presence_manager.py    # High-concurrency WS handler
  db.py                  # Async MongoDB singleton

frontend/
  src/pages/             # 17+ route-level operational pages
  src/components/ui/     # Reusable shadcn/ui primitives
  src/contexts/          # Global State (Auth, Chat, Theme)
  src/lib/api.js         # Optimized Axios interceptors
```

## 🛠️ Quick Start (Docker)

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/rushikeshsakharleofficial/ShiftRoster.git
    cd ShiftRoster
    ```

2.  **Set Environment Variables**:
    Create a `.env` file in the root:
    ```env
    # Required (boot will fail fast if missing)
    JWT_SECRET=$(openssl rand -hex 32)            # must be >= 32 chars
    MONGO_USER=shiftroster
    MONGO_PASSWORD=$(openssl rand -base64 24)
    SECURE_COOKIES=true                            # set false only for local HTTP
    DOMAIN=example.com
    PROTOCOL=https
    # Optional
    CORS_ORIGINS=https://app.example.com,https://admin.example.com
    MONGO_MAX_POOL=50
    MONGO_MIN_POOL=5
    ```

3.  **Provide SSL Certificates** (HTTPS):
    Place `cert.pem` and `key.pem` in `./ssl/` before launching. For local testing:
    ```bash
    mkdir -p ssl && openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout ssl/key.pem -out ssl/cert.pem -subj "/CN=localhost"
    ```

4.  **Launch the Stack**:
    ```bash
    docker compose up -d
    ```

5.  **First-Time Setup**:
    Visit `http://<host>:8080/setup` (or HTTPS on `8443`) and create the initial SuperAdmin account via the web UI.

## 🧪 Testing

Full test infrastructure is included — pytest for backend, Vitest for frontend, Selenium for E2E.

```bash
# Backend
cd backend && pip install -r requirements-dev.txt
pytest tests/ -v --cov                 # unit + integration + coverage
pytest tests/e2e/ -v                   # E2E (Selenium, services must be up)

# Frontend
cd frontend && npm install
npm run test                           # Vitest watch mode
npm run test:coverage                  # coverage report
npm run lint                           # ESLint
```

CI runs on every push/PR via GitHub Actions (`.github/workflows/tests.yml`):
- Hard-blocks merges on test failures
- Coverage thresholds: backend ≥ 80%, frontend ≥ 70%

See [TESTING.md](./TESTING.md) for fixture docs, patterns, and troubleshooting.

## 🔐 Password Policy

Admins configure password rules per organization — no hardcoded defaults past initial setup.

**Settings → Policy → Password Policy** (admin only):
- Min length (6–128) / Max length (8–256)
- Require uppercase / lowercase / digit / special character (independent toggles)
- Persists to `organizations.password_policy`
- Enforced on: initial setup, `setup-password` token flow, admin-created users with explicit passwords

**API:**
```bash
# Admin: update policy
PUT /api/organization  { "password_policy": {"min_length": 14, "require_digit": true} }

# Authed: read current policy (for frontend to show requirements)
GET /api/organization/password-policy

# Public: policy by org_id (for setup-password page)
GET /api/organization/password-policy/public?org_id=<id>
```

## 🎨 Branding

Favicon and page title are driven by organization settings — **no default logo**, nothing loads until admin uploads one.

```bash
PUT /api/organization  { "brand_name": "Acme Corp", "logo_url": "https://cdn.acme.com/logo.svg" }
```

Frontend reads `GET /api/public/branding` on every page load and injects `<link rel="icon">` + updates `document.title` only when `logo_url` is non-empty.

## 🧠 How-to: Agentic Automation

### **How to integrate ShiftRoster with AI Agents?**
ShiftRoster features a clean, RESTful API and a structured IAM system, making it perfect for agentic integration. You can easily point a Gemini agent to the `/api/shifts` endpoint to automate roster generation based on employee availability or history.

### **How to automate attendance reports?**
The backend includes a `tasks/` module. You can extend the `purging.py` or create a new task to generate PDF reports and email them via the `email_utils.py` module every Sunday at midnight.

## 🤝 Contributing
Contributions are welcome! Please follow these steps:
1.  Fork the repo and create your feature branch.
2.  Ensure your code follows the **design_guidelines.json**.
3.  Submit a PR with a detailed explanation of changes.

## ⚖️ License
Licensed under the **Apache License 2.0**. This ensures your right to use, modify, and distribute the software while protecting the maintainers from liability. See the [LICENSE](./LICENSE) file for details.

---
*Developed for elite operations teams. Stability: 100% | Performance: Optimized.*
