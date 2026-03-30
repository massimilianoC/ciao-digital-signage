# Google Calendar Webapp - Operational TODO

## Confirmed decisions (locked)

- Calendar source catalog scope: organization only (tenant/org), not platform-global.
- Isolation: organization sandboxing is mandatory on all queries and endpoints.
- ICS sources: stored as dedicated webapp assets.
- CMS visibility: ICS sources do NOT appear in the general content library.
- Functional ownership: assets are internal to Google Calendar webapp.

## Functional goal

Build a Google Calendar configurator that can:

- use public ICS feeds and private feeds securely
- manage a tenant-level source catalog
- keep secrets and tokens backend-only
- expose only normalized event data to player

## Target data model (tenant-scoped)

Proposed collection: webapp_calendar_sources

Minimum fields:

- _id
- orgId
- name
- type: ics-url | ics-upload | google-private
- visibility: org
- status: active | disabled
- icsUrl (if type=ics-url)
- assetRefId (if type=ics-upload)
- oauthRefId (if type=google-private)
- timezone
- refreshSeconds
- lastSyncAt
- lastError
- checksum
- createdBy
- updatedBy

Constraints:

- index on { orgId, name }
- index on { orgId, status }
- optional unique on { orgId, icsUrl } for external feed dedup

## Webapp asset storage (not content library)

Implementation directive:

- store ICS files as webapp assets in dedicated space
- do not include these assets in standard content library queries

Practical option:

- logical folder: /connectors/google-calendar/sources
- metadata flag: internalWebappAsset=true
- CMS content library queries must exclude internalWebappAsset=true

## Organization sandboxing (hard requirement)

Enforcement checklist:

- each endpoint reads orgId from session
- no query without orgId filter
- ownership validation on sourceId/instanceId
- public player token valid only for instanceId belonging to matching orgId
- logs with correlation id + orgId

## OAuth: where it fits in the flow

Target scenario: private Google calendar visible in kiosk without exposing credentials.

Tenant-admin OAuth flow:

1. Org admin starts Google linking from backend configurator.
2. Backend creates state/nonce and redirects to Google consent.
3. Backend callback stores encrypted refresh token (tenant-scoped).
4. Source type=google-private points to oauthRefId.
5. Player continues to call Ciao public events endpoint.
6. Backend uses short-lived access token to call Google Calendar API.

Key principle:

- no API key or OAuth token in player.
- player receives only filtered/normalized event payload.

## API TODO (implementation order)

1. POST /api/webapps/google-calendar/sources

- create tenant-scoped source

2. GET /api/webapps/google-calendar/sources

- list org sources

3. PATCH /api/webapps/google-calendar/sources/:id

- update metadata/status

4. POST /api/webapps/google-calendar/sources/:id/validate

- test fetch + parse + health

5. POST /api/webapps/google-calendar/oauth/start

- start OAuth flow

6. GET /api/webapps/google-calendar/oauth/callback

- callback + encrypted refresh token persistence

7. POST /api/webapps/google-calendar/sources/:id/sync

- manual sync (admin)

## Security TODO

- encrypt secrets/tokens at rest (envelope encryption)
- token rotation policy
- OAuth link revocation per org
- public events endpoint rate limit
- timeout/retry/backoff for external fetches
- host allowlist for ICS URL
- audit log on secret/token read

## UI integration TODO (CMS)

- New tab: Calendar Sources (tenant)
- Source selector in GoogleCalendarConnectorForm
- Source status: healthy/error/last sync
- "Reconnect Google" button for oauth source

## Test TODO

- Unit: org ownership enforcement on all queries
- Unit: encryption/decryption secret storage
- Integration: oauth callback + token refresh
- E2E: create source -> create connector -> player render
- E2E: source disabled -> player shows controlled error

## Governance note

This implementation is explicitly org-scoped, sandboxed, and not global.
Any future cross-org extension remains out of scope until new approval.

## Operational plan (execution status)

### Sprint A - Foundation backend

- [x] A1 - Model tenant-scoped calendar sources (`webapp_calendar_sources`)
- [x] A2 - API `GET/POST /api/webapps/google-calendar/sources`
- [x] A3 - API `POST /api/webapps/google-calendar/sources/:id/validate`
- [x] A4 - Integrate `sourceId` in connector creation

### Sprint B - Webapp asset isolation

- [x] B1 - `internalWebappAsset` flag in content model
- [x] B2 - Default exclusion in content library (`/api/content`)
- [x] B3 - Automatic connector asset marking (google-calendar, queue)

### Sprint C - Configurator UI

- [x] C1 - Tenant source dropdown in Google Calendar form
- [x] C2 - Manual mode fallback if catalog unavailable
- [x] C3 - UX for source create/validate inside CMS (dedicated page)

### Sprint D - Private OAuth (pending)

- [ ] D1 - oauth/start endpoint
- [ ] D2 - oauth/callback endpoint
- [ ] D3 - encrypted refresh token persistence
- [ ] D4 - complete and validable `google-private` source type

### Sprint E - Testing and hardening

- [ ] E1 - Unit tests for `google-calendar-sources` services
- [ ] E2 - E2E create source -> create connector -> player render
- [ ] E3 - Host allowlist for `ics-url`
- [ ] E4 - Configurable timeout/retry/backoff for ICS fetch
