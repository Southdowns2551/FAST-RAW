# Material Hub — Master Project Documentation

## Project Overview

**Purpose:** PWA for Material Management Services (Raw in/out, Rework in/out, Internal rework), with backend API and MySQL storage.

**Business goals:**
- Track material flows via mobile/desktop PWA
- Store submissions on server, retrievable via portal
- Offline-capable PWA shell

---

## Architecture

- **Frontend:** Static PWA (HTML/CSS/JS), 5 tabs
- **Backend:** Node.js Express API (`server/`)
- **Database:** MySQL 8.4 on sab005 (Docker)
- **Data flow:** PWA → API (HTTPS via nginx-proxy) → MySQL

**Production URL:** https://mh.fasthub.co.za (sab005, nginx-proxy + Let's Encrypt)

---

## APIs / Interfaces

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/health | GET | Health check, DB connectivity |
| /api/raw-in | POST | Submit Raw In record (auto-emails report to reports@italpac.co.za) |
| /api/raw-in | GET | List recent Raw In submissions |
| /api/raw-in/:id/email-report | POST | Re-send one-page report (portal) |
| /api/settings/suppliers | GET | List suppliers |
| /api/settings/suppliers | POST | Add supplier (body: `{ name }`) |
| /api/settings/suppliers/:id | DELETE | Remove supplier |
| /api/settings/transporters | GET/POST/DELETE | Same for transporters |
| /api/settings/grades | GET/POST/DELETE | Same for material grades (Raw In / Raw Out) |
| /api/settings/masterbatch_grades | GET/POST/DELETE | Same for masterbatch grades (Raw In / Raw Out) |
| /api/settings/rework_grades | GET/POST/DELETE | Same for rework grades (Rework Out / Rework In) |
| /api/settings/reasons | GET/POST/DELETE | Same for material out reasons |
| /api/raw-out | POST | Submit Raw Out record with load images (auto-emails report + attachments to reports@italpac.co.za) |
| /api/raw-out | GET | List recent Raw Out submissions |
| /api/raw-out/:id/email-report | POST | Re-send Raw Out one-page report |
| /api/rework-out | POST | Submit Rework Out record with load images (auto-emails report + attachments to reports@italpac.co.za) |
| /api/rework-out | GET | List recent Rework Out submissions |
| /api/rework-out/:id/email-report | POST | Re-send Rework Out one-page report |
| /api/rework-in | POST | Submit Rework In record with load images (auto-emails report + attachments to reports@italpac.co.za) |
| /api/rework-in | GET | List recent Rework In submissions |
| /api/rework-in/:id/email-report | POST | Re-send Rework In one-page report |
| /api/settings/app/:key | GET | Read app setting (e.g. `anpr_key`); returns `{ value }` |
| /api/settings/app/:key | PUT | Upsert app setting; body `{ value }`; returns `{ key, value }` |
| /api/settings/backup | GET | Export all settings as JSON (suppliers, transporters, grades, masterbatch_grades, rework_grades, reasons, app_settings) |
| /api/settings/restore | POST | Restore settings from backup JSON; replaces all current settings |
| /api/auth/setup-status | GET | Returns `{ needsSetup: true/false }` — true when no users exist |
| /api/auth/setup | POST | Create first admin account (one-time); body `{ username, password, display_name }` |
| /api/auth/login | POST | Authenticate; body `{ username, password }`; returns `{ token, user }` |
| /api/auth/me | GET | Returns current user from JWT (requires `Authorization: Bearer <token>`) |
| /api/users | GET | List all users (admin only) |
| /api/users | POST | Create user (admin only); body `{ username, password, display_name, role }` |
| /api/users/:id | DELETE | Delete user (admin only, cannot delete self) |
| /api/users/:id/password | PUT | Reset user password (admin only); body `{ password }` |
| /api/portal/submissions | GET | Paginated, filterable listing across all 4 submission tables; query params: `type`, `from`, `to`, `supplier`, `grade`, `page`, `limit` |
| /api/portal/submissions/:type/:id | GET | Single submission detail (all fields) |
| /api/portal/submissions/:type/:id/pdf | GET | Generate and download PDF report for a submission |
| /api/portal/images/:type/:id/:filename | GET | Serve load/invoice images for a submission |

