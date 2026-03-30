# WebApp SDK Agent Guide

## Purpose

This subproject defines the lightweight SDK, integration contracts, templates, and AI-assisted delivery rules for semi-agnostic web apps hosted by Ciao player.

## Goal

Enable rapid creation and porting of 100% web/HTML5 applications that can run inside the player while keeping business logic, secrets, and tenant governance under control.

## Non-Negotiable Constraints

- Target runtime is modern Chrome.
- Integrations must work with standard web platform APIs first.
- Chrome extensions are allowed only for hardware access not available through standard browser APIs.
- Third-party secrets must never be embedded in frontend code.
- Hosted apps must tolerate iframe sandbox execution.

## Delivery Modes

1. External SDK app

- Best for read-only, low-risk, or partner-developed apps.
- Hosted through asset.webapp.
- Uses Ciao host bridge for lifecycle, context, and health.

1. Internal adapter app

- Best for sensitive APIs, tenant licensing, PII, booking/queue systems, or SLA-critical flows.
- UI is still web-based, but data access is mediated by Ciao backend.
- Can still be hosted through the same player runtime contract.

## Agent Workflow

When building a new web app integration, always follow this order:

1. Define the app card

- appId
- use case
- data sources
- interaction mode
- tenant constraints
- risk level

1. Choose hosting mode

- external-sdk-app
- internal-adapter-app

1. Define persistence needs

- config only
- config + cached data
- config + operational state
- config + transactional domain

1. Choose storage tier

- central shared collections
- app-scoped collection namespace in central DB
- external domain database only if required

1. Generate implementation

- connector endpoint or proxy
- SDK app shell
- player manifest mapping
- CMS assignment path
- tests

## Required Outputs Per App

- Integration card in planning docs
- Config schema
- Backend access policy
- Player manifest example
- Smoke E2E
- Recovery behavior definition

## Real-Time Delivery Rules

When an app needs real-time updates, agents and developers must adopt the shared SDK realtime channel.

Mandatory steps:

1. Define channel key strategy

- Always include `instance:<instanceId>`.
- Add at least one domain key if multiple instances share the same domain state.

1. Enforce server-side authorization

- Validate requested `channelKeys` against instance ownership and app rules.
- Reject unauthorized channels.

1. Emit standardized envelope events

- Use `eventType`, `eventId`, `source`, `version`, `ts`.
- Include `channelKeys` in every event for traceability.

1. Keep snapshot + fallback

- Initial state comes from HTTP snapshot.
- Real-time channel is used for instant invalidation/delta.
- Polling stays active as reconciliation safety net.

1. Document channel keys in app docs

- Every app must list supported keys and expected payload/event types.

Reference: `docs/webapp-sdk/REALTIME.md`.

## Definition Of Done

- App runs in Chrome in player iframe sandbox.
- Health status is reported to host.
- No tenant secret leaks to browser payloads.
- App can be disabled by kill switch.
- At least one onboarding template or example exists for future reuse.
