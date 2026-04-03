#!/usr/bin/env bash
# Generate self-signed SSL certificate for Material Hub
# Use for IP-only access (e.g. https://156.38.144.162)
# For domain: use certbot (see ssl/README.md)

set -e
cd "$(dirname "$0")"
mkdir -p .

# Default: server IP from Master_Docs/server_info.md
SAN="${SSL_SAN:-IP:156.38.144.162}"
# If DOMAIN set, add DNS:domain for SAN
if [[ -n "$DOMAIN" ]]; then
  SAN="DNS:${DOMAIN},${SAN}"
fi

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem \
  -subj "/CN=Material Hub/O=Italpac/C=ZA" \
  -addext "subjectAltName=${SAN}"

echo "Created cert.pem and key.pem in $(pwd)"
echo "For production domain, use Let's Encrypt: see ssl/README.md"
