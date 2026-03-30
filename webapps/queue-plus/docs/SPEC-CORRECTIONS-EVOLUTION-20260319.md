# QueuePLUS - Spec Corrections and Evolution

**Date**: 2026-03-19  
**Version**: 1.0  
**Origin**: UX/functional review `REVIEW_20260326_1`  
**Status**: Ready for implementation

---

## Table of contents

1. [QR Ticket Live - UX corrections](#1-qr-ticket-live---ux-corrections)
2. [Remote - UX corrections and display configuration](#2-remote---ux-corrections-and-display-configuration)
3. [Multi-queue and dataset management](#3-multi-queue-and-dataset-management)
4. [Display - TTS and multi-queue binding](#4-display---tts-and-multi-queue-binding)
5. [Summary items/priorities](#5-summary-itemspriorities)

---

## 1. QR Ticket Live - UX corrections

### 1.1 Blinking animation + soft sound alert in "Now serving" state

**Problem**: The tracking page (`/webapps/queue-plus/ticket/[ticketCode]`) does not provide visual or audio feedback when the number is called. The user must keep looking at the screen continuously.

**Requirements**:

- When `status` transitions to `serving` (ticket now being served):
  - Ticket number **blinks** on the full page (fast light/dark or bright/off alternation, cycle ~600ms).
  - A **soft alert** is emitted once at transition: short tone (200-400ms), pleasant frequency (for example 880 Hz), low volume (~0.3). Use native Web Audio API (`AudioContext`) with no external dependencies.
  - Blinking continues while state remains `serving`.
- Tone must be emitted **once only** on `waiting -> serving` transition, not at each polling refresh.
- Must not require microphone/notification permissions.

**Files involved**:

- `webapps/queue-plus/src/QueuePlusTicketTrackingApp.tsx`

**Technical notes**:

- Use `useRef` to track previous state and detect transition.
- Use `AudioContext.createOscillator()` for tone.
- CSS animation with conditional class (`animate-pulse` or custom keyframes).

---

### 1.2 Kiosk QR auto-invalidation after 60 seconds or first connection

**Problem**: QR code issued by Kiosk remains valid indefinitely. If someone captures another user's QR, they can open tracking page in their place.

**Requirements**:

- After issuing a digital ticket, QR shown in Kiosk is automatically disabled when one of the following happens first:
  1. **Timeout**: 60 seconds after ticket issuance (configurable in registry, default 60s with optional 30s).
  2. **First connection**: tracking page is loaded for the first time (`ticketFirstAccessedAt` nil -> not nil).
- When QR is invalidated:
  - Kiosk removes visible QR and shows text "QR no longer available".
  - Link remains functional (user who already opened tracking can continue monitoring).
- QR is not invalidated when already connected user reloads tracking page.

**Model changes**:

```ts
// WebAppQueuePlusTicket: add
qrExpiresAt: Date;          // issue time + 60s (or configured)
ticketFirstAccessedAt?: Date; // set on first GET /tickets/[code]
```

**Files involved**:

- `lib/db/models/webapp-queue-plus/WebAppQueuePlusTicket.ts` - add `qrExpiresAt`, `ticketFirstAccessedAt`
- `lib/services/queue-plus-ticket.service.ts` - set `qrExpiresAt` in `issueQueuePlusDigitalTicket()`; update `ticketFirstAccessedAt` in `getQueuePlusDigitalTicketState()` if still nil
- `app/api/public/webapps/queue-plus/tickets/[ticketCode]/route.ts` - no structural change, logic remains in service
- `webapps/queue-plus/src/QueuePlusKioskApp.tsx` - start 60s countdown; on expiry (or `ticketFirstAccessedAt` flag via polling) clear `trackingUrl` and show "QR no longer available" placeholder

**Note**: Kiosk has no direct access to `ticketFirstAccessedAt`. Issue API response does not change. Kiosk uses local 60s countdown (simple and reliable); server-side validity is guaranteed by `qrExpiresAt`. If "user connected" feedback is needed, Kiosk can use lightweight polling on dedicated endpoint `/tickets/[code]/qr-status` - evaluate during implementation.

---

### 1.3 Ticket page states: colors and contextual feedback

**Problem**: Tracking page displays state as plain text with weak visual differentiation between critical states.

**Requirements**:

| State | Color/theme | Behavior |
|---|---|---|
| `waiting` (position > 1) | Neutral (slate/dark blue) | Show queue position and current serving |
| `waiting` (position = 1, "next") | **Yellow/Amber** (`#F59E0B`) | Highlight "Next in line!", light border pulse |
| `serving` (now serving) | **Green** (`#10B981`) | Blinking, soft alert (see 1.1) |
| `served` (served) | **Gray** (#6B7280) | "Thank you! You have been served." - no animation |
| `expired` | Dark red | "Ticket expired." |

**"Next in line" threshold**: position = 1 (only one person ahead, currently being served).

**Files involved**:

- `webapps/queue-plus/src/QueuePlusTicketTrackingApp.tsx`

---

## 2. Remote - UX corrections and display configuration

### 2.1 Runtime display selection: all if not configured, filtered if configured

**Problem**: Current implementation shows only displays in `allowedDisplayIds` (config array). If array is empty, selector is empty and no display can be controlled.

**Requirement**:

- If `allowedDisplayIds` is empty or missing -> Remote shows **all available displays** for same org/dataset (fetched dynamically from instance state).
- If `allowedDisplayIds` is populated -> Remote shows **only those** (explicit filter).

**Impact**:

- `QueuePlusRemoteApp.tsx`: adapt display `<select>` to handle both cases.
- `remoteQueues[].availableDisplayIds` field (or equivalent) must be returned by state endpoint in "all displays" case. Alternative: add public sub-endpoint `GET /api/public/webapps/queue-plus/[instanceId]/displays` returning available displays for active dataset.
- `lib/services/queue-plus-public-state.ts`: include `availableDisplayIds` in remote state when `allowedDisplayIds` is empty.

---

### 2.2 Display config in Remote: multi-select with chip tags

**Problem**: `allowedDisplayIds` in configSchema is `text` with hint "via advanced tab". There is no intuitive UX to select one or more displays.

**Requirement**:

- In CMS, for QueuePLUS Remote instances, "Allowed displays" field must use **incremental multi-select with chips**:
  - Text input with autocomplete/dropdown of available displays (`mode=queue` or `mode=display`) in same org.
  - Selection adds chip tag with display name and `x` remove action.
  - Save on "Save configuration".
- If no display selected (empty chip list) -> remote controls all displays (default behavior, see 2.1).

**Component**:

- New `type: "multiselect-display"` in configSchema, or handled in advanced tab with dedicated `multiselect` field.
- CMS advanced configuration component (`components/cms/webapps/...`) must support this type.

**Files involved**:

- `lib/sdk/webapp-registry.ts` - update `allowedDisplayIds` from `type: "text"` to multi-select type or annotate as `multiselect`
- QueuePLUS CMS advanced configuration component

---

### 2.3 Remote control with specific display targeting for specific queue

**Problem**: Operational target is **one display per desk**. Remote must select a specific display and advance only queue assigned to that display. Current binding exists (lock/multigate), but:

- display selector shows technical IDs only, no friendly names.
- no explicit "display -> owned queue" mapping visible in Remote UI.
- when creating a new Remote after queues exist, multiple queues can be controlled, but advancing specific display is unreliable.

**Requirement**:

- Display selector in Remote shows **friendly name** (or bound `queueName`) instead of technical ID.
- When display is selected, advance/back/reset controls operate **only on that display and its queue**.
- Existing multigate lock guarantees exclusivity.
- "display -> queueName" mapping is read from corresponding display instance (`queueName` in config).

**Files involved**:

- `lib/services/queue-plus-public-state.ts` - add `displayName`/`queueName` in remote state display data
- `webapps/queue-plus/src/QueuePlusRemoteApp.tsx` - show name instead of ID in display selector

---

## 3. Multi-queue and dataset management

### 3.1 Double selector in config overriding values (medium-critical bug)

**Problem**: When creating a secondary queue via "new display instance + new queue name", dataset is created but display gets associated to primary queue because a duplicate selector in config overrides values. Result: two display instances point to same queue.

**Expected cause**: `datasetId` is present both as direct field and as part of `allowedDatasetIds`/`kioskQueueNames`; during config save one value overrides the other.

**Requirement**:

- Each display instance has **one and only one `datasetId`** reference (the queue it shows). It must not be implicitly linked to another queue via secondary selector.
- Remove or disable secondary selector that causes override.
- `allowedDatasetIds` (for Remote) must not influence Display instance `datasetId`.

**Action**: Audit config endpoint `PUT /api/webapps/queue-plus/[instanceId]/config` (or equivalent) to identify override path and fix merge logic.

---

### 3.2 Dataset creation from DATASET section returns 500 (high-critical bug)

**Problem**: In CMS "Dataset" section for QueuePLUS, creating new dataset returns HTTP 500.

**Requirement**:

- Creating new QueuePLUS dataset from Dataset section must:
  1. Create a document in `webapp_queue_plus_data` with standard queue structure (empty queue, bootstrapped dataset).
  2. Return new `datasetId`.
  3. Make dataset immediately visible in config selectors of all QueuePLUS instances in same org.
- Queue name and advanced settings are configured later via dataset edit or instance config update.

**Files to verify**:

- Dataset creation handler for `appId = queue-plus` (likely `app/api/webapps/datasets/` or similar)
- `lib/services/queue-plus.service.ts` - dataset bootstrap function

**Short-term priority**: until fixed, creation via new display/remote/kiosk instance is acceptable workaround. The 500 fix is blocking for advanced CMS workflows.

---

### 3.3 Dataset visibility across existing instance configurations

**Problem**: Once a secondary queue is created (via new display or kiosk instance), it does not appear in `allowedDatasetIds`/`allowedDisplayIds` selectors in existing Remote instances.

**Requirement**:

- "Datasets manageable by remote" selector in CMS must be **dynamic**: list all QueuePLUS datasets currently available in org, not only values hardcoded at Remote creation time.
- Same for kiosk: `kioskQueueNames` must provide autocomplete on all available datasets.
- There must be **no override assignment** behavior that invalidates a selection already configured on another instance.

---

## 4. Display - TTS and multi-queue binding

### 4.1 Text-to-Speech for audio announcements

**Problem**: Remote can update display message and includes audio state fields (`audio.speechMode: "number" | "message" | "both"`), but Display (`QueuePlusDisplayApp.tsx`) does not run any speech synthesis. User hears no audio.

**Solution**: native Chrome Web Speech API - `window.speechSynthesis`.

**Requirement**:

- When `audio.enabled = true` and `audio.speechMode !== "off"`:
  - on `currentServing` transition, Display speaks announcement.
  - `speechMode = "number"`: speak number only (for example "Number thirty-two").
  - `speechMode = "message"`: speak `displayMessage` only.
  - `speechMode = "both"`: speak number then message.
- Languages are configured in `audio.languages[]`. If requested language is unavailable in browser, use default.
- No `preChime`/`postChime` in first iteration (optional future feature).
- `preChime` tone (if enabled) precedes speech with short tone (Web Audio API), as defined in 1.1.

**Files involved**:

- `webapps/queue-plus/src/QueuePlusDisplayApp.tsx` - add `useRef` for `previousServing`, `useEffect` trigger on change, invoke `speechSynthesis.speak()`
- No external dependency required (native browser API).

---

### 4.2 Display queue binding: "accept all" vs "follow specific"

**Problem**: A display must support multiple queues. Current UI does not clearly represent which queue to follow, and Remote can override behavior causing sync loss.

**Behavior rules**:

| Display config | Behavior |
|---|---|
| `datasetId` not configured / empty | Accept updates from any queue in same org (broadcast mode) |
| `datasetId` configured | Follow only that queue (follow mode) |
| Remote sends explicit override | Display is forced to provided value and temporarily loses follow mode until reset or reconnect |

**Requirement**:

- Display real-time update filtering must follow the table above.
- "Accept all" fallback remains current behavior; "follow" mode requires check in WebSocket/polling handler.
- Remote must warn operator when overriding a follow-mode display (UI warning: "You are overriding automatic synchronization of display X").

**Criticality**: Medium. Implement after stabilizing fixes 3.1-3.3.

---

## 5. Summary items/priorities

| ID | Area | Type | Priority | Main files |
|---|---|---|---|---|
| **1.1** | Ticket tracking - blink + sound | Bug/UX | High | `QueuePlusTicketTrackingApp.tsx` |
| **1.2** | Kiosk QR - 60s auto-invalidation | Feature | High | `WebAppQueuePlusTicket.ts`, `queue-plus-ticket.service.ts`, `QueuePlusKioskApp.tsx` |
| **1.3** | Ticket tracking - colored states | UX | Medium | `QueuePlusTicketTrackingApp.tsx` |
| **2.1** | Remote - display selector "all if not configured" | Bug | High | `queue-plus-public-state.ts`, `QueuePlusRemoteApp.tsx` |
| **2.2** | Remote config - display chip multi-select | Feature | Medium | `webapp-registry.ts`, CMS config component |
| **2.3** | Remote - specific display targeting with friendly name | Feature | Medium | `queue-plus-public-state.ts`, `QueuePlusRemoteApp.tsx` |
| **3.1** | Config double-selector override | Bug | Medium | API config endpoint, service |
| **3.2** | Dataset creation from Dataset section: 500 | Bug | High | Dataset API handler, `queue-plus.service.ts` |
| **3.3** | Dataset visible in all instance selectors | Feature/Bug | Medium | CMS config components, registry |
| **4.1** | TTS Web Speech API on Display | Feature | High | `QueuePlusDisplayApp.tsx` |
| **4.2** | Display multi-queue follow/override binding | Feature | Low | `QueuePlusDisplayApp.tsx`, control handler |

---

## Open decisions (confirm before implementation)

| Decision | Options | Proposed default |
|---|---|---|
| Kiosk QR timeout (1.2) | 30s or 60s? | **60s** |
| "Next in line" threshold (1.3) | position = 1 or <= 2? | **position = 1** |
| Display selector source (2.1) | field in state or `/displays` sub-endpoint | **field in state** (smaller API surface) |
| TTS language behavior (4.1) | speak in all configured languages or first only | **First configured language only** (simpler) |

---

*Document generated from `REVIEW_20260326_1` analysis and codebase inspection on 2026-03-19.*
