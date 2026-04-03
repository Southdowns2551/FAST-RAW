# Code Review: Database Data Linkage

**Date:** 2026-03-07  
**Scope:** Full review of Material Hub codebase for database linkage issues.

---

## Executive Summary

The **Raw In** flow is correctly wired: PWA → API → MySQL. Several other areas are **not linked** to the database or have gaps that prevent data from being properly connected to the project.

---

## 1. What Works (Raw In)

| Component | Status |
|-----------|--------|
| **Frontend payload** (`rawIn.js`) | Matches API: `started_at`, `location_*`, `supplier`, `transporter`, `grades_received`, `vehicle_*`, etc. |
| **API route** (`server/routes/rawIn.js`) | INSERT into `raw_in_submissions` with correct column mapping |
| **Schema** (`001_init.sql`, `002_add_grades_received.sql`) | Columns align with payload; `grades_received` JSON |
| **Email report** (`server/email.js`) | Reads `grades_received` from DB row (handles string/object) |
| **nginx proxy** | `/api/` → `api:3000`; same-origin for PWA |
| **config.js** | `API_BASE_URL: ''` in production (same-origin); `localhost:3000` for local dev |

---

## 2. Issues: Data Not Linked to Project

### 2.1 No Portal UI for Retrieving Submissions

**Problem:** `GET /api/raw-in` exists and returns submissions, but **no frontend calls it**. Users cannot view stored Raw In data in the app.

**Impact:** Master_project.md states "Store submissions on server, retrievable via portal" — the portal does not exist.

**Recommendation:** Add a "Submissions" or "History" tab (or section in Settings) that fetches `GET /api/raw-in` and displays recent Raw In records.

---

### 2.2 Settings (Suppliers, Transporters, Grades) in localStorage Only

**Problem:** Suppliers, Transporters, and Material grades are stored in **localStorage** (`settings.js`). They are:

- Device-specific (lost on new device or cache clear)
- Not shared across users
- Not backed up or auditable
- Not linked to the database

**Impact:** If the project expects these to be shared or persisted server-side, they are not.

**Recommendation:** Either:
- **Option A:** Add DB tables (`suppliers`, `transporters`, `material_grades`) and API endpoints; migrate Settings to use them.
- **Option B:** Document that Settings are intentionally device-local (current behavior).

---

### 2.3 Raw Out, Rework Out, Rework In, Internal Rework — No DB Linkage

**Problem:** These four tabs have placeholder text only. No forms, no API routes, no database tables.

**Impact:** Only Raw In data is stored. Other material flows are not tracked in the database.

**Recommendation:** If these flows are in scope, add:
- DB tables (e.g. `raw_out_submissions`, `rework_out_submissions`, etc.)
- API routes (POST/GET)
- Form UIs and frontend logic

---

### 2.4 MySQL Hostname Dependency

**Problem:** All compose files use `DB_HOST=mysql`. The Material Hub stack does **not** define a `mysql` service. MySQL must be:

- A separate container on `app-network` with hostname `mysql`, or
- An external service reachable via that hostname

**Impact:** If MySQL is not on `app-network` as `mysql`, the API will fail to connect. The comment "MySQL on host (sab005)" is ambiguous — if MySQL runs on the host OS (not Docker), `mysql` will not resolve.

**Recommendation:**
- If MySQL is in Docker: ensure it is on `app-network` and reachable as `mysql`.
- If MySQL is on host: use `DB_HOST=host.docker.internal` (or host IP) instead of `mysql`.

---

### 2.5 Hardcoded Plate Recognizer Token in config.js

**Problem:** `config.js` contains a hardcoded `PLATE_RECOGNIZER_TOKEN`. Per project rules, credentials should only appear in `Master_Docs/Master_project.md`.

**Impact:** Token is exposed in client-side code (browsers can read it). Settings tab allows override from localStorage, but the default is still in code.

**Recommendation:** Remove hardcoded token; use only Settings (localStorage) or a server-side endpoint that returns a token for authenticated users.

---

## 3. Data Flow Verification

```
PWA (rawIn.js)
  → POST /api/raw-in (JSON payload)
  → nginx proxy_pass http://api:3000
  → Express app.use('/api/raw-in', rawInRouter)
  → pool.execute(INSERT INTO raw_in_submissions ...)
  → MySQL
  → sendRawInReport(row) → email
```

**Verified:** Payload fields match INSERT columns. `grades_received` is stringified to JSON before insert; email module parses it correctly.

---

## 4. Checklist for Production

| Item | Action |
|------|--------|
| MySQL on app-network | Confirm `mysql` hostname resolves from `material-hub-api` container |
| `server/.env` | Set real `DB_PASSWORD`, SMTP vars (not placeholders) |
| Migrations | Run `001_init.sql`, `002_add_grades_received.sql` |
| GET /api/raw-in | Add UI to display submissions if portal is required |
| Settings | Decide: keep localStorage or migrate to DB |

---

## 5. Suggested Next Steps (Priority)

1. **High:** Add a Submissions/History UI that calls `GET /api/raw-in` — fulfills "retrievable via portal".
2. **Medium:** Clarify MySQL deployment (Docker vs host) and `DB_HOST` on sab005.
3. **Medium:** Decide if Suppliers/Transporters/Grades should move to DB.
4. **Low:** Remove hardcoded Plate Recognizer token from config.js.
5. **Low:** Implement Raw out, Rework out, Rework in, Internal rework if in scope.
