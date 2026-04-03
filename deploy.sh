#!/usr/bin/env bash
# Material Hub - Deployment script
# Run from project root. Requires Docker, app-network, MySQL.
#
# Prerequisites:
# 1. Create server/.env with DB + SMTP (see server/.env.example)
# 2. Run migrations: 001_init.sql, 002_add_grades_received.sql, 003_settings_tables.sql, 004_raw_out.sql, 005_load_images.sql, 006_invoice_image.sql, 007_rework_out.sql, 008_rework_grades.sql, 009_app_settings.sql, 010_rework_in.sql
# 3. Ensure app-network exists: docker network create app-network
#
# Usage:
#   ./deploy.sh           - HTTP only (port 80)
#   ./deploy.sh --https   - HTTPS with SSL (ports 80, 443). Generates self-signed cert if ssl/ empty.

set -e
cd "$(dirname "$0")"

if [[ ! -f server/.env ]]; then
  echo "Error: server/.env not found."
  echo "Copy server/.env.example to server/.env and set DB_PASSWORD, SMTP_* vars."
  exit 1
fi

USE_HTTPS=false
for arg in "$@"; do
  [[ "$arg" == "--https" ]] && USE_HTTPS=true
done

if [[ "$USE_HTTPS" == true ]]; then
  if [[ ! -f ssl/cert.pem ]] || [[ ! -f ssl/key.pem ]]; then
    echo "Generating self-signed SSL certificate..."
    ./ssl/gen-cert.sh
  fi
  echo "Building and starting Material Hub (HTTPS)..."
  docker compose -f docker-compose.https.yml up -d --build
  echo ""
  echo "Deployed with SSL. Access at https://localhost (or https://<server-ip>)"
  echo "Accept self-signed cert in browser on first visit."
  echo "API health: curl -k https://localhost/api/health"
else
  echo "Building and starting Material Hub (HTTP)..."
  docker compose -f docker-compose.deploy.yml up -d --build
  echo ""
  echo "Deployed. Access at http://localhost (or server IP)"
  echo "API health: curl http://localhost/api/health"
  echo ""
  echo "For HTTPS with SSL: ./deploy.sh --https"
fi
