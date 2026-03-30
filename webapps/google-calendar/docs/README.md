# Google Calendar Connector - Quick README

## Current project status

The connector is already implemented in MVP mode and works as follows:

1. CMS creates a connector instance from page:

- /content/google-calendar/new

2. Creation API stores:

- instance: webapp_instances
- config: webapp_configs
- state: webapp_state
- API key secret (if mode=api-key): webapp_secrets_refs

3. Player loads content via iframe URL:

- /webapps/google-calendar/[instanceId]?token=[publicToken]

4. Google Calendar frontend does NOT call Google directly:

- it calls /api/public/webapps/google-calendar/[instanceId]/events?token=...
- backend resolves config + secret and calls Google API or ICS URL

This design prevents exposing the API key in player client code.

## Supported modes

- public-ics
  - uses publicIcsUrl
  - backend fetches ICS and normalizes it
  - suitable for public calendars or publishable feeds

- api-key
  - uses calendarId + apiKey
  - backend calls Calendar API v3 events.list
  - suitable for calendars readable with API key (typically public)

## Security critical point

An API key used directly in player/browser is always exposed (network tab, source map, bundle sniffing).

Therefore:

- for public calendars: acceptable with heavily restricted key
- for private calendars: do not use client-side API key
- for private calendars: use backend proxy with server-side credentials (OAuth refresh token or delegated service account)

## Related documents

- Connector create/list API: app/api/webapps/google-calendar/route.ts
- Public player events API: app/api/public/webapps/google-calendar/[instanceId]/events/route.ts
- Parsing/fetch service: lib/services/google-calendar-connector.service.ts
- CMS form: components/cms/GoogleCalendarConnectorForm.tsx
- Player UI app: webapps/google-calendar/src/GoogleCalendarApp.tsx

## Practical notes

- Today secrets are persisted in webapp_secrets_refs.
- Next recommended hardening: at-rest encryption (KMS or envelope encryption) + rotation + audit read access.
