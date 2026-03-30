# Queue Operations Specification

## Objective

Define the operational contract for the Eliminacode webapp so that display and remote behave as two distinct roles over the same shared queue.

## Roles

### Display

- Read-only public board.
- Shows current serving number as the dominant element.
- Can show waiting count if enabled in instance settings.
- Can show an operator message pushed from the remote.
- Can use a live accent override pushed from the remote.

### Waiting List

- Public board with the current number and the next booked tickets.
- Intended for layouts with multiple content zones or secondary waiting-room screens.

### Remote

- Operator console for the same shared queue.
- Shows the current number, waiting list, recent history, next suggested number, and display preview.
- Exposes queue actions and display actions.

### Kiosk

- Self-service ticketing surface.
- Can emit tickets only for the queue names explicitly enabled on the kiosk instance.
- Supports multi-queue reservation flows from the same screen.

## Shared State

The queue is keyed by `{orgId, queueName}`.

Shared queue state includes:

- `currentServing`
- `currentServingSeq`
- `currentSource` (`queue` or `manual`)
- `nextSeq`
- `waitingQueue`
- `history`
- `displayMessage`
- `displayAccentColor`

Queue configuration also defines:

- `serviceMode` (`reservation` or `round-robin`)
- `bookingEnabled`
- `roundRobinMaxNumber`
- `waitingListLimit`
- `kioskQueueNames`

## Command Semantics

### `issue`

- Creates a new waiting ticket using `nextSeq`.
- Must respect `maxWaiting` if configured.
- Does not change `currentServing`.
- Fails when `bookingEnabled` is off.
- In `round-robin`, allocates the next free number inside the configured cycle.

### `issueForQueue`

- Kiosk-only action.
- Emits a ticket for one of the queue names explicitly enabled on that kiosk.

### `advance`

- Moves the first waiting ticket into service.
- Moves the previous `currentServing` into `history`.
- Clears `currentServing` when there are no waiting tickets.
- In `round-robin`, advances the free counter even with no bookings.
- If a booked ticket matches the round-robin number being served, that ticket is consumed from waiting.

### `retreat`

- Restores the last item from `history` as `currentServing`.
- If the current number came from the queue, it is reinserted at the front of `waitingQueue`.
- Prevents ticket loss during operator undo.

### `set`

- Jumps to a specific number.
- If the number already exists in `waitingQueue`, it is promoted to service and removed from waiting.
- If the jump is ahead of `nextSeq`, `nextSeq` is realigned.
- The previous `currentServing` is appended to `history`.

### `reset`

- Clears service, waiting queue, message, and live accent override.
- Resets `nextSeq` to `1`.
- Optionally keeps history.

### `display`

- Updates public display-only properties:
  - `message`
  - `accentColor`
- Does not change queue progression.

## UX Contract

### Left Screen

- Large current number.
- Optional waiting counter.
- Optional operator message.
- No control actions.

### Waiting List Screen

- Large current number.
- Grid/list of next booked tickets.
- Optional operator message.

### Right Screen

- Operator console with:
  - `Avanza`
  - `Indietro`
  - `Nuovo ticket`
  - `Reset`
  - `Salta al numero`
  - `Messaggio a video`
  - `Cambio colore live`
- Waiting queue items are directly selectable as jump targets.
- The display preview mirrors what the public board will show.

### Kiosk Screen

- One card/button per enabled queue.
- Shows current serving number, waiting count, and next available ticket for each queue.
- Emits a ticket without exposing queue operator controls.

## Mode Resolution

- Queue instance mode is resolved from persisted settings.
- Query parameter `mode` is only informational and must not override the stored instance mode.
