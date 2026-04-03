# SSL Certificates for Material Hub

## Self-signed (IP access)

For `https://156.38.144.162` or any IP:

```bash
./gen-cert.sh
```

Creates `cert.pem` and `key.pem`. Used automatically by `./deploy.sh --https`.

## Let's Encrypt (domain)

For a domain (e.g. `materialhub.italpac.co.za`):

1. Point DNS A record to server IP (156.38.144.162).

2. Install certbot on the server:
   ```bash
   # AlmaLinux/RHEL
   dnf install certbot
   ```

3. Obtain certificate (standalone mode; stop nginx first):
   ```bash
   docker compose -f docker-compose.https.yml down
   certbot certonly --standalone -d materialhub.italpac.co.za
   ```

4. Copy certs to project:
   ```bash
   cp /etc/letsencrypt/live/materialhub.italpac.co.za/fullchain.pem ssl/cert.pem
   cp /etc/letsencrypt/live/materialhub.italpac.co.za/privkey.pem ssl/key.pem
   ```

5. Deploy:
   ```bash
   ./deploy.sh --https
   ```

6. Auto-renewal (cron):
   ```bash
   0 3 * * * certbot renew --quiet --deploy-hook "cp /etc/letsencrypt/live/materialhub.italpac.co.za/*.pem /opt/docker/material-hub/ssl/ && docker compose -f /opt/docker/material-hub/docker-compose.https.yml exec -T pwa nginx -s reload"
   ```
