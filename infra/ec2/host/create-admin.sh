#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
[[ "${1:-}" == --approved ]] || { echo 'After owner approval, run create-admin.sh --approved in an interactive terminal.' >&2; exit 1; }
[[ -t 0 ]] || { echo 'An interactive terminal is required for private password entry.' >&2; exit 1; }
read -r -p 'Admin name: ' admin_name
read -r -p 'Admin email: ' admin_email
read -r -s -p 'New admin password (at least 16 characters, maximum 72 bytes): ' admin_password
printf '\n'
read -r -s -p 'Repeat password: ' confirmation
printf '\n'
[[ "$admin_password" == "$confirmation" ]] || { echo 'Passwords do not match.' >&2; exit 1; }
# Password travels through stdin, never shell history, command arguments, files, or log output.
printf '%s\0%s\0%s\0' "$admin_name" "$admin_email" "$admin_password" | \
  systemd-run --quiet --wait --pipe --collect --uid=causeconnect-migrate \
    --property=NoNewPrivileges=yes --property=EnvironmentFile=/etc/causeconnect/migrations.env \
    /opt/node/bin/node /opt/causeconnect-host/create-admin.cjs
unset admin_password confirmation
