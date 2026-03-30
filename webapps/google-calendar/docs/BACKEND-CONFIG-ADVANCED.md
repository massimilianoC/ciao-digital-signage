# Google Calendar Connector - Advanced Backend Configurator Guide

## Goal

Provide a robust strategy to:

- connect public or private Google calendars
- avoid exposing credentials in player
- support tenant-scoped ICS catalog reusable by all calendar apps in the same org

## 1) Quick decision tree

1. Public calendar and read-only only?

- Use mode=public-ics or mode=api-key with restricted key.

2. Private Google calendar (not public)?

- DO NOT use API key in player.
- Use backend proxy with OAuth or delegated service account.

3. Need internal ICS catalog shared across instances in the same org?

- Implement "Org ICS Catalog" (section 5).

## 2) Mode A - Public ICS (recommended for fast onboarding)

### Pros

- very quick setup
- no OAuth complexity
- low operational overhead

### Cons

- feed is public by definition
- data leak risk if calendar contains sensitive data

### Recommended config

In configurator:

- mode: public-ics
- publicIcsUrl: public HTTPS URL
- timezone: Europe/Rome (or tenant-specific)
- refreshSeconds: 300 (or 120 for dynamic environments)
- maxItems: 10-20

Hardening:

- host allowlist for ICS URL
- fetch timeout (for example 5-8s)
- max payload size (for example 1-2 MB)
- retry with backoff

## 3) Mode B - Google API key

### When to use it

- only for calendars readable via API key (typically public)
- not for truly private data

### Updated Google Cloud setup (summary)

1. Enable Google Calendar API in GCP project.
2. Create API key.
3. Apply mandatory restrictions:

- API restriction: Google Calendar API only
- Application restriction:
  - if backend server-to-server call: IP restriction (known egress IP)
  - if browser call: HTTP referrer restriction (less secure for kiosk)

4. Set quotas and alerts.

Recent official references:

- Calendar API overview (last updated 2026-03-02)
- JS quickstart (last updated 2026-03-05)
- Google strongly recommends strict API key restrictions

### Critical note

If key is in player, it is recoverable by anyone with access to device or traffic.
For shared/untrusted kiosks, fully avoid client-side keys.

## 4) Mode C - Private calendar (enterprise recommended)

To show private calendar in kiosk while keeping security, use backend proxy.

### Option C1 - OAuth refresh token per tenant

Flow:

1. Tenant admin authorizes once (readonly scope).
2. Backend stores encrypted refresh token.
3. Player calls internal public endpoint with app token (instance public token).
4. Backend uses short-lived access token and calls Google.

Pros:

- compatible with standard user accounts

Cons:

- more complex consent/revocation management

### Option C2 - Service Account + delegation or calendar ACL

Flow:

1. Service account created in GCP.
2. Private calendar shared with service account (read).
3. Backend uses JWT/service auth server-side.
4. Player continues to call Ciao backend only.

Pros:

- no end-user credentials
- stronger fit for enterprise kiosk environments

Cons:

- more technical IAM/Workspace setup

## 5) Org ICS Catalog in instance configurator

Request: make ICS calendars available at org level (tenant-scoped).

### Recommended design

Create a dedicated catalog entity, not tied to a single instance:

- collection: webapp_calendar_sources
- minimum fields:
  - sourceId
  - orgId (always set)
  - name
  - type: ics-url | uploaded-ics
  - icsUrl (if external)
  - fileRef (if upload)
  - visibility: org
  - tags
  - health (ok/error)
  - lastSyncAt
  - checksum

In Google Calendar configurator:

- sourceMode: custom-url | catalog-source
- catalogSourceId (if selected)

### Where to store ICS files

Option 1 (preferred): dedicated webapp asset folder

- logical path: /connectors/google-calendar/sources
- metadata in Content or dedicated collection
- benefits: reuse existing asset pipeline, governance, audit

Option 2: binary in Mongo (GridFS/blob)

- useful for isolated installations
- drawbacks: DB growth, heavier backups, less CDN-friendly

Recommendation:

- default Option 1
- Option 2 only when no external storage exists or in air-gapped installs

## 6) Suggested API contracts for advanced configurator

Recommended new endpoints:

- POST /api/webapps/google-calendar/sources
  - create org-scoped ICS source

- GET /api/webapps/google-calendar/sources
  - list catalog sources filtered by tenant/scope

- PATCH /api/webapps/google-calendar/sources/:id
  - rename, tags, visibility, disable

- POST /api/webapps/google-calendar/sources/:id/validate
  - test fetch + parse + event count

- POST /api/webapps/google-calendar/private-auth/start
  - start OAuth admin flow

- POST /api/webapps/google-calendar/private-auth/callback
  - store encrypted token

## 7) Security and compliance checklist

- encrypted secret/token storage (no plain text persisted)
- key/token never returned to frontend
- minimum OAuth scope: calendar.readonly
- rate limit on public events endpoint
- URL player token with periodic TTL/rotation
- logging with correlation id and no unnecessary PII
- kill switch to disable compromised calendar source

## 8) Incremental implementation plan

1. Immediate hardening (short-term)

- encrypt webapp_secrets_refs.secretKey
- add timeout/retry/backoff and host allowlist

2. Private calendar support (mid-term)

- OAuth backend flow or service account mode
- extend settings schema with authMode

3. Global ICS catalog (mid-term)

- collection + CRUD + validate endpoint
- source picker UI in configurator form

4. Operations (mid/long-term)

- sync worker and event cache
- health monitoring and alerting

## 9) Important note for your kiosk scenario

If player displays code containing Google credentials, those credentials must be considered public.

For private calendars, the only solid path is:

- player -> Ciao backend
- Ciao backend -> Google Calendar API with server-side credentials

This way kiosk only sees already filtered and normalized event data, never access secrets.
