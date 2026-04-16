---
name: cloudflare
description: Cloudflare API skill for managing DNS records. Use when the user wants to update their IP address or manage A/CNAME records.
---

# Cloudflare Skill

This skill provides an automated script to update or retrieve Cloudflare DNS records.

## Usage

Use the `scripts/update_dns.sh` script to interact with the Cloudflare API. The script expects the following environment variables to be set:
- `CLOUDFLARE_API`
- `CLOUDFLARE_ZONE`

### Actions

#### Get Current DNS Records

Run the script without arguments or with `get`:
```bash
./scripts/update_dns.sh get [RECORD_NAME]
```
Example: `./scripts/update_dns.sh get bot.linuxhardened.com`

#### Update an A Record

Run the script with `update`:
```bash
./scripts/update_dns.sh update [RECORD_NAME] [NEW_IP]
```
Example: `./scripts/update_dns.sh update bot.linuxhardened.com 72.62.231.43`
