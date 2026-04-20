# Active Directory & LDAP Integration Design

## Overview
Implement Active Directory/LDAP integration with background syncing to allow ShiftRoster managers to assign shifts to employees immediately, while delegating authentication to the AD server.

## 1. Database Schema Updates

**Organizations Collection (`organizations`)**
Add a new nested object `ldap_settings`:
```json
{
  "ldap_settings": {
    "enabled": false,
    "host": "ldap://ad.example.com",
    "port": 389,
    "use_ssl": false,
    "bind_dn": "CN=ServiceAccount,OU=Users,DC=example,DC=com",
    "bind_password": "encrypted_password",
    "search_base": "OU=Employees,DC=example,DC=com",
    "user_filter": "(&(objectClass=person)(sAMAccountName=*))",
    "mapping": {
      "username": "sAMAccountName",
      "email": "mail",
      "full_name": "displayName",
      "phone": "telephoneNumber"
    },
    "last_sync_at": "2026-04-20T10:00:00Z"
  }
}
```

**Users Collection (`users`)**
Add flags to identify LDAP-managed users:
- `auth_provider`: `"local"` or `"ldap"`
- `ldap_dn`: Distinguished name of the user to prevent duplication if renamed.

## 2. Backend Architecture

**New Service: `backend/ldap_service.py`**
- Will use the `ldap3` python package.
- `test_connection()`: Verifies connectivity and bind credentials.
- `sync_users()`: Connects to AD, searches for users matching the filter, and upserts them into the MongoDB `users` collection.
- `authenticate_user(username, password)`: Attempts to bind to the AD server directly as the user to verify credentials.

**Authentication Flow (`backend/routes/auth.py`)**
- During `/login`, check if the user exists in DB.
- If `auth_provider == "ldap"`, call `ldap_service.authenticate_user()`.
- If LDAP bind succeeds, generate and return standard ShiftRoster JWTs.
- Fallback to local bcrypt verification for "local" users (e.g., the SuperAdmin).

**API Endpoints (`backend/routes/settings.py` or new `ldap.py`)**
- `GET /api/settings/ldap`: Fetch current configuration.
- `PUT /api/settings/ldap`: Save configuration.
- `POST /api/settings/ldap/test`: Test connection.
- `POST /api/settings/ldap/sync`: Trigger manual user sync.

## 3. Background Task
- Integrate `sync_users()` into the existing background task runner in `backend/server.py` to run every 1 hour.

## 4. Frontend Implementation
- **Settings Page (`frontend/src/pages/SettingsPage.js`)**: Add an "LDAP/AD Integration" tab.
- Form fields for host, port, bind DN, password, search base, and user filter.
- Buttons for "Test Connection" and "Force Sync".

## Security Considerations
- The `bind_password` must be encrypted at rest in MongoDB using a symmetric key derived from `JWT_SECRET` (or a dedicated `ENCRYPTION_KEY`).
- Enforce TLS/SSL (`ldaps://` or StartTLS) options.
