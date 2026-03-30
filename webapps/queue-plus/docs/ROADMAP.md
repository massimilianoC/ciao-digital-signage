# QueuePLUS Roadmap

## Objective

Create a new sandboxed QueuePLUS webapp that reproduces the current visual baseline of Eliminacode, but evolves on a more structured SDK-first architecture with isolated dataset/runtime state and a roadmap centered on future-ready queue orchestration.

## Product direction

QueuePLUS is not a refactor of legacy `queue`.
It is a parallel app used to validate:

- SDK sandbox boundaries
- data-service-backed webapps with app-scoped collections
- side-by-side coexistence of similar app IDs and routes
- more robust queue models for multi-queue, multi-display, and audio-driven flows

## Implementation tracks

### 1. SDK isolation

- `appId = queue-plus`
- dedicated player routes and public APIs
- dedicated runtime collection `webapp_queue_plus_data`
- CMS entry as separate app in the registry

### 2. Visual continuity

- same baseline UI language as legacy queue
- same mode family: display, remote, waiting-list, kiosk
- same operator mental model for queue actions

### 3. Structured models

- support richer instance settings for:
  - multigate service mode
  - remote-controlled display binding
  - allowed datasets on remote
  - waiting-list layout selection
  - audio policy
  - print vs QR delivery strategy

### 4. Safe experimentation

- no changes to legacy queue runtime state
- no changes to other webapps
- no forced migration of queue datasets or instances

## Immediate next steps

1. Expand QueuePLUS waiting-list to aggregate multiple datasets.
2. Add richer audio orchestration and TTS policies.
3. Add digital ticket public tracking page.
4. Add stronger display binding ownership for multigate.
5. Add targeted E2E coverage for queue-plus lifecycle.

## Execution Tracking

- [x] 1. Waiting-list multi-coda (split/merged mode) implementata.
- [x] 2. Ticket digitale con tracking pubblico (URL + pagina) implementato.
- [x] 3. Binding multigate con lock/lease display implementato.

## Notes

- Lo sviluppo e' stato orchestrato con analisi parallela via sub-agenti e integrazione finale sequenziale sui file core condivisi per ridurre conflitti.
- QueuePLUS resta isolata da `queue` legacy: collection, API e route dedicate.
