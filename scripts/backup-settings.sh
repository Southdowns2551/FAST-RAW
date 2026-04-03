#!/usr/bin/env bash
# Material Hub - Settings backup script for cron.
# Saves settings JSON to backups/ with timestamp.
# Usage: ./scripts/backup-settings.sh [API_BASE_URL] [USERNAME] [PASSWORD]
# Example: ./scripts/backup-settings.sh https://mh.fasthub.co.za admin MyPassword
# Cron: 0 2 * * * /opt/docker/material-hub/scripts/backup-settings.sh https://mh.fasthub.co.za admin MyPassword

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${PROJECT_ROOT}/backups"
API_BASE="${1:-http://localhost:3000}"
USERNAME="${2:-}"
PASSWORD="${3:-}"

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT="${BACKUP_DIR}/material-hub-settings-${TIMESTAMP}.json"

AUTH_HEADER=""
if [ -n "$USERNAME" ] && [ -n "$PASSWORD" ]; then
  TOKEN=$(curl -sf "${API_BASE}/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\"}" \
    | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  if [ -z "$TOKEN" ]; then
    echo "ERROR: Login failed" >&2
    exit 1
  fi
  AUTH_HEADER="Authorization: Bearer ${TOKEN}"
fi

if [ -n "$AUTH_HEADER" ]; then
  curl -sf "${API_BASE}/api/settings/backup" -H "$AUTH_HEADER" -o "$OUTPUT"
else
  curl -sf "${API_BASE}/api/settings/backup" -o "$OUTPUT"
fi
echo "Backup saved: $OUTPUT"

# Keep last 30 backups
cd "$BACKUP_DIR"
to_remove=$(ls -t material-hub-settings-*.json 2>/dev/null | tail -n +31)
[ -n "$to_remove" ] && echo "$to_remove" | xargs rm -f
