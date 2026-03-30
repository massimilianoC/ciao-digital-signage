# Queue App (Eliminacode)

Digital queue management system with shared state, display mode, and remote control mode.

## Concepts

### Queue Data

A queue is identified by `{orgId, queueName}`. Multiple instances can reference the **same** queueName, enabling:

- One display instance on a public screen (big-number board)
- One remote control instance on a tablet or back-office screen

Queue data is stored in the `webapp_queue_data` collection and is independent from instances.

### Instance Modes

| Mode | Description | Player URL param |
|------|-------------|-----------------|
| `queue` | Full-screen current-number board, read-only | `?mode=queue&token=…` |
| `display` | Legacy alias for `queue` | `?mode=display&token=…` |
| `remote` | Control panel with advance/retreat/issue/set/reset | `?mode=remote&token=…` |
| `waiting-list` | Public screen with current number + next booked tickets | `?mode=waiting-list&token=…` |
| `kiosk` | Self-service multi-queue ticket kiosk | `?mode=kiosk&token=…` |

### Service Modes

| Mode | Description |
|------|-------------|
| `reservation` | Serve only booked tickets in FIFO order |
| `round-robin` | Cycle the free counter up to a max number even when no tickets are booked |

### Queue Types

| Type | Display format | Example |
|------|---------------|---------|
| `numeric` | Pure number | `42` |
| `alpha` | Prefix + zero-padded number | `A042` |

## Setup

1. Create a **display** instance and mount its player URL on a screen or timeline.
2. Create a second **remote** instance with the **same queueName** and assign it to a staff tablet.
3. Use the remote panel to advance the queue; display/remote update in real-time with fallback polling.

## Real-time channel

Queue instances now use Socket.IO `/webapp` real-time events in addition to HTTP APIs.

Required channel keys:

- `instance:<instanceId>`
- `queue:<queueName>`

Main events:

- `queue.snapshot`
- `queue.updated`
- `queue.ticket.issued`

Polling remains enabled as fallback reconciliation (20s default).

## API Reference

### Public (token-gated)

```
GET  /api/public/webapps/queue/[instanceId]/state?token=...
POST /api/public/webapps/queue/[instanceId]/control?token=...
```

#### Control actions

```json
{ "action": "advance" }
{ "action": "retreat" }
{ "action": "issue" }
{ "action": "set", "displayNumber": "B007" }
{ "action": "reset", "keepHistory": false }
```

`display` mode instances reject control actions (403).

### Internal (CMS)

```
POST /api/webapps/queue
```

Request body:

```json
{
  "name": "Cassa 1 — Display",
  "mode": "display",
  "queueName": "cassa1",
  "queueType": "numeric",
  "prefix": "",
  "maxWaiting": 50,
  "accentColor": "#facc15"
}
```

## Player URLs

```
/webapps/queue/[instanceId]?token=[publicToken]&mode=display
/webapps/queue/[instanceId]?token=[publicToken]&mode=queue
/webapps/queue/[instanceId]?token=[publicToken]&mode=remote
/webapps/queue/[instanceId]?token=[publicToken]&mode=waiting-list
/webapps/queue/[instanceId]?token=[publicToken]&mode=kiosk
```

The `mode` param is informational (cosmetic); actual mode is stored in instance settings and enforced server-side.

## Operational Spec

Detailed remote/display behavior, command semantics, and undo/jump rules live in `docs/webapps/queue/OPERATIONS.md`.

## Configuration Schema Fields

| Key | Type | Description |
|-----|------|-------------|
| `name` | text | Instance label |
| `mode` | select | `display` or `remote` |
| `serviceMode` | select | `reservation` or `round-robin` |
| `bookingEnabled` | toggle | Enables/disables ticket booking independently from service mode |
| `queueName` | text | Shared queue identifier |
| `queueType` | select | `numeric` or `alpha` |
| `prefix` | text | Letter prefix (alpha only) |
| `maxWaiting` | number | Max waiting numbers (0 = unlimited) |
| `roundRobinMaxNumber` | number | Highest number used by the free round-robin counter |
| `waitingListLimit` | number | Max items rendered in waiting-list mode |
| `kioskQueueNames` | array<string> | Queue names enabled on a multi-queue kiosk |
| `accentColor` | color | Accent color for display board |