---

## Backup & Restore

**Settings backup** includes: suppliers, transporters, material grades, masterbatch grades, rework grades, material out reasons, ANPR key.

**Manual backup:** Settings tab → Backup & Restore → "Backup settings" (downloads JSON file).

**Manual restore:** Settings tab → "Restore settings" → select backup JSON file → confirm (replaces all current settings).

**Scheduled backup (cron):** Run `scripts/backup-settings.sh` with the API base URL. Backups are saved to `backups/` with timestamp.

```bash
# Production (daily at 2am) — requires admin credentials for auth
0 2 * * * /opt/docker/material-hub/scripts/backup-settings.sh https://mh.fasthub.co.za admin PASSWORD
```

---

## Authentication & Authorization

**System:** JWT-based authentication with bcrypt password hashing.

**Roles:**
- `admin` — full access including Settings tab, user management, forms, and portal
- `user` — can use all forms (Raw In/Out, Rework In/Out) and portal, but cannot access Settings
- `viewer` — can only access the portal (read-only data viewing); cannot submit forms or access Settings

**First-time setup:** When no users exist, the app shows a setup screen to create the first admin account. This endpoint is disabled once any user exists.

**Login flow:** Username/password authentication returns a JWT (30d expiry) stored in `localStorage` with HttpOnly cookie fallback. All API calls include the token via `Authorization: Bearer <token>` header.

**Protected routes:**
- `/api/settings/*` — requires admin
- `/api/users/*` — requires admin
- `/api/portal/*` — requires auth (admin, user, or viewer)
- `/api/raw-in`, `/api/raw-out`, `/api/rework-in`, `/api/rework-out` — requires auth (any role)
- `/api/auth/*`, `/api/health` — public

**JWT secret:** Set `JWT_SECRET` in `server/.env`. Falls back to a default if not set (not recommended for production).

**Auto-fill:** "Checked by" field on all forms is auto-populated with the logged-in user's display name.

---

## Credentials & Access

**SMTP (reports@italpac.co.za)**

| Field | Value |
|-------|-------|
| Host | mail.italpac.co.za |
| Username | reports@italpac.co.za |
| Password | Master13520 |
| Scope | Production — Raw In report emails |

Add to `server/.env`:
```
SMTP_HOST=mail.italpac.co.za
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=reports@italpac.co.za
SMTP_PASS=Master13520
SMTP_FROM=reports@italpac.co.za
```

**Egnyte (report cloud upload)**

| Field | Value |
|-------|-------|
| Domain | italpac1a |
| Access Token | YbdFkTUt0H1eKsurJ59miSFFFWNq |
| Upload Path | /Shared/IP - Device Reports/API - Material Hub |
| Scope | Production — shared with FAST app (same italpac1a token) |

Add to `server/.env`:
```
EGNYTE_DOMAIN=italpac1a
EGNYTE_ACCESS_TOKEN=YbdFkTUt0H1eKsurJ59miSFFFWNq
EGNYTE_UPLOAD_PATH=/Shared/IP - Device Reports/API - Material Hub
```
Reports are zipped (report HTML + images) and pushed to `{UPLOAD_PATH}/{type}/{YYYY-MM}/` where type is `Raw In`, `Raw Out`, `Rework In`, or `Rework Out`. Filename encodes type, submission id, and timestamp, e.g. `Material_Hub_Rework_Out_53_<ts>.zip`.

**Plate Recognizer (ANPR)**

| Field | Value |
|-------|-------|
| API Token | ef2ef58168b3d5f1390bba202a869f59edd144fe |
| Scope | Vehicle registration scan (2,500/month free) |

