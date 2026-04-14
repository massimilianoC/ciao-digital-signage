# Sandboxed Real-Time Infrastructure Proposal (system + Queue app)

> **Document status**: ✅ Accepted proposal, partial implementation (Phase A/B in progress)
> **Last updated**: 2026-03-18

## Implementation status (as of 2026-03-18)

| Component | Status | File/Path |
|------------|-------|----------|
| Socket.IO namespace `/webapp` | ✅ Implemented | `lib/socket/server.ts` |
| Auth handshake + room join | ✅ Implemented | `lib/socket/handlers/webapp.handlers.ts` |
| Event envelope + channel keys | ✅ Implemented | `lib/realtime/webapp-events.ts` |
| Server-side emitter | ✅ Implemented | `lib/realtime/webapp-emitter.ts` |
| SDK client (browser) | ✅ Implemented | `lib/sdk/realtime-client.ts` |
| Snapshot on connect (queue) | ✅ Implemented | `webapp.handlers.ts` -> `emitQueueSnapshot` |
| `queue.updated` post-mutation push | ⏳ Pending | Wiring required in POST handlers |
| Degraded polling 5s -> 20-30s | ⏳ Pending | `refreshSeconds` still 5 in public state |
| Abstract adapter for scalability | 📋 Backlog | Step 2/3 (Redis/NATS) |

---

## Current state (as-is)

The project already has a stable Socket.IO layer for player/admin runtime (`/player`, `/admin`, `/activation`) with baseline auth and connection recovery.

For the Queue webapp:

- State is read via token-gated API.
- Remote actions (`advance`, `issue`, `set`, `reset`, `display`) are executed via POST.
- UI refresh runs every 5s (`refreshSeconds: 5`).
- There is no dedicated event-driven queue push.

Observed effect: perceived lag between remote command and display update, especially with operator + board on different devices or unstable networks.

## Goal

Introduce a unified real-time subservice that:

- isolates channels by tenant/app/instance (logical sandboxing);
- supports immediate real-time updates for webapps and screens;
- does not break the existing system (incremental adoption);
- keeps polling as a safety fallback;
- allows future migration to queue/event-bus backends without rewriting webapps.

## Architecture principles

1. No cross-tenant leakage: each event must be scoped by `orgId`.
2. No lock-in: abstract real-time bus behind an internal interface.
3. Progressive enhancement: polling continues if real-time is unavailable.
4. Snapshot + delta: full initial alignment, then incremental events.
5. Idempotency: events include `eventId` and `version` for dedup/reorder.

## Proposed architecture

### 1) Realtime Subservice (new application module)

New internal module (initially in the same Node process):

- `lib/realtime/contracts.ts`: event envelope, topic naming, versioning.
- `lib/realtime/bus.ts`: abstract publish/subscribe interface.
- `lib/realtime/adapters/socketio.ts`: default adapter (no external service).
- `lib/realtime/adapters/optional-queue.ts`: optional adapter for scale (future phase).
- `lib/realtime/auth.ts`: claim validation for `orgId/appId/instanceId/screenId`.

Goal: keep Socket.IO as the primary transport, but avoid hardcoding business logic inside legacy namespaces.

### 2) Sandboxed channel model

Standard topic/room naming:

- `org:{orgId}:app:{appId}`
- `org:{orgId}:app:{appId}:instance:{instanceId}`
- `org:{orgId}:screen:{screenId}`
- `org:{orgId}:group:{groupId}`
- `org:{orgId}:queue:{queueName}` (Queue specific)

Rules:

- a connection can join only authorized rooms;
- no global unscoped broadcast;
- all payloads include `orgId` and version metadata.

### 3) Unified event envelope

```json
{
  "eventId": "uuid",
  "eventType": "queue.updated",
  "orgId": "...",
  "appId": "queue",
  "instanceId": "...",
  "entityId": "queue:cassa1",
  "version": 42,
  "ts": "2026-03-18T10:15:30.000Z",
  "source": "api.public.queue.control",
  "payload": {}
}
```

Key fields:

- `version`: monotonic per entity (useful against out-of-order);
- `eventId`: client-side dedup;
- `source`: observability and tracing.

### 4) State and reconciliation

Recommended operational pattern:

1. Client connects to authorized channel.
2. Client requests initial `snapshot`.
3. Server sends snapshot with current `version`.
4. Server pushes real-time deltas.
5. If heartbeat/reconnect fails, client runs reconciliation polling.

This removes polling as the primary driver while keeping it as a safety net.

