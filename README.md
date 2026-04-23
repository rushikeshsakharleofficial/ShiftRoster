# 📅 ShiftRoster: The Operational OS for Mission-Critical Teams

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React 19](https://img.shields.io/badge/Frontend-React%2019-61DAFB.svg?style=flat&logo=react)](https://react.dev/)
[![MongoDB 7](https://img.shields.io/badge/Database-MongoDB%207-47A248.svg?style=flat&logo=mongodb)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Infrastructure-Docker-2496ED.svg?style=flat&logo=docker)](https://www.docker.com/)

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

*   **Intelligent Shift Roster**: Interactive calendar with drag-and-drop, recurrence engines, and position-based staffing.
*   **Encrypted Messaging**: Real-time Chat & Stories with E2EE, channels, and rich media support.
*   **Structured Handovers**: Digital logbooks ensuring zero information loss during shift changes.
*   **Presence & Attendance**: Biometric-ready clock-in/out with automated late tracking and reporting.
*   **File Manager**: Centralized, secure storage for operational assets with inline previews.

## 📝 Office-Vibe: Native Editor Suite

ShiftRoster features a custom-built, high-performance editor suite—eliminating the need for heavy external dependencies like OnlyOffice.

*   **Rich Doc Editor**: Tiptap-powered real-time editor for SOPs with full formatting, image embedding, and version history.
*   **Grid (Excel-like)**: In-browser spreadsheet editing for operational data with formula support (SUM/AVG/COUNT).
*   **Presentations**: Slide deck builder for shift briefings and operational reviews.
*   **Native Previews**: Instant previews for Markdown, JSON, CSV, PDF, and Office formats.

## 🛡️ Zero-Trust Security (E2EE)

Built with a **Security-First** philosophy for mission-critical environments:
-   **End-to-End Encryption (E2EE)**: Messages and files are encrypted using **P-256 ECDH** key exchange and **AES-256-GCM** payloads. Keys never leave the client.
-   **BIP39 Mnemonic Backup**: Users generate a 12-word recovery phrase to restore access to encrypted data across devices.
-   **Secure Session Management**: JWT-based auth using **HTTP-only, Secure, SameSite** cookies with **Refresh Token Rotation**.
-   **Audit Persistence**: Every administrative action is cryptographically timestamped and logged (Immutable Audit Trail).

## ⚙️ Enterprise Compliance

-   **LDAP/Active Directory**: Native sync for user lifecycle, group mapping, and single-sign-on (SSO).
-   **Automated Housekeeping**: Admin-controlled purging policies (FastAPI background tasks + MongoDB TTL) to meet data retention requirements.
-   **Granular IAM**: Resource-Action based Access Control (RBAC) allowing for custom permission groups (e.g., `Shifts:Edit`, `Financials:Read`).
-   **Password Hardening**: Admin-configurable complexity policies (length, case, digits, specials).

## ⚡ Tech Stack

### **Backend (Asynchronous Core)**
-   **Framework**: FastAPI (Python 3.11+)
-   **Database**: MongoDB 7 (Motor Async Driver)
-   **Security**: Cryptography (Fernet & RSA), BIP39 Seed Logic
-   **Tasks**: Background purging and reminder engines

### **Frontend (Modern UX)**
-   **Framework**: React 19 + Vite
-   **State**: Context API + React Router 7
-   **Components**: shadcn/ui + Lucide + Radix UI
-   **Editors**: Tiptap + ExcelJS

## 📦 Project Architecture

```
backend/
  routes/                # Modular API (IAM, Auth, Chat, SOPs, etc.)
  tasks/                 # Automated Housekeeping (Purging, Reminders)
  auth_utils.py          # Cryptography & JWT logic
  presence_manager.py    # High-concurrency WebSocket handler

frontend/
  src/pages/             # 20+route-level operational pages
  src/lib/crypto.js      # E2EE & Mnemonic recovery logic
  src/lib/api.js         # Optimized Axios interceptors
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

## 🧪 Quality Assurance

ShiftRoster maintains high stability through a multi-tier testing strategy:
-   **Backend**: Pytest (Unit + Integration) with Coverage reports.
-   **Frontend**: Vitest for component logic.
-   **E2EE**: Playwright-based End-to-End workflow testing.

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