Enter in PWA Settings tab → Plate Recognizer (ANPR) → paste token → Save.

**MySQL (material_hub)**

| Field | Value |
|-------|-------|
| Host | mysql (Docker app-network) |
| Port | 3306 |
| Database | material_hub |
| User | material_hub |
| Password | M4t3r14l_Hub_2026! |
| Root Password | BhpqzP4BBWOQh0DsyVkUc5REXaI |
| Scope | Production |

---

## Configuration

**PWA** — [config.js](../config.js):
- `API_BASE_URL` — API base URL (change per environment)

**Vehicle registration (ANPR)** — Settings tab:
- Plate Recognizer API key stored server-side in `app_settings` table (key: `anpr_key`). When set, uses ANPR instead of OCR for license plate scanning.
- Get free token: https://app.platerecognizer.com/accounts/signup/ (2,500 lookups/month)
- Fallback: Tesseract OCR when no key or offline

**API** — `server/.env`:
- DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
- JWT_SECRET (for signing auth tokens)
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (for reports@italpac.co.za)
- EGNYTE_DOMAIN, EGNYTE_ACCESS_TOKEN, EGNYTE_UPLOAD_PATH (report ZIP upload to Egnyte; reports also emailed). When unset, Egnyte upload is skipped silently.
- See `server/.env.example`

---

## Backup & Restore

Settings (suppliers, transporters, grades, masterbatch grades, rework grades, reasons, ANPR key) can be backed up and restored.

**Manual (Settings tab):**
- **Backup settings** — Downloads a JSON file with all settings
- **Restore settings** — Upload a backup JSON file; replaces all current settings (confirm required)

**Scheduled backup (cron):**
```bash
# Daily at 2am — saves to backups/ folder (requires admin credentials)
0 2 * * * /opt/docker/material-hub/scripts/backup-settings.sh https://mh.fasthub.co.za admin PASSWORD
```

Backups are saved as `backups/material-hub-settings-YYYYMMDD-HHMMSS.json`. Add `backups/` to `.gitignore` if the project is version-controlled.

---

## Deployment

**Docker with HTTPS (recommended):**
```bash
# 1. Create server/.env (DB + SMTP from Credentials section above)
# 2. Run migrations on MySQL (001_init.sql through 015_invoice_images_array.sql)
# 3. Ensure app-network exists: docker network create app-network
./deploy.sh --https
```
- Generates self-signed SSL cert if `ssl/cert.pem` missing
- Access at **https://localhost** or **https://&lt;server-ip&gt;** (port 443)
- HTTP (80) redirects to HTTPS

**Docker HTTP only:**
```bash
./deploy.sh
# Access http://localhost (port 80)
```

