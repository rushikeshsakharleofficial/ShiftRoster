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
- [⚙️ Tech Stack](#️-tech-stack)
- [📦 Project Architecture](#-project-structure)
- [🛠️ Quick Start (Docker)](#️-quick-start-docker)
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
-   **Comprehensive Audit Logs**: Every administrative action is cryptographically timestamped and logged for compliance and security auditing.
-   **Fine-Grained IAM**: Custom groups with `Resource x Action` mapping (e.g., `Shifts:Edit`, `Financials:Read`).

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
    JWT_SECRET=your_super_secret_key_here
    MONGO_URL=mongodb://mongo:27017
    DB_NAME=shiftroster
    ```

3.  **Launch the Stack**:
    ```bash
    docker compose up -d
    ```

4.  **Create Admin**:
    ```bash
    docker compose exec backend python create_admin.py
    ```
    *Access the dashboard at `http://localhost`.*

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
