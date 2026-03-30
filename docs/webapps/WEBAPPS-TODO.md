# Webapps TODO & Specifications

Status: Draft execution plan
Owner: Platform + CMS + Runtime
Scope: Queue webapp completion (4 modes), DB coherence, sandboxing, multicoda/kiosk/print, E2E hardening, ZIP install-ready architecture (documentation-first)

## 1. Objectives

- Complete queue webapp behavior across 4 operative modes:
  - queue
  - remote
  - waiting-list
  - kiosk
- Keep full consistency between config, runtime state, and public APIs.
- Prepare plugin-style architecture for remote ZIP installation (without enabling runtime install yet).
- Ship robust E2E coverage for real-world flows.

## 2. Current Baseline (as of this plan)

- Per-webapp component folders exist:
  - components/webapps/queue
  - components/webapps/google-calendar
- Queue supports expanded config and modes at API/UI level.
- Kiosk supports multi-queue issue via queue catalog and queue whitelist.
- Unit tests for queue helpers exist.
- E2E for queue modes exists but requires stable Playwright/dev-server orchestration.

## 3. Target Mode Specifications

### 3.1 queue mode (public board)

- Read-only display of current serving.
- Optional waiting count.
- Optional operator message and accent override.
- No control actions.
- Must always resolve state by persisted settings (never query-string override as source of truth).

### 3.2 remote mode (operator console)

- Actions:
  - advance
  - retreat (must not lose consumed ticket)
  - issue
  - set
  - reset
  - display update (message/accent)
- Service strategy awareness:
  - reservation
  - round-robin
- Booking toggle awareness (issue disabled when bookingEnabled=false).

### 3.3 waiting-list mode (public queue projection)

- Large current serving + next N waiting tickets.
- N controlled by waitingListLimit.
- Same queueName as queue/remote for shared state.
- No control actions.

### 3.4 kiosk mode (self-service ticketing)

- Emits tickets only for whitelisted queues.
- Supports multi-queue cards with per-queue status.
- No operator controls (advance/retreat/set/reset denied).
- Booking policy enforced per target queue.
- Must expose printable ticket payload (see print section).

## 4. Database Coherence Requirements

## 4.1 Config coherence

- settings.mode enum includes queue, remote, waiting-list, kiosk (+ display alias legacy).
- settings.serviceMode enum includes reservation, round-robin.
- settings.bookingEnabled independent from serviceMode.
- settings.kioskQueueNames (strict array only).

## 4.2 Runtime coherence

- webapp_queue_data remains single source for shared queue state by {orgId, queueName}.
- Invariants:
  - nextSeq is monotonic in reservation mode.
  - nextSeq cycles correctly in round-robin policy where required.
  - retreat restores previous state without dropping active queue ticket.
  - history entries include enough metadata for safe undo.

## 4.3 Access coherence

- Public state/control endpoints must enforce:
  - token validity
  - mode authorization
  - org isolation
  - queueName normalization

## 5. Sandboxing & Security Specifications

- Treat all webapps as untrusted runtime surfaces.
- Mandatory constraints:
  - token-gated public APIs
  - no third-party secrets in frontend payloads
  - strict org-bound DB filters
  - minimal response payloads
- For external ZIP onboarding (future runtime):
  - signed package verification
  - manifest schema validation
  - allowlisted entrypoints
  - scoped capability model (read-state, control, settings-write)

## 6. Multi-Queue / Multi-Kiosk / Printing Specifications

### 6.1 Multi-queue

- Queue catalog endpoint must return queue metadata and policy snapshot.
- Kiosk can target multiple queues via explicit whitelist.

### 6.2 Multi-kiosk

- Multiple kiosk instances can issue to overlapping queue sets.
- Issue operation must remain conflict-safe and idempotent enough under concurrency.

### 6.3 Printing

- Introduce print contract for ticket emission response:
  - queueName
  - displayNumber
  - issuedAt
  - kioskInstanceId
  - printablePayloadVersion
- Prepare printer abstraction (later implementation):
  - browser print layout (P0)
  - thermal adapter extension point (P1)

## 7. E2E Test Plan (Playwright)

## 7.1 Test suite structure

- e2e/webapps/queue/
  - queue-mode.spec.ts
  - remote-mode.spec.ts
  - waiting-list-mode.spec.ts
  - kiosk-mode.spec.ts
  - cross-mode-flow.spec.ts

## 7.2 Mandatory E2E scenarios

- Queue + Remote shared state synchronization.
- Retreat restores previous serving and re-queues consumed ticket.
- Reservation mode with booking on/off transitions.
- Round-robin cyclic serving with max boundary.
- Waiting-list reflects same queue state with limit.
- Kiosk issues on authorized queue and rejects unauthorized queue.
- Multi-kiosk concurrent issue smoke (same queue set).
- Reset semantics (history keep=false and keep=true).

## 7.3 Debug workflow

- Use Playwright UI/trace for frontend regressions.
- Keep a dedicated troubleshooting note per failure:
  - failing selector
  - network payload mismatch
  - API status mismatch
  - screenshot + trace artifact path

## 8. ZIP Install-Ready Architecture (Documentation Phase)

## 8.1 Package shape

- webapps/<appId>/
  - webapp.manifest.json
  - db.setup.json
  - BOUNDARIES.md
  - optional migrations/
  - optional ui/
  - optional api/

## 8.2 Manifest contract

- app identity
- sdk version
- entrypoints
- modes
- settings schema reference
- capabilities requested

## 8.3 DB setup contract

- collections touched
- indexes required
- migration steps (idempotent)
- rollback notes

## 8.4 Installer stages (future implementation)

- upload
- validate
- dry-run
- apply migrations/indexes
- register app
- activate/deactivate
- rollback

## 9. Execution Backlog (TODO)

- [ ] Normalize queue docs and registry naming (queue vs display legacy) in one canonical policy table.
- [ ] Add ticket print response contract to control endpoint docs.
- [ ] Enforce kioskQueueNames array validation in all queue configuration touchpoints.
- [ ] Add concurrency-safe issue tests for multi-kiosk same queue.
- [ ] Stabilize Playwright webServer startup (lock handling and isolated port strategy).
- [ ] Split queue E2E into mode-focused specs under e2e/webapps/queue.
- [ ] Add sandbox capability matrix per webapp in docs/webapps.
- [ ] Add ZIP package verification spec (signature/hash + schema checks).
- [ ] Add installer API design draft (admin-only) with dry-run and rollback.
- [ ] Add operational runbook for kiosk printing fallback (no printer / offline printer).

## 10. Acceptance Criteria

- All 4 modes pass dedicated E2E suite in CI/staging.
- Queue state invariants verified by unit + integration tests.
- Kiosk unauthorized queue issue is rejected with explicit error.
- Retreat behavior validated against regression case (lost served ticket).
- ZIP install architecture documented with manifest/db schema contracts and staged installer workflow.

## 11. Out of Scope (for this phase)

- Full runtime ZIP installer implementation.
- Thermal printer native driver integration.
- Marketplace/discovery service for external packages.
