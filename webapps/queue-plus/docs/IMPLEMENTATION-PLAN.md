# QueuePLUS Implementation Plan

## Goal

Ship QueuePLUS as a fully separate sandboxed webapp that mirrors the current queue UX baseline while introducing stronger SDK-first boundaries and richer future-proof settings.

## Phase 1: Platform registration

- add `queue-plus` to core app ID enums
- register QueuePLUS in SDK registry and dataset sandbox contract
- expose a dedicated CMS creation route

## Phase 2: Isolated persistence

- create `webapp_queue_plus_data`
- create QueuePLUS service layer for bootstrap, read, issue, advance, retreat, reset, display updates
- wire SDK dataset service to show QueuePLUS runtime summary

## Phase 3: Runtime surfaces

- add player route for QueuePLUS
- add public `state` and `control` APIs
- enable shared realtime namespace with QueuePLUS authorization and snapshots

## Phase 4: CMS ergonomics

- add QueuePLUS advanced custom config
- support queue autocomplete from QueuePLUS dataset catalog
- support remote dataset selection and kiosk dataset enablement

## Phase 5: Validation focus

- verify SDK can host two similar apps without route or dataset collisions
- verify sandboxed realtime channels remain app-scoped
- verify QueuePLUS content URLs remain isolated from legacy queue

## Delivered in this first pass

- QueuePLUS app registration
- QueuePLUS runtime model and service layer
- QueuePLUS player + APIs
- QueuePLUS CMS creation form and advanced config
- QueuePLUS docs and manifest

## Deferred intentionally

- merged multi-queue waiting-list projection
- digital ticket public page and PDF generation
- real printer adapters
- full multigate ownership arbitration
- dedicated QueuePLUS E2E test suite

## Advancement Log (2026-03-19)

1. Point 1 - Multi-queue waiting list: completed in first operational pass.
2. Point 2 - Digital QR ticket tracking: completed in first operational pass (public tracking route + page + ticket persistence).
3. Point 3 - Multigate display lock ownership: completed in first operational pass (lock API + lease checks in control flow + remote UI lock controls).

## Advancement Log (2026-03-19 Wave 2)

1. Ticket tracking UX upgraded: contextual statuses (next-in-line/serving/served/expired), serving flash, and soft audio alert on transition.
2. Kiosk QR lifecycle hardened: QR availability timeout (60s), QR status polling, and automatic QR invalidation UI.
3. Remote display targeting improved: dynamic discovered displays when allowed list is empty, friendly display labels, and coherent ACL fallback in lock/control APIs.
4. Display announcer enabled: Web Speech API based TTS on `currentServing` transitions honoring `audio.speechMode` and configured language.
5. CMS advanced config improved: `allowedDisplayIds` moved from plain comma text to chip-based editor for cleaner management.

### Updated files

- `lib/services/queue-plus-public-state.ts`
- `app/webapps/queue-plus/[instanceId]/page.tsx`
- `webapps/queue-plus/src/QueuePlusWaitingListApp.tsx`
- `lib/db/models/webapp-queue-plus/WebAppQueuePlusTicket.ts`
- `lib/services/queue-plus-ticket.service.ts`
- `app/api/public/webapps/queue-plus/tickets/[ticketCode]/route.ts`
- `app/webapps/queue-plus/ticket/[ticketCode]/page.tsx`
- `webapps/queue-plus/src/QueuePlusTicketTrackingApp.tsx`
- `app/api/public/webapps/queue-plus/[instanceId]/control/route.ts`
- `lib/db/models/webapp-queue-plus/WebAppQueuePlusDisplayLock.ts`
- `lib/services/queue-plus-display-lock.service.ts`
- `app/api/public/webapps/queue-plus/[instanceId]/lock/route.ts`
- `webapps/queue-plus/src/QueuePlusRemoteApp.tsx`
- `webapps/queue-plus/src/QueuePlusKioskApp.tsx`
- `middleware.ts`