## Queue focus (anti-lag)

## Root cause of lag

- Fixed 5s timeout loop.
- POST command and GET state are non-atomic in UX terms (separate round-trips).
- No immediate queue update push.

## Dedicated solution (without interfering with other webapps)

1. Introduce dedicated queue real-time scope in Socket.IO (new namespace or dedicated room set inside webapp namespace).
2. Each queue update emits `queue.updated` in room `org:{orgId}:queue:{queueName}`.
3. Remote and display subscribe to the same room.
4. POST command returns `newVersion` and applied `eventId`.
5. Display updates UI immediately on push, not on timer.
6. Polling stays active but degraded (for example 20-30s) as fallback/recovery.

Minimal Queue events:

- `queue.snapshot`
- `queue.updated`
- `queue.ticket.issued`
- `queue.error` (optional)

Suggested `queue.updated` payload:

```json
{
  "queueName": "cassa1",
  "currentServing": "A042",
  "waitingCount": 18,
  "waitingQueuePreview": ["A043", "A044", "A045"],
  "displayMessage": "Sportello 2",
  "accentColor": "#2563EB"
}
```

## Queue UX targets

- P95 remote action -> display update: < 500 ms on normal WAN.
- P99 fallback consistency: < 30 s (via reconciliation polling).
- No UX lock on short disconnections (optimistic local + rollback on error).

## General proposal for all webapps

## Shared realtime SDK

Add a small common API to the WebApp SDK:

- `subscribe(channel, handlers)`
- `requestSnapshot(entity)`
- `publishCommand(command)` (authorized apps only)
- `onConnectionStateChange(state)`

Benefits:

- every webapp uses the same semantics;
- lower risk of inconsistent custom implementations;
- simpler onboarding for external apps.

## Screen integration (content sync)

Reuse the same subservice for:

- manifest/schedule notifications to screen players;
- synchronous commands (override, refresh, sync anchor);
- group/screen/org fan-out.

Suggested channels:

- `org:{orgId}:screen:{screenId}`
- `org:{orgId}:group:{groupId}`
- `org:{orgId}:manifest`

## Local/P2P (future, optional)

For local network synchronization and reduced server traffic:

- keep control-plane centralized via Socket.IO;
- add P2P data-plane only when needed (heavy assets, not critical commands);
- use WebRTC DataChannel for nearby player content sharing, with HTTP fallback.

Note: for real-time commands (queue/control/manifest), server remains source of truth.

## Technology: what to use now

Recommended 3-step approach:

1. Step 1 (now): Socket.IO only + abstract internal adapter.
2. Step 2 (medium scale): Redis adapter/backplane for multi-instance Node.
3. Step 3 (high scale/event sourcing): NATS or RabbitMQ only if concrete needs emerge for durability/advanced cross-service fan-out.

Requested evaluation (RabbitMQ/Mosquitto):

- RabbitMQ: powerful but higher operational complexity; not needed initially.
- Mosquitto/MQTT: excellent for IoT edge, less natural in a web-centric Socket.IO stack.
- Pragmatic decision: start with no external broker; prepare adapter interfaces for future adoption without mass refactor.

## Security and isolation

1. Mandatory auth handshake with scoped token.
2. Server-side room join ACL (never trust client input alone).
3. Rate limiting for command endpoints and real-time publish.
4. Command audit logs (`who`, `when`, `from`, `result`).
5. Kill switch per app/instance: token revocation + publish/subscribe block.

## Observability

Minimum metrics:

- end-to-end command latency (remote -> display);
- reconnect rate and duration;
- event drop/dedup count;
- snapshot size and frequency;
- fallback polling activation rate.

Alerts:

- P95 latency above threshold;
- abnormal reconnect bursts per org;
- high version mismatch rate.

## Recommended rollout plan

### Phase A - Queue hardening (✅ PARTIALLY COMPLETED)

- ✅ Namespace `/webapp` with auth + room join.
- ✅ Snapshot on connect: `queue.snapshot` emitted at handshake.
- ✅ Client SDK with auto-reconnect and snapshot request.
- ⏳ Emit `queue.updated` after each queue mutation (POST advance/issue/set/reset).
- ⏳ Degrade polling `refreshSeconds` from 5s to 20-30s.
- ⏳ Measure latency KPIs in logs.

### Phase B - Shared Realtime SDK (✅ PARTIALLY COMPLETED)