**SSL certificate (Let's Encrypt):**
- Production domain **mh.fasthub.co.za** uses Let's Encrypt (certbot on sab005). See [ssl/README.md](../ssl/README.md).

**Production (mh.fasthub.co.za):**
- **URL:** https://mh.fasthub.co.za
- **Server:** sab005 (156.38.144.162)
- **Setup:** PWA + API behind nginx-proxy; Let's Encrypt cert for mh.fasthub.co.za
- **Path on server:** /opt/docker/material-hub/
- **Compose:** `docker-compose.deploy.yml` + override (no port publish; nginx-proxy proxies to material-hub-pwa:80)
- **Uploads volume:** `raw-out-uploads` Docker volume mounted at `/app/uploads` in the API container — stores Raw Out and Rework Out load images on disk

**Deploy to sab005:**
1. Copy project: `scp -r . root@156.38.144.162:/opt/docker/material-hub/`
2. SSH: `ssh root@156.38.144.162`
3. Create `server/.env` with DB + SMTP credentials
4. Run migrations (Adminer via tunnel or mysql client)
5. Run `./deploy.sh` or `docker compose -f docker-compose.deploy.yml -f docker-compose.override.yml up -d` (when behind nginx-proxy)
6. Add nginx-proxy vhost for domain (see /opt/docker/nginx-proxy/conf.d/ipraw.conf)
7. Access **https://mh.fasthub.co.za**

**Local dev (no Docker):**
1. Start API: `cd server && npm run dev`
2. Serve PWA: `npx serve -p 8080 .` or `python3 -m http.server 8080`
3. Open http://localhost:8080 (config.js uses localhost:3000 for API)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-06 | Database connection plan implemented; server/, config.js, Master_project.md |
| 2026-03-06 | Raw In form: Start/GPS/geocode, Supplier/Transporter, OCR vehicle reg, Completed, email report |
| 2026-03-06 | ANPR (Plate Recognizer) for vehicle reg; OCR fallback; grades received 1–5 |
| 2026-03-07 | Production: mh.fasthub.co.za, nginx-proxy + Let's Encrypt; Settings tab; batch number per grade; mobile (iOS/Android); favicon/icon cache bust |
| 2026-03-07 | Suppliers, Transporters, Material grades moved from localStorage to database; migration 003; Settings API |
| 2026-03-07 | UI: replaced tab bar with icon grid home screen; gear icon in header for Settings; sticky bottom Home nav bar; recycle icons for all rework tiles |
| 2026-03-07 | Raw Out form: customer name (text), grades sent, invoice/delivery note #, reason for material out (DB-backed dropdown managed in Settings); migration 004; API /api/raw-out; email report; rawOut.js |
| 2026-03-07 | Raw Out: "Image of Load" camera capture (min 1, max 4 photos); images resized client-side, saved to server disk (Docker volume), paths in `load_images` JSON column; attached to email report; migration 005; JSON body limit 5MB |
| 2026-03-07 | Raw Out: Invoice / delivery note image capture (single photo); saved to server disk alongside load images; `invoice_image` VARCHAR column; attached to email report as `invoice_document.jpg`; migration 006 |
| 2026-03-07 | Rework Out form: based on Raw Out with removed fields (transporter, reason for material out, vehicle state, damaged bags, pallets wrapped); customer name renamed to "Name of recycler" (text); batch number removed from grades; reworkOut.js; API /api/rework-out; `rework_out_submissions` table; migration 007; email report |
| 2026-03-07 | Separate rework grades: `rework_grades` table (migration 008); Rework Out uses its own grade list independent of Raw In/Raw Out material grades; Settings UI "Rework grades" section; `/api/settings/rework_grades` endpoints; fixed grade refresh for Raw Out on add/delete |
| 2026-03-07 | ANPR key moved from localStorage to server-side `app_settings` table (migration 009); GET/PUT `/api/settings/app/:key` endpoints; `settings.js` `getAnprKey`/`setAnprKey` now async API calls; all form JS files updated to `await` the async key fetch |
| 2026-03-07 | Rework In form: duplicate of Rework Out with "Number of grades received", rework grades from Settings, Total Kg below each grade; `rework_in_submissions` table (migration 010); API `/api/rework-in`; email report; reworkIn.js |
| 2026-03-07 | Raw In and Raw Out: "Total Kg" number field added below batch number in each grade row; stored in grades JSON as `total_kg`; displayed in email reports |
| 2026-03-07 | Settings backup & restore: GET /api/settings/backup, POST /api/settings/restore; Backup/Restore buttons in Settings tab; scripts/backup-settings.sh for cron (keeps last 30) |
| 2026-03-07 | User authentication: JWT-based auth with bcrypt; `users` table (migration 011); first-time admin setup; login screen; admin/user roles; Settings tab restricted to admin; User Management in Settings; auth headers on all form submissions; auto-fill "Checked by" from logged-in user; logout button in header |
| 2026-03-07 | Home grid icons redesigned: Raw In = bold outline box with downward arrow; Raw Out = bold outline box with upward arrow; Rework Out = clockwise circular refresh arrow; Rework In = counter-clockwise circular refresh arrow; Internal Rework = MDI recycle-variant filled recycling triangle. All icons use `currentColor` for theme consistency. SW cache v26. |
| 2026-03-07 | Favicon updated: bold "MH" (white on #1a237e) at 192px and 512px; manifest and icon refs bumped to v3. SW cache v27. |
| 2026-03-07 | Settings GET endpoints now accessible to any authenticated user (not admin-only); POST/PUT/DELETE remain admin-restricted. Fixes dropdowns not loading for regular users on iOS. Removed leftover debug instrumentation from settings.js, app.js, rawOut.js. SW cache v28. |
| 2026-03-07 | UI polish: all tile labels, form headings, field labels, and settings section headings use CSS `text-transform: uppercase` with letter-spacing; form panels have 3px indigo top accent bar; form `<h2>` has indigo bottom border separator. SW cache v29. |
| 2026-03-07 | Session persistence for iOS: HttpOnly `mh_session` cookie set on login/setup; auth middleware reads cookie as fallback when no Authorization header; `/api/auth/me` returns fresh token when authenticated via cookie (repopulates localStorage after iOS purge); JWT expiry extended from 24h to 30d; `cookie-parser` added; logout clears both localStorage and server cookie. SW cache v30. |
| 2026-03-07 | Submissions Data Portal: new "Portal" section accessible from home grid; `viewer` role added to users ENUM (migration 012); paginated, filterable listing across all 4 submission tables with UNION ALL queries; detail modal with full record view and image thumbnails; lightbox for full-size images; PDF export via `html-pdf-node`; shared report HTML builders extracted to `server/reportHtml.js`; `requirePortalAccess` middleware; role-based access control (viewers=portal only, users=forms+portal, admins=all); portal.js frontend with filter bar, card-based results, pagination; color-coded type badges; responsive CSS. SW cache v31. |
| 2026-03-08 | Settings page cleanup: replaced flat scrolling list with stacked nav list (iOS/Android settings style); tapping a row opens the detail view with back button; sections grouped under "Data" and "System" categories; each detail wrapped in elevated card; User Management inputs stacked vertically for mobile; subtitle removed. |
| 2026-03-08 | Bug fixes: docker-compose env override causing DB auth failure; logout race condition (cookie not cleared before reload); backup route 400 due to /:resource catch-all ordering; hidden file input visible (generic .hidden CSS rule added); user list eager load before auth complete (lazy-loaded on nav click). SW cache v36. |
| 2026-03-08 | Domain rename: ipraw.fasthub.co.za -> mh.fasthub.co.za; new Let's Encrypt cert; nginx-proxy vhost updated (ipraw.conf -> mh.conf); old cert deleted; all codebase references updated. |
| 2026-03-08 | Masterbatch grades: new `masterbatch_grades` table (migration 013); `/api/settings/masterbatch_grades` CRUD endpoints; Settings panel "Masterbatch grades" section; Raw In/Out forms now have Material/Masterbatch radio toggle per grade row that switches the grade dropdown list; `grade_type` field added to `grades_received`/`grades_sent` JSON; portal grade filter includes masterbatch grades; backup/restore includes masterbatch_grades. SW cache v38. |
| 2026-03-08 | Raw In invoice image: `invoice_image` VARCHAR column added to `raw_in_submissions` (migration 014); camera capture UI below invoice number field; image resized client-side (1200px max), saved to `uploads/raw-in/{id}/invoice.jpg`; attached to email report; re-send endpoint also resolves and attaches invoice image. Camera preview auto-scrolls into view on open. SW cache v42. |
| 2026-03-08 | Raw In grades count increased from 5 to 10 options in the "Number of grades received" dropdown. SW cache v43. |
| 2026-03-14 | Rework Out: "Total Kg" number input added below each material grade dropdown (matching Raw In, Raw Out, Rework In); `grades_sent` JSON now stores `{ grade, total_kg }` instead of `{ grade }`; email report switched from `sent_rework` to `sent` mode so kg values display; portal `fmtGrades` updated to show kg for all form types. SW cache v44. |
| 2026-03-14 | Frontend visual redesign: industrial-utilitarian aesthetic with Outfit (headings) + Source Sans 3 (body) typography via Google Fonts; new color palette (deep navy `#0d1b2a`, steel blue `#1b3a5c`, industrial orange `#e85d26` accent, warm off-white `#f0ede8` surface); bold filled SVG icons for all 6 home grid tiles; staggered fade-in animation on grid tiles; panel slide-up entrance animation; orange focus glow on inputs; subtle grain texture on body; diagonal line pattern on header; orange accent borders on grade groups and tile tops; settings nav hover with left-border accent; backdrop blur on modals/lightbox; auth card entrance animation; refined spacing and padding throughout. SW cache v45. |
| 2026-05-20 | Camera UX overhaul: extracted shared `camera.js` module from duplicated code in rawIn/rawOut/reworkOut/reworkIn; fullscreen camera overlay with shutter button, review-before-accept flow, multi-photo continuous mode; larger 120px thumbnails with tap-to-enlarge lightbox; haptic feedback on capture. SW cache v47. |
| 2026-05-20 | Multi invoice photos: invoice capture changed from single image to up to 5 images across all 4 form pages; frontend uses `invoiceImages[]` array with multi-photo camera mode; backend `saveInvoiceImages()` saves `invoice_1.jpg`–`invoice_5.jpg`, stores paths as JSON array in `invoice_image` column; `buildAttachments()` attaches multiple invoice documents; report HTML counts images dynamically; portal renders multiple invoice thumbnails; migration 015 widens `invoice_image` columns to TEXT; backward-compatible with legacy single-path strings via `parseInvoiceImages()` helper. |
| 2026-05-24 | UI redesign to match organisation's corporate design language: replaced orange accent palette with steel blue (`#2b6cb0`); warm off-white surface changed to cool gray (`#f0f2f5`); removed body grain texture and header diagonal pattern; header simplified to solid navy; home grid tiles restyled with 16px border-radius and rounded-square icon containers (`--icon-bg: #e8eef5`); new clean filled SVG icons for all 6 tiles (Raw In/Out arrows, Rework In clockwise / Out anti-clockwise cycle, Internal Rework sync, Portal grid); tile labels no longer uppercase; tab panel top border switched from navy to accent blue; all orange focus rings, button shadows, and select arrow SVGs updated to steel blue; manifest and meta theme-color set to `#0d1b2a`. SW cache v50. |
| 2026-06-25 | Egnyte report upload: every report (Raw In/Out, Rework In/Out) is now also zipped (report HTML + load/invoice images) and pushed to Egnyte folder `/Shared/API - Material Hub`, in addition to email. Ported FAST's `egnyte.js` client (REST `fs-content` API, bearer token); added `archiver` dependency; `email.js` gains `buildReportZip()` + `pushToEgnyte()` called fire-and-forget after each `sendMail` (covers new submissions and portal re-send). Reuses FAST's italpac1a Egnyte token via new `EGNYTE_*` env vars in `server/.env`. No frontend/DB changes. Upload skipped silently when env not configured. |
| 2026-06-25 | Egnyte layout flattened: zips now land directly in `/Shared/API - Material Hub` (removed the per-type and `YYYY-MM` month subfolders) so reports are visible at the folder root; type/id/timestamp remain in the filename. `egnyte.js` no longer forces a month subfolder; `email.js` calls `pushToEgnyte` with no subfolder. |
| 2026-06-25 | Egnyte path corrected + structure restored: base path moved to existing `/Shared/IP - Device Reports/API - Material Hub` (the earlier `/Shared/API - Material Hub` was an auto-created stray folder, which is why uploads appeared "missing"). Restored per-type + `YYYY-MM` month subfolders (e.g. `Rework Out/2026-06/`) per request. Existing id=53 zip migrated to the corrected location and stray folder removed. |
