---
name: hostinger
description: Hostinger API skill for managing VPS firewalls. Use when the user wants to whitelist IPs or manage firewall rules.
---

# Hostinger Skill

This skill provides an automated script to interact with Hostinger's VPS Firewall API.

## Usage

Use the `scripts/whitelist_ip.sh` script to retrieve or update firewall rules. The script expects the following environment variable to be set:
- `HOSTINGER_API`

### Actions

#### Get Firewall ID and Rules

Run the script with `get`:
```bash
./scripts/whitelist_ip.sh get
```

#### Whitelist an IP Address

Run the script with `whitelist`:
```bash
./scripts/whitelist_ip.sh whitelist [FIREWALL_ID] [IP_ADDRESS] [PORT]
```
Example: `./scripts/whitelist_ip.sh whitelist 204196 103.42.161.198 8080`
