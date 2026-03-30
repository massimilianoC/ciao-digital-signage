# Composite Layouts - Full Technical Documentation

> **Status**: Implemented (active development)
> **Last updated**: 2026-03-30
> **Author**: Claude Code

---

## Table of contents

1. [Overview](#1-overview)
2. [Component architecture](#2-component-architecture)
3. [Data model](#3-data-model)
4. [API Routes](#4-api-routes)
5. [User flow (editor)](#5-user-flow-editor)
6. [Anti-loop and nesting rules](#6-anti-loop-and-nesting-rules)
7. [Background system (backgroundImage)](#7-background-system-backgroundimage)
8. [Propagation warning](#8-propagation-warning)
9. [Player integration](#9-player-integration)
10. [Acceptance criteria and status](#10-acceptance-criteria-and-status)
11. [TODO / Future developments](#11-todo--future-developments)

---

## 1. Overview

**Composite Layouts** are reusable entities that split the screen into independent zones. Each zone can host a different content type (playlist, static asset, webapp, sub-layout). The resulting layout is treated as a schedulable asset across the CMS (schedule, playlists).

**Key principles:**

- Percentage-based coordinates (0-100%) -> resolution-agnostic
- Reusability: one layout can be assigned to N screens
- Shared editing: saving propagates to all assigned screens
- Anti-loop: max 3 nesting levels, real-time cycle detection
- Background image: both the global canvas and each zone support a background image (visual reference in the editor + player fallback)

---

## 2. Component architecture

```
app/(cms)/layouts/
├── page.tsx                  ← Layout list (card view)
├── new/page.tsx              ← New layout creation page
└── [id]/page.tsx             ← Existing layout editor page

components/cms/layouts/
├── LayoutCompositeEditor.tsx ← Main editor component (orchestrator)
├── ZoneCanvas.tsx            ← Drag-resize canvas for zones
├── ZoneContentPicker.tsx     ← Zone content selection modal
├── PropagationWarningModal.tsx ← Propagation warning modal
└── types.ts                  ← Shared TypeScript types
```

### LayoutCompositeEditor

Main orchestrator. It manages the complete editor state and API calls.

**Props:**

```typescript
interface LayoutCompositeEditorProps {
  layoutId?: string;       // undefined = new layout
  initialData?: CompositeLayoutData;
}
```

**Editor states:**

```
idle → dirty → saving → saved
                      ↓
              confirming_propagation → saving → saved
                      ↓
                    error
```

**Local state:**

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Layout name |
| `zones` | `LayoutZone[]` | Zone array |
| `resolution` | `Resolution` | Canvas resolution (default 1920x1080) |
| `backgroundImage` | `string` | Global layout background image URL |
| `selectedZoneId` | `string \| null` | Active zone in inspector |
| `editorState` | `EditorState` | Editor FSM state |
| `deleteZoneId` | `string \| null` | Zone awaiting delete confirmation |
| `showContentPicker` | `boolean` | Show/hide ZoneContentPicker |
| `showPropagationWarning` | `boolean` | Show/hide PropagationWarningModal |
| `usageCount` | `number` | Number of layouts referencing this one |

**Side effects:**

- Mount (existing layout): `GET /api/layouts/{id}/assigned-count`
- Save: `POST /api/layouts` (new) or `PATCH /api/layouts/{id}` (existing)
- Delete layout: `DELETE /api/layouts/{id}` -> redirect `/layouts`

### ZoneCanvas

Pure canvas rendering. No API calls. Rendering + mouse interactions only.

**Props:**

```typescript
interface ZoneCanvasProps {
  zones: LayoutZone[];
  resolution: Resolution;
  selectedZoneId: string | null;
  backgroundImage?: string;         // global canvas background URL
  onZoneAdd: (zone: LayoutZone) => void;
  onZoneMove: (id: string, x: number, y: number) => void;
  onZoneResize: (id: string, w: number, h: number, x: number, y: number) => void;
  onZoneSelect: (id: string | null) => void;
  onZoneRemove: (id: string) => void;
}
```

**Interaction modes:**

```
idle
  ↓ mousedown on empty canvas
adding { startX, startY, currentX, currentY }
  ↓ mouseup (if area ≥ MIN_ZONE_SIZE=5%)
→ onZoneAdd() + idle

idle
  ↓ mousedown on zone
moving { zoneId, startMouseX, startMouseY, startZoneX, startZoneY }
  ↓ mouseup
→ onZoneMove() + idle

idle
  ↓ mousedown on resize handle
resizing { zoneId, handle, startMouseX, startMouseY, startZone }
  ↓ mouseup
→ onZoneResize() + idle
```

**Geometry constraints:**

- `MIN_ZONE_SIZE = 5%`
- Zones are clamped to canvas bounds (0-100)
- During resize, minimum dimensions are always enforced

**Visual style:**

- Canvas background: `#1a1a1a` (dark, represents physical screen) + grid overlay
- If `backgroundImage` exists: rendered as CSS `background-image` cover on canvas
- Zones: white background `rgba(255,255,255,0.82)` for readability in dark editor
- Selected zone: `rgba(255,255,255,0.92)` + `hsl(var(--primary))` border + box-shadow
- If `zone.backgroundImage` exists: rendered as CSS `background-image` cover on zone

### ZoneContentPicker

Modal used to assign content to a zone. It loads available content and applies anti-loop logic.

**Behavior:**

1. Loads all org layouts via `GET /api/layouts`
2. For each candidate layout, computes whether it would create a loop (graph traversal)
3. Loads static content (assets) and playlists
4. Grays out items that would cause loops or exceed max depth

### PropagationWarningModal

Informational modal shown before saving a layout already assigned to screens.

**Props:**

```typescript
interface PropagationWarningModalProps {
  usageCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}
```

**Note**: `usageCount` is loaded via `GET /api/layouts/{id}/assigned-count` when the editor mounts. The modal is triggered when `!isNew && usageCount > 0`.

### Inspector Panel (right sidebar)

When a zone is selected, the panel shows:

| Field | Behavior |
|---|---|
| **Zone name** | Text input -> `handleZoneLabelChange` |
| **Zone background** | URL input -> `handleZoneBackgroundImageChange` + preview |
| **Position** | Read-only: X%, Y%, W%, H% |
| **Content** | Assigned: shows type+label + remove button. Unassigned: shows "Assign content" button that opens ZoneContentPicker |
| **Delete zone** | Red button -> opens confirmation modal |

When no zone is selected:

| Field | Behavior |
|---|---|
| **Layout background** | URL input -> `handleLayoutBackgroundImageChange` + preview |

**Zone deletion modal**: dark overlay with dialog, "Cancel" / "Delete" buttons. Controlled via `deleteZoneId` state.

---

## 3. Data model

### TypeScript types (`components/cms/layouts/types.ts`)

```typescript
type ZoneContentType = "playlist" | "content" | "layout";

interface ZoneContent {
  type: ZoneContentType;
  refId: string;           // ObjectId as string
  label: string;           // display name
}

interface LayoutZone {
  id: string;              // crypto.randomUUID()
  x: number;               // 0-100 (percent)
  y: number;               // 0-100 (percent)
  width: number;           // 1-100 (percent)
  height: number;          // 1-100 (percent)
  label?: string;          // user-editable zone name
  content?: ZoneContent;   // assigned content
  backgroundImage?: string; // zone background URL (editor + player fallback)
}

interface Resolution {
  width: number;   // px, default 1920
  height: number;  // px, default 1080
}

interface CompositeLayoutData {
  _id?: string;
  name: string;
  resolution: Resolution;
  zones: LayoutZone[];
  backgroundImage?: string; // global layout background URL
}
```

### Mongoose model (`lib/db/models/CompositeLayout.ts`)

Collection: `compositelayouts`

```typescript
interface ICompositeLayout {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;       // tenant isolation - ALWAYS included in queries
  name: string;                // required, trim, max 200
  status: "active" | "suspended"; // default "active"
  resolution: { width: number; height: number }; // default 1920x1080
  zones: LayoutZone[];         // % coordinates (Mongoose subdoc array)
  backgroundImage?: string;    // global background image URL
  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes:**

```javascript
{ orgId: 1 }                  // implicit (index: true)
{ orgId: 1, _id: 1 }         // single lookup per org
{ orgId: 1, status: 1 }      // active list filtering
```

---

## 4. API Routes

### `GET /api/layouts`

Returns all org layouts with `status: "active"`, ordered by `updatedAt` desc.

**Auth**: session cookie (orgId from session)
**Response**: `ICompositeLayout[]`

---

### `POST /api/layouts`

Creates a new composite layout.

**Body (Zod validated):**

```typescript
{
  name: string;          // min 1, max 200
  resolution?: { width: number; height: number }; // default 1920x1080
  zones?: LayoutZone[];  // default []
  backgroundImage?: string; // valid URL or empty string
}
```

**Response**: `ICompositeLayout` (201)

---

### `GET /api/layouts/:id`

Returns one layout by ID (org isolation).

**Response**: `ICompositeLayout` | 404

---

### `PATCH /api/layouts/:id`

Updates layout fields (partial update using `$set`).

**Body (Zod validated):**

```typescript
{
  name?: string;
  status?: "active" | "suspended";
  resolution?: { width: number; height: number };
  zones?: LayoutZone[];
  backgroundImage?: string; // valid URL or empty string
}
```

**Response**: updated `ICompositeLayout` | 404

---

### `DELETE /api/layouts/:id`

Deletes the layout.

**Response**: `{ ok: true }` | 404

---

### `GET /api/layouts/:id/assigned-count`

Returns how many other layouts reference this layout through nesting.
Used to decide whether to show the PropagationWarningModal.

**Response**: `{ count: number }`

---

### `GET /api/player/layout` (public)

Endpoint for player runtime. Authenticated with screen token (not CMS session).

**Query params**: `screenId`, `token`
**Required cookie**: `ciao_player_session` (obtained via `POST /api/player/session/claim`)
**Response**: full layout with zones and zone content

---

## 5. User flow (editor)

```
1. Open editor
   ├── New: empty editor, name=""
   └── Existing: fetch layout from DB -> populate state

2. Draw zones
   └── Mousedown on canvas + drag -> ghost rect -> mouseup -> onZoneAdd()
       Each zone has: id (uuid), x%, y%, w%, h%

3. Select zone (click)
   └── Inspector panel is populated with: name, background, position, content

4. Rename zone
   └── "Zone name" input in panel -> handleZoneLabelChange()

5. Zone background
   └── URL input in panel -> handleZoneBackgroundImageChange()
       Thumbnail preview in panel. Canvas updates immediately (live).

6. Assign content
   └── "+ Assign content" button -> opens ZoneContentPicker
       Selection -> handleContentAssign() -> zone updated

7. Global layout background (when no zone is selected)
   └── URL input in panel -> handleLayoutBackgroundImageChange()
       Rendered as canvas background-image.

8. Delete zone
   └── "Delete zone" button -> deleteZoneId set
       Confirmation modal -> handleDeleteZoneConfirm()

9. Save
   ├── If new: POST /api/layouts -> redirect /layouts/{id}
   ├── If existing + usageCount > 0: PropagationWarningModal -> PATCH
   └── If existing + usageCount = 0: direct PATCH

10. Delete layout (top toolbar)
    └── window.confirm() -> DELETE /api/layouts/{id} -> redirect /layouts
```

---

## 6. Anti-loop and nesting rules

**Depth limit**: max 3 levels (A -> B -> C; not A -> B -> C -> D)

**Loop detection**: performed in ZoneContentPicker when selecting zone content:

1. The editor loads the full org layout graph (via `GET /api/layouts`)
2. For each candidate, it traverses the graph to detect a cycle or max depth violation
3. Problematic layouts are shown grayed out (disabled)
4. Tooltip: `"Loop detected"` or `"Maximum depth reached"`

**Loop example:**

```
Layout A: zone 1 -> Layout B
Layout B: zone 1 -> ???
  -> Layout A is grayed out (would cause A -> B -> A)
```

**Constant:** `MAX_NESTING_DEPTH = 3` in `ZoneContentPicker.tsx`

---

## 7. Background system (backgroundImage)

The `backgroundImage` field (URL string) exists at two levels:

### Layout level (global canvas)

- Persisted in `ICompositeLayout.backgroundImage`
- In editor: shown as `background-image: url(...) center/cover` on canvas
- Purpose: visual design reference (for example, screenshot of physical screen)
- In player: can be used as fallback when no content is rendering

### Zone level

- Persisted in `LayoutZone.backgroundImage`
- In editor: shown as CSS cover `background-image` on the specific zone
- Zone label uses semi-opaque white background for readability
- In player: used as visual fallback for the zone before content rendering

**API validation**: `z.string().url().optional().or(z.literal(""))` - valid URL or empty string (to clear value)

---

## 8. Propagation warning

When saving a layout already assigned to screens or groups:

1. `GET /api/layouts/{id}/assigned-count` on mount -> `usageCount`
2. On `handleSave()`: if `!isNew && usageCount > 0` -> `setShowPropagationWarning(true)`, state -> `confirming_propagation`
3. User sees PropagationWarningModal with impacted screen count
4. "Save and propagate" -> `performSave()` -> normal PATCH
5. "Cancel" -> state returns to `dirty`, no changes

**Note**: propagation is immediate (no queue). The player receives updated layout on next polling cycle.

---

## 9. Player integration

The player uses `GET /api/player/layout` to load the composite layout assigned to the screen. The endpoint is public but requires `screenId` + `token` and `ciao_player_session` cookie lock.

To start a player session, runtime first calls `POST /api/player/session/claim`:

- if no active lock exists, session is granted and HttpOnly cookie is issued;
- if the monitor is already active in another browser, API returns `409 SESSION_LOCKED`.

**Player rendering:**

- Each zone is rendered as an absolutely positioned `<div>` with percentage coordinates
- Zone content is rendered inside that zone container
- If `zone.backgroundImage` exists, player shows it as zone background until content is ready
- If `layout.backgroundImage` exists, player shows it as canvas background

---

## 10. Acceptance criteria and status

| ID | Criterion | Status |
|---|---|---|
| AC-01 | Create layout with drag-resize zones in canvas | ✅ |
| AC-02 | Each zone can host different content types | ✅ |
| AC-03 | Loop-causing layouts are grayed out | ✅ |
| AC-04 | Nesting stops at 3 levels | ✅ |
| AC-05 | Editing shared layout shows impacted screens warning | ✅ |
| AC-06 | Saved layout is available as CMS content | ✅ |
| AC-07 | Rename zone from inspector panel | ✅ |
| AC-08 | Delete zone with confirmation modal | ✅ |
| AC-09 | Background image for layout (global canvas) | ✅ |
| AC-10 | Background image for single zone | ✅ |
| AC-11 | Background thumbnail preview in panel | ✅ |
| AC-12 | Zones visually white and readable in editor | ✅ |

---

## 11. TODO / Future developments

- [ ] **Background image upload**: replace URL input with asset uploader (CDN integration)
- [ ] **Full layout preview**: preview mode "as seen by player" (fullscreen)
- [ ] **Snap to grid**: add optional snap-to-grid for zone alignment
- [ ] **z-index zones**: support z-index ordering for overlapping zones
- [ ] **Duplicate zone**: add duplicate action for existing zone
- [ ] **Undo/Redo**: editing history in canvas
- [ ] **Import background from assets**: asset library browser for selecting background image
- [ ] **Player fallback behavior**: document and implement behavior when `backgroundImage` is present but content is not loaded yet
- [ ] **Preset templates**: starter layouts (for example "split 50/50", "PiP", "ticker bottom")