- ✅ `lib/realtime/webapp-events.ts`: envelope contracts, channel naming.
- ✅ `lib/realtime/webapp-emitter.ts`: reusable `emitWebappEvent()`.
- ✅ `lib/sdk/realtime-client.ts`: reusable `initWebappRealtimeClient()`.
- ⏳ Extend to Google Calendar (event push on refresh).
- ⏳ Apply to Wordpress Link (push on fetch cycle).

### Phase C - Realtime for screen sync (Backlog)

- Standardize manifest/command push on the new versioned envelope.
- Add standard metrics and status dashboard.

### Phase D - Optional backplane (Backlog)

- Evaluate real load.
- Enable Redis adapter or broker when multi-node saturation appears.

## Compatibility and non-interference

This proposal is designed to avoid interference with the main system:

- No removal of existing HTTP paths.
- Polling retained as fallback.
- Domain-isolated namespaces/rooms per app.
- Gradual migration per single webapp.

## Recommended decision

1. Implement dedicated Queue real-time now (quick lag win).
2. Consolidate a shared real-time subservice with uniform envelope and ACL.
3. Defer RabbitMQ/Mosquitto until concrete scale/durability requirements exceed Socket.IO + backplane capabilities.

In short: solve current lag first with a lean base, then unlock scalability via pluggable adapters without changing application contracts.

## Extension: AI Automation + Multi-Provider Event Fabric

This extension defines how to use the same real-time infrastructure to orchestrate AI automations, external providers, and operational workflows.

### Extended goal

1. Reuse the shared event envelope for AI actions, not only queue/player.
2. Isolate tenant and capability at channel, command, and result level.
3. Support multiple providers without lock-in to a single vendor.

### Event taxonomy (new eventType)

- `automation.command.requested`
- `automation.command.accepted`
- `automation.command.needs-confirmation`
- `automation.command.rejected`
- `automation.job.started`
- `automation.job.progress`
- `automation.job.completed`
- `automation.job.failed`
- `provider.webhook.received`
- `provider.webhook.rejected`

### Command Gate pattern (high-impact actions)

For high-impact commands (`publish`, `override`, `clear`, `replace schedule`):

1. LLM/Workflow proposes a structured command.
2. Policy engine evaluates permissions, constraints, and conflicts.
3. If needed, system emits `automation.command.needs-confirmation`.
4. Only after explicit confirmation does it emit `automation.command.accepted` and start the job.

### Async execution pattern

Long-running tasks (image/video/audio generation, batch translation, mass publish) go through an async queue.

Minimum job contract:

```json
{
  "jobId": "uuid",
  "orgId": "...",
  "action": "media.generate",
  "requestedBy": "user-or-connector",
  "status": "queued|running|completed|failed",
  "input": {},
  "output": {},
  "startedAt": "...",
  "completedAt": "..."
}
```

### Multi-provider gateway (protocol-neutral)

Each provider is abstracted by an adapter with the same interface:

- `prepareRequest(context, action)`
- `execute(request)`
- `normalizeResponse(raw)`
- `normalizeError(raw)`
- `supports(modelOrCapability)`

Required gateway strategies:

1. Provider priority per capability (`llm.chat`, `media.image`, `media.video`, `translate.text`).
2. Timeout and retry with backoff.
3. Circuit breaker for degraded providers.
4. Failover to secondary provider when policy allows.

### Supported standard protocols

1. **OpenAI-compatible API**: chat, completion, tool/function calling.
2. **Webhook signed callbacks**: signature and timestamp validation.
3. **MCP-style tool registry**: expose backend capabilities as semantically described tools.
4. **Custom REST providers**: adapter mapping without impacting upper layers.

### Open source candidates (aligned with stack)

- **Job orchestration**: BullMQ (quick start), Temporal (advanced workflows).
- **Event fabric/backplane**: Redis Streams (simple), NATS (low latency), RabbitMQ (durability/routing).
- **Observability**: OpenTelemetry + Prometheus + Grafana.

### Suggested automation channels

- `org:{orgId}:automation`
- `org:{orgId}:automation:job:{jobId}`
- `org:{orgId}:provider:{providerId}`
- `org:{orgId}:screen:{screenId}` (publish/scheduler notifications)

### Infrastructure KPIs (automation)

1. Command acceptance latency (P95).
2. Job completion time by action/provider.
3. Provider error rate and failover activation rate.
4. Number of commands blocked by policy/conflict.
5. Scheduler conflict resolution success rate.

### Compatibility with current implementation

- No breakage to existing APIs.
- Socket.IO remains base transport in phase one.
- Polling remains fallback for legacy clients.
- Progressive feature/connector introduction.
