# 📅 ShiftRoster: The Operational OS for Mission-Critical Teams

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React 19](https://img.shields.io/badge/Frontend-React%2019-61DAFB.svg?style=flat&logo=react)](https://react.dev/)
[![MongoDB 7](https://img.shields.io/badge/Database-MongoDB%207-47A248.svg?style=flat&logo=mongodb)](https://www.mongodb.com/)
[![Vite 6](https://img.shields.io/badge/Build-Vite%206-646CFF.svg?style=flat&logo=vite)](https://vitejs.dev/)

**ShiftRoster** is a high-performance, open-source Operational OS designed for elite operations teams. Beyond simple scheduling, it provides a unified workspace for **Zero-Trust Collaboration**, **Native Document Engineering**, and **Enterprise Identity Lifecycle**.

## 📍 Table of Contents
- [🚀 Key Modules](#-key-modules)
- [📝 Office-Vibe: Native Editor Suite](#-office-vibe-native-editor-suite)
- [🛡️ Zero-Trust Security (E2EE)](#️-zero-trust-security-e2ee)
- [⚙️ Enterprise Compliance](#️-enterprise-compliance)
- [⚡ Tech Stack](#-tech-stack)
- [📦 Architecture](#-project-architecture)
- [🛠️ Quick Start](#️-quick-start-docker)
- [🧪 Quality Assurance](#-testing)
- [🤝 Contributing](#-contributing)
- [⚖️ License](#️-license)

## 🚀 Key Modules

*   **Intelligent Shift Roster**: Interactive calendar with drag-and-drop, **RRULE-based recurrence engine**, shift templates, and automated **assignment conflict detection**.
*   **Encrypted Messaging**: Real-time Chat & Stories with E2EE, **BIP39 recovery**, typing indicators, and presence management.
*   **Structured Handovers**: Digital logbooks with **task status cascading**, ensuring zero information loss during shift transitions.
*   **Presence & Attendance**: WebSocket-driven presence tracking with automated clock-in/out and late reporting.
*   **SOP Management**: Version-controlled operational procedures with **proposal/approval workflows** for non-privileged users.

## 📝 Office-Vibe: Native Editor Suite

ShiftRoster features a custom-built, high-performance editor suite—eliminating the need for heavy external dependencies.

*   **Rich Doc Editor**: **Tiptap-powered** real-time editor for SOPs with image embedding, tables, and full version history.
*   **Grid (Excel-like)**: **ExcelJS-powered** in-browser spreadsheet editing for operational data with formula support.
*   **File Manager**: Centralized, secure storage with **native previews** for PDF, Office, Markdown, and JSON formats.

## 🛡️ Zero-Trust Security (E2EE)

Built with a **Security-First** philosophy for mission-critical environments:
-   **End-to-End Encryption (E2EE)**: Messages and files use **P-256 ECDH** key exchange and **AES-256-GCM** payloads.
-   **Secure Session Management**: JWT-based auth via **HTTP-only, Secure** cookies with refresh token rotation.
-   **BIP39 Mnemonic Backup**: Decentralized key recovery using standard 12-word seed phrases.
-   **Immutable Audit Trail**: Administrative actions are cryptographically logged with actor details and state diffs.

## ⚙️ Enterprise Compliance

-   **Managerial Scoping**: Sophisticated **Manager Groups** ensure managers only access data (Shifts, Users, Leave) within their assigned departments.
-   **Enterprise Identity**: Native **LDAP/Active Directory** synchronization for users, groups, and automated lifecycle management.
-   **Automated Housekeeping**: Admin-controlled **data purging policies** (background tasks) for data retention compliance.
-   **Granular IAM**: Resource-Action based Access Control (RBAC) with support for custom IAM groups and system-wide roles.

## ⚡ Tech Stack

### **Backend (Asynchronous Core)**
-   **Framework**: FastAPI 0.115+ (Python 3.11+)
-   **Database**: MongoDB 7 (Motor Async Driver)
-   **Real-time**: WebSocket-based Presence & Event Bus
-   **Security**: PyJWT, Bcrypt, PyOTP (MFA), Cryptography (Fernet/AES)

### **Frontend (Modern UX)**
-   **Framework**: React 19 + Vite 6
-   **Routing**: React Router 7 (Data APIs)
-   **Styling**: Tailwind CSS 3 with **Material Design 3 (MD3)** tokens
-   **Components**: shadcn/ui + Radix UI + Framer Motion

## 📦 Project Architecture

```
backend/
  routes/                # Domain-driven API (IAM, Auth, Chat, Shifts, etc.)
  tasks/                 # Automated Housekeeping (Purging, Reminders)
  db.py                  # Async MongoDB connection pool
  auth_utils.py          # JWT, MFA, and Permission logic
  presence_manager.py    # High-concurrency WebSocket handler

frontend/
  src/pages/             # 20+ operational pages (Dashboard, Calendar, etc.)
  src/contexts/          # Global state (Auth, Chat, UI)
  src/components/        # Atomic UI (ui/), Layouts (layout/), and Blocks (blocks/)
  src/lib/api.js         # Optimized Axios interceptors & formatters
```

## 🛠️ Quick Start (Docker)

1.  **Clone & Configure**:
    ```bash
    git clone https://github.com/rushikeshsakharleofficial/ShiftRoster.git
    cd ShiftRoster
    cp .env.example .env
    ```

2.  **Generate Keys**:
    ```bash
    # Generate the Fernet key for database field encryption
    python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    ```

3.  **Launch**:
    ```bash
    docker compose up -d --build
    ```

4.  **Setup**:
    Visit `http://localhost:8080/setup` to create the initial SuperAdmin.

## ⚠️ Security Notes

> **Backend runs as root inside the container.** The `backend_uploads` Docker named volume is owned by root at runtime, so the backend process runs as root. This is intentional and acceptable when the server is on a **private/internal network**. If exposed directly to the internet without a reverse proxy firewall, consider implementing a proper `gosu`-based entrypoint to drop privileges after volume chown.

> **Set `APP_URL` in your `.env` before enabling password reset emails.** Without it, reset links default to `http://localhost` which won't work for external users.

## 🧪 Quality Assurance

ShiftRoster maintains high stability through a multi-tier testing strategy:
-   **Backend**: Pytest (Unit + Integration) with Coverage reports.
-   **Frontend**: Vitest for component logic.
-   **E2EE**: Playwright-based workflow testing.

```bash
# Run all tests
cd backend && pytest
cd frontend && npm run test
```

## 🤝 Contributing
Contributions are welcome! Please follow our **design_guidelines.json** and ensure all new features include appropriate tests.

## ⚖️ License
Licensed under the **Apache License 2.0**.

---
*Developed for elite operations teams. Stability: 100% | Performance: Optimized.*
