# WebApp SDK Real-Time Channel

## Scope

This document defines the shared Socket.IO real-time channel for webapps.

Goals:

- sandboxed messaging per tenant/app/instance/channel;
- zero cross-app and cross-tenant interference;
- immediate push updates with polling fallback;
- reusable contract for developers and coding agents.

## Transport

- Namespace: `/webapp`
- Client helper: `lib/sdk/realtime-client.ts`
- Envelope contract: `lib/realtime/webapp-events.ts`
- Server auth/rooms: `lib/socket/handlers/webapp.handlers.ts`

## Required Identity Claims

Every realtime connection MUST provide:

- `appId`
- `instanceId`
- `token` (public token scoped to that instance)
- optional `channelKeys[]`

Connection is rejected if:

- app is unsupported;
- token is invalid;
- requested channels are not authorized for the instance.

## Channel Key Requirement (Mandatory)

To avoid bus interference, every message and subscription must be scoped by channel keys.

Required rule:

- each webapp must at least use `instance:<instanceId>`.

Recommended additional scope keys:

- queue apps: `queue:<queueName>`
- domain-specific apps: `<scope>:<domainEntity>`

Examples:

- `instance:67d8c...`
- `queue:cassa-1`
- `calendar:front-office`

Normalization:

- lowercase
- allowed chars: `a-z`, `0-9`, `:`, `_`, `-`
- invalid chars are normalized to `-`

## Room Model

Server-side rooms are generated as:

- `org:{orgId}:app:{appId}:instance:{instanceId}`
- `org:{orgId}:app:{appId}:channel:{channelKey}`

No global room is used by default.

## Event Envelope

All events use one transport event name: `webapp:event`.

Payload envelope:

```json
{
  "eventId": "uuid",
  "eventType": "queue.updated",
  "orgId": "...",
  "appId": "queue",
  "instanceId": "...",
  "channelKeys": ["instance:...", "queue:cassa-1"],
  "version": 1710764695000,
  "ts": "2026-03-18T11:58:15.000Z",
  "source": "api.public.queue.control",
  "payload": {}
}
```

## Snapshot + Delta Pattern

Recommended runtime behavior for all webapps:

1. connect and authenticate;
2. fetch initial HTTP state snapshot;
3. subscribe realtime with unique channel keys;
4. on `webapp:event`, apply delta or trigger immediate state refresh;
5. keep polling as fallback reconciliation.

## Fallback Polling Policy

Polling is fallback only.

Suggested baseline:

- realtime enabled: 20-30s polling
- realtime unavailable: 5-10s polling (temporary degradation)

## SDK Usage (Client)

```ts
import { initWebappRealtimeClient } from "@/lib/sdk/realtime-client";

const socket = initWebappRealtimeClient({
  appId: "queue",
  instanceId,
  token,
  channelKeys: [
    `instance:${instanceId}`,
    `queue:${queueName}`,
  ],
  onEvent: (event) => {
    if (event.eventType === "queue.updated") {
      void refetchState();
    }
  },
});

// later
socket.disconnect();
```

## Agent + Developer Checklist

Before implementing a new realtime webapp flow:

1. Define app-level channel strategy (`instance` + domain key).
2. Document allowed channel keys in app docs.
3. Enforce channel ACL server-side.
4. Emit envelope events with `eventType`, `source`, `version`.
5. Keep HTTP snapshot endpoint as fallback and recovery path.
6. Add smoke test for realtime propagation and reconnection.

## Security Rules

- never trust client-provided room names directly;
- always resolve authorization from backend instance ownership;
- never broadcast across tenants;
- include source metadata for audit and diagnostics.

## Current Implementation Status

- Shared namespace `/webapp`: implemented
- Shared SDK client helper: implemented
- Queue (Eliminacode) realtime invalidation events: implemented
- Polling fallback active: implemented
