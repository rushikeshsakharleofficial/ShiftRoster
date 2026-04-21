# IAM permission catalog: all valid resource × action combinations.

RESOURCES = [
    "users",
    "shifts",
    "leave",
    "attendance",
    "reports",
    "chat",
    "departments",
    "announcements",
    "audit_logs",
    "settings",
    "sops",
]

ACTIONS = ["read", "create", "update", "delete", "approve", "export"]

# Pre-defined global templates seeded at startup (is_global=True, cannot delete).
GLOBAL_TEMPLATES = [
    {
        "name": "Read Only",
        "description": "View-only access across all modules.",
        "permissions": [
            {"resource": r, "action": "read"} for r in RESOURCES
        ],
    },
    {
        "name": "HR Manager",
        "description": "Full user management, leave approvals, attendance, and reports.",
        "permissions": [
            {"resource": "users", "action": "read"},
            {"resource": "users", "action": "create"},
            {"resource": "users", "action": "update"},
            {"resource": "users", "action": "delete"},
            {"resource": "leave", "action": "read"},
            {"resource": "leave", "action": "create"},
            {"resource": "leave", "action": "update"},
            {"resource": "leave", "action": "approve"},
            {"resource": "attendance", "action": "read"},
            {"resource": "attendance", "action": "export"},
            {"resource": "reports", "action": "read"},
            {"resource": "reports", "action": "export"},
            {"resource": "departments", "action": "read"},
            {"resource": "announcements", "action": "read"},
            {"resource": "announcements", "action": "create"},
        ],
    },
    {
        "name": "Shift Coordinator",
        "description": "Create and manage shifts; read-only on users and departments.",
        "permissions": [
            {"resource": "shifts", "action": "read"},
            {"resource": "shifts", "action": "create"},
            {"resource": "shifts", "action": "update"},
            {"resource": "shifts", "action": "delete"},
            {"resource": "users", "action": "read"},
            {"resource": "departments", "action": "read"},
            {"resource": "attendance", "action": "read"},
        ],
    },
    {
        "name": "Team Lead",
        "description": "Approve leave, view schedules, and manage team attendance.",
        "permissions": [
            {"resource": "users", "action": "read"},
            {"resource": "shifts", "action": "read"},
            {"resource": "shifts", "action": "create"},
            {"resource": "shifts", "action": "update"},
            {"resource": "leave", "action": "read"},
            {"resource": "leave", "action": "approve"},
            {"resource": "attendance", "action": "read"},
            {"resource": "announcements", "action": "read"},
            {"resource": "announcements", "action": "create"},
        ],
    },
    {
        "name": "Analyst",
        "description": "Read and export reports, audit logs, and attendance data.",
        "permissions": [
            {"resource": "reports", "action": "read"},
            {"resource": "reports", "action": "export"},
            {"resource": "audit_logs", "action": "read"},
            {"resource": "attendance", "action": "read"},
            {"resource": "shifts", "action": "read"},
            {"resource": "users", "action": "read"},
        ],
    },
    {
        "name": "Full Access",
        "description": "All permissions across every module — admin-equivalent via IAM.",
        "permissions": [
            {"resource": r, "action": a}
            for r in RESOURCES
            for a in ACTIONS
        ],
    },
]
