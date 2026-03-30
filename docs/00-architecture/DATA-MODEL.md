# Ciao Data Model

> **Status**: ✅ COMPLETE  
> **Implementation**: 100%  
> **Last Updated**: 2026-03-18  
> **Coverage**: Core platform + Webapp SDK (3 apps: google-calendar, queue, wordpress-link)

## Collections Reference

### Core Platform (Phases 1-7)

#### `users`

User accounts (global, cross-org).

```typescript
interface IUser {
  _id: ObjectId;
  email: string; // unique, lowercase
  name: string;
  image?: string;
  emailVerified?: Date; // null = unverified
  password?: string; // bcrypt if local auth
  createdAt: Date;
  updatedAt: Date;
}
```

#### `organizations`

Tenant metadata.

```typescript
interface IOrganization {
  _id: ObjectId;
  name: string;
  slug: string; // unique, lowercase
  description?: string;
  logo?: string;
  settings: {
    timezone: string; // e.g., "Europe/Rome"
    maxScreens?: number;
    maxStorageBytes?: number;
    theme?: "light" | "dark";
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy: ObjectId; // user._id
}
```

#### `members`

User → Org membership + roles.

```typescript
interface IMember {
  _id: ObjectId;
  userId: ObjectId;
  orgId: ObjectId;
  role: "super-admin" | "admin" | "member" | "viewer";
  invitedAt: Date;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

#### `screens`

Physical display devices.

```typescript
interface IScreen {
  _id: ObjectId;
  orgId: ObjectId; // tenant isolation
  name: string;
  code?: string; // alphanumeric, unique per org (for pairing)
  groupId?: ObjectId; // reference to groups collection
  status: "active" | "suspended" | "pairing";
  token?: string; // cryptographic token for Socket.IO auth
  lastSeenAt?: Date; // last heartbeat
  location?: string;
  settings?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: ObjectId; // user._id
}
```

#### `groups`

Screen grouping for bulk scheduling.

```typescript
interface IGroup {
  _id: ObjectId;
  orgId: ObjectId;
  name: string;
  description?: string;
  screenIds: ObjectId[]; // refs to screens._id
  createdAt: Date;
  updatedAt: Date;
  createdBy?: ObjectId;
}
```

#### `content`

Media items in library.

```typescript
type ContentType = "image" | "video" | "url" | "widget";
type UrlSubtype = "youtube" | "video" | "image" | "pdf" | "webpage";
type WidgetType = "weather" | "rss" | "datetime";

interface IContentItem {
  _id: ObjectId;
  orgId: ObjectId;
  name: string;
  alias?: string;
  status: "active" | "suspended";
  type: ContentType;
  folder: string; // e.g., "/connectors/google-calendar"
  tags: string[]; // searchable, e.g., ["webapp", "connector"]
  defaultDurationMs: number; // fallback display time
  thumbnailUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  config: {
    fileUrl?: string; // HTTP URL or local path
    mimeType?: string; // e.g., "image/png"
    fileSizeBytes?: number;
    url?: string; // for type="url"
    urlSubtype?: UrlSubtype; // "youtube", "pdf", "webpage"
    html?: string; // for type="widget" custom HTML
    widgetType?: WidgetType;
    params?: Record<string, unknown>; // widget config
  };
}
```

#### `playlists`

Content sequences + assignment tracking.

```typescript
interface IPlaylist {
  _id: ObjectId;
  orgId: ObjectId;
  name: string;
  description?: string;
  status: "active" | "suspended";
  itemIds: ObjectId[]; // refs to content._id, ordered
  assignments: {
    screenIds: ObjectId[];
    groupIds: ObjectId[];
    org: boolean; // org-wide default
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy?: ObjectId;
}
```

#### `schedules`

Time-based item assignments (screen, content, time window).

```typescript
type ScheduleType = "fixed" | "recurring";
type RecurringPattern = "daily" | "weekdays" | "weekends" | "weekly" | "monthly";

interface ISchedule {
  _id: ObjectId;
  orgId: ObjectId;
  screenId?: ObjectId; // OR
  groupId?: ObjectId; // one of these
  itemId: ObjectId; // ref to content._id
  playlistId?: ObjectId; // optional, full playlist override
  
  type: ScheduleType;
  
  startDate: Date; // schedule becomes active
  endDate?: Date; // optional end date
  
  startTime: string; // "HH:mm" UTC
  endTime: string; // "HH:mm" UTC
  
  // For type="recurring"
  pattern?: RecurringPattern;
  daysOfWeek?: number[]; // [0(sun), 1(mon), ...] if weekly
  
  priority: number; // higher = overrides lower priority
  duration?: number; // custom duration, overrides content default
  
  status: "active" | "suspended";
  createdAt: Date;
  updatedAt: Date;
  createdBy?: ObjectId;
}
```

#### `contentTypes` (metadata only)

Widget type configurations.

```typescript
interface IContentType {
  _id: ObjectId;
  type: "weather" | "rss" | "datetime";
  configSchema: Record<string, unknown>; // JSON schema for form rendering
  description: string;
}
```

#### `composite_layouts`

Layout compositi a zone per rendering multi-area su schermo.

```typescript
type ZoneContentType = "playlist" | "content" | "layout";

interface ZoneContent {
  type: ZoneContentType;
  refId: ObjectId;   // ref a playlists._id, content._id o composite_layouts._id
  label: string;     // display name (denormalizzato per performance)
}

interface LayoutZone {
  id: string;            // UUID client-generated
  x: number;             // 0–100 (percent del canvas)
  y: number;             // 0–100 (percent del canvas)
  width: number;         // 1–100 (percent del canvas)
  height: number;        // 1–100 (percent del canvas)
  label?: string;        // nome zona rinominabile dall'utente
  content?: ZoneContent; // contenuto assegnato alla zona
  backgroundImage?: string; // URL immagine sfondo zona (fallback player + riferimento editor)
}

interface ICompositeLayout {
  _id: ObjectId;
  orgId: ObjectId;
  name: string;
  status: "active" | "suspended"; // default "active"
  resolution: { width: number; height: number }; // default 1920×1080
  zones: LayoutZone[];
  backgroundImage?: string; // URL immagine sfondo canvas globale
  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes:**

```javascript
db.compositelayouts.createIndex({ orgId: 1 });
db.compositelayouts.createIndex({ orgId: 1, _id: 1 });
db.compositelayouts.createIndex({ orgId: 1, status: 1 });
```

**Note:**

- Coordinate zone in percentuale → resolution-agnostic, compatibile con qualsiasi risoluzione player
- Nesting supportato: una zona può referenziare un altro `composite_layout` (type: "layout")
- Max profondità nesting: 3 livelli (validato a frontend; da aggiungere validazione backend)
- Anti-loop: rilevato a frontend con traversal grafo; il backend non previene loop (tech debt da coprire)
- `backgroundImage` opzionale su layout e su ogni zona — persiste solo l'URL; upload asset gestito separatamente

---

### Real-Time State (In-Memory / Transient)

#### `screenStatus` (runtime map, not persisted)

Current screen connection state.

```typescript
interface ScreenRuntimeStatus {
  screenId: string; // ObjectId.toString()
  orgId: string;
  status: "initialize" | "online" | "offline" | "disconnected";
  substate?: "warning" | "error"; // for disconnected
  lastSeenAt: Date;
  manifestVersion?: number;
  currentItem?: { contentId: string; startedAt: Date };
  overrideStack: IOverride[];
}
```

#### `overrides` (transient, cleared on boot)

Active force-override commands.

```typescript
interface IOverride {
  _id: ObjectId;
  orgId: ObjectId;
  screenId?: ObjectId;
  groupId?: ObjectId;
  itemId: ObjectId; // ref to content._id
  command: "force-play" | "clear";
  issuedAt: Date;
  issuedBy?: ObjectId; // user._id
  expiresAt?: Date; // auto-clear if set
}
```

---

### Webapp Framework (Phase 8 — ✅ Delivered)

#### `webapp_instances`

Registered app instances per org.

```typescript
type WebAppId = "google-calendar" | "queue" | "wordpress-link";
type WebAppStatus = "active" | "suspended";

interface IWebAppInstance {
  _id: ObjectId;
  orgId: ObjectId;
  appId: WebAppId;
  name: string; // user-friendly label: "Cassa 1 Display"
  
  status: WebAppStatus;
  version: string; // e.g., "v0.1.0"
  
  configId: ObjectId; // ref to webapp_configs._id
  stateId: ObjectId; // ref to webapp_states._id
  contentId?: ObjectId; // ref to content._id (auto-created for player)
  
  publicToken: string; // randomUUID, used for public player access
  
  createdAt: Date;
  updatedAt: Date;
  createdBy?: ObjectId;
  updatedBy?: ObjectId;
}
```

#### `webapp_configs`

App-specific configuration per instance.

```typescript
interface GoogleCalendarSettings {
  mode: "public-ics" | "api-key";
  title?: string;
  calendarId?: string;
  publicIcsUrl?: string;
  timezone: string; // e.g., "Europe/Rome"
  refreshSeconds: number;
  maxItems: number;
  accentColor?: string;
}

interface QueueSettings {
  mode: "display" | "queue" | "remote" | "waiting-list" | "kiosk";
  queueName: string; // shared identifier across instances
  queueType: "numeric" | "alpha";
  prefix?: string; // "A" for alpha mode
  maxWaiting?: number;
  showWaitingCount?: boolean;
  accentColor?: string;
  // For kiosk mode
  kioskQueueNames?: string[];
  // For remote/round-robin mode
  serviceMode?: "reservation" | "round-robin";
  roundRobinMaxNumber?: number;
  bookingEnabled?: boolean;
  waitingListLimit?: number;
  refreshSeconds?: number;
}

type WordpressLinkSourceKind = "wordpress-posts" | "wordpress-custom" | "woocommerce-products";
type WordpressLinkAuthMode = "none" | "basic" | "woo-consumer";
type WordpressLinkViewMode = "grid" | "list" | "carousel";

interface WordpressLinkSettings {
  sourceKind: WordpressLinkSourceKind;
  authMode: WordpressLinkAuthMode;
  baseUrl: string;
  title: string;
  postType?: string;
  itemsPerPage: number;
  order: "asc" | "desc";
  orderby: string;
  refreshSeconds: number;
  viewMode: WordpressLinkViewMode;
  autoScrollMode: "none" | "ticker" | "paged" | "carousel";
  templatePreset: string;
  taxonomyFilters: { taxonomy: string; termIds: number[] }[];
  fieldBindings: {
    title: string;
    subtitle?: string;
    description?: string;
    image?: string;
    price?: string;
    chips?: string;
  };
  theme: {
    accentColor: string;
    cardStyle: "soft" | "outline" | "glass";
  };
}

type WebAppSettings = GoogleCalendarSettings | QueueSettings | WordpressLinkSettings;

interface IWebAppConfig {
  _id: ObjectId;
  orgId: ObjectId;
  appId: WebAppId;
  schemaVersion: number; // for migration
  
  settings: WebAppSettings; // discriminated union
  
  dataAccessMode?: string; // "public-ics", "api-key", "display-mode", etc.
  
  createdAt: Date;
  updatedAt: Date;
}
```

#### `webapp_states`

Runtime health + metrics per instance.

```typescript
interface IWebAppState {
  _id: ObjectId;
  orgId?: ObjectId;
  instanceId: ObjectId; // ref to webapp_instances._id
  
  health: "healthy" | "unknown" | "error";
  lastSyncAt?: Date;
  
  events?: unknown[]; // cached events (Google Calendar)
  error?: Error; // last error object
  
  customData?: Record<string, unknown>; // app-specific state
  
  createdAt: Date;
  updatedAt: Date;
}
```

#### `webapp_secrets_refs`

Encrypted API key references (NOT keys directly).

```typescript
interface IWebAppSecretRef {
  _id: ObjectId;
  orgId: ObjectId;
  instanceId: ObjectId; // ref to webapp_instances._id
  
  provider: string; // e.g., "google-calendar-api-key"
  secretKey: string; // encrypted or vaulted
  
  createdAt: Date;
  updatedAt: Date;
  rotatedAt?: Date;
}
```

#### `webapp_queue_data`

Shared queue state for Queue app (Eliminacode).

```typescript
interface QueueEntry {
  displayNumber: string;
  issuedAt: Date;
  issuedBy?: string; // instanceId
}

interface QueueHistoryEntry {
  displayNumber: string;
  servedAt: Date;
  servedBy?: string;
}

interface IWebAppQueueData {
  _id: ObjectId;
  orgId: ObjectId;
  
  queueName: string; // lowercase, trimmed (shared key)
  queueType: "numeric" | "alpha";
  prefix?: string;
  
  currentServing?: string; // current display number or null
  nextSeq: number; // monotonic counter
  
  waitingQueue: QueueEntry[]; // FIFO
  history: QueueHistoryEntry[]; // last N served
  
  lastUpdatedAt: Date;
  lastUpdatedBy?: string; // instanceId
  
  createdAt: Date;
  updatedAt: Date;
  
  // Index: unique({orgId, queueName})
}
```

#### `webapp_calendar_sources`

Reusable calendar data sources per org (Google Calendar app datasets).

```typescript
type GoogleCalendarSourceType = "ics-url" | "ics-upload" | "google-private";

interface IWebAppCalendarSource {
  _id: ObjectId;
  orgId: ObjectId;
  name: string;
  type: GoogleCalendarSourceType;
  status: "active" | "disabled";
  visibility: "org";
  timezone: string;
  refreshSeconds: number;
  icsUrl?: string;
  assetContentId?: ObjectId; // ref to content._id for uploaded ICS
  oauthRefId?: string;
  tags?: string[];
  lastSyncAt?: Date;
  lastError?: string;
  checksum?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Indexing Strategy

### Critical Indexes (Performance)

```javascript
// users
db.users.createIndex({ email: 1 }, { unique: true });

// organizations
db.organizations.createIndex({ orgId: 1 });
db.organizations.createIndex({ slug: 1 }, { unique: true });

// members (lookups by user or org)
db.members.createIndex({ userId: 1 });
db.members.createIndex({ orgId: 1 });
db.members.createIndex({ userId: 1, orgId: 1 }, { unique: true });

// screens
db.screens.createIndex({ orgId: 1 });
db.screens.createIndex({ code: 1, orgId: 1 }, { unique: true });

// groups
db.groups.createIndex({ orgId: 1 });

// content
db.content.createIndex({ orgId: 1 });
db.content.createIndex({ folder: 1, orgId: 1 });
db.content.createIndex({ tags: 1 });

// playlists
db.playlists.createIndex({ orgId: 1 });

// schedules
db.schedules.createIndex({ orgId: 1 });
db.schedules.createIndex({ screenId: 1, orgId: 1 });
db.schedules.createIndex({ groupId: 1, orgId: 1 });

// webapp_instances
db.webapp_instances.createIndex({ orgId: 1 });
db.webapp_instances.createIndex({ appId: 1, orgId: 1 });

// webapp_queue_data
db.webapp_queue_data.createIndex({ orgId: 1, queueName: 1 }, { unique: true });

// webapp_calendar_sources
db.webapp_calendar_sources.createIndex({ orgId: 1, status: 1 });
db.webapp_calendar_sources.createIndex({ orgId: 1, type: 1 });
```

---

## Tenant Isolation Patterns

**MANDATORY**: All queries include `orgId` filter.

```typescript
// CORRECT
const schedule = await ScheduleModel.findOne({
  _id: scheduleId,
  orgId: orgId, // ← always included
});

// WRONG (security hole)
const schedule = await ScheduleModel.findOne({ _id: scheduleId });
```

**Middleware**: `getOrgIdFromSession(req)` enforces org context.

---

## Migration Path (if needed)

Current schema is **v1** (stable). If adding fields:

1. Add field with default value (backward compatible)
2. Update `schemaVersion` on affected docs
3. Write migration script to backfill old docs
4. Test on staging first

Example: If adding `labels: string[]` to content:

```typescript
const result = await ContentModel.updateMany(
  { labels: { $exists: false } },
  { $set: { labels: [] } }
);
```

---

## Size Estimates (Example Org)

Assuming 10 screens, 50 content items, 20 schedules, 5 playlists:

- **Meta** (org, screens, groups, playlists): ~50 KB
- **Content documents**: ~500 KB (assuming 50 items × 10 KB metadata)
- **Schedules**: ~50 KB
- **Audit/logs**: ~100 KB (if added)
- **Total**: ~700 KB per org

*Storage for 100 orgs: ~70 MB. Comfortable for MongoDB free tier.*

---

## Backup Strategy

MongoDB Atlas automatic backups recommended. Custom:

```bash
# Weekly export
mongodump --uri="mongodb://..." --out /backups/ciao-$(date +%Y%m%d)
```

---

## Proposed Extensions (Phase 8+)

Questa sezione aggiunge i modelli dati consigliati per AI automation, multi-provider gateway, monetization analytics e live translation.

### `automation_jobs`

Job asincroni per task lunghi (gen media, publish batch, translate batch).

```typescript
type AutomationJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

interface IAutomationJob {
  _id: ObjectId;
  orgId: ObjectId;
  action: "media.generate" | "publish.plan" | "publish.apply" | "translate.batch" | "analytics.export";
  status: AutomationJobStatus;

  requestedBy: {
    actorType: "user" | "connector" | "system";
    actorId?: string;
  };

  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: { code: string; message: string; provider?: string };

  providerRoute?: {
    primary?: string;
    fallback?: string[];
    selected?: string;
  };

  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;
}
```

### `semantic_actions_catalog`

Libreria semantica di azioni backend richiamabili da chat/workflow/tooling.

```typescript
interface ISemanticAction {
  _id: ObjectId;
  orgId?: ObjectId; // null = global default action
  actionKey: string; // e.g. "publish.content.to.screen"
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requiredCapabilities: string[];
  confirmationRequired: boolean;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### `provider_routes`

Routing policy multi-provider per capability.

```typescript
interface IProviderRoute {
  _id: ObjectId;
  orgId: ObjectId;
  capability: "llm.chat" | "media.image" | "media.video" | "translate.text";
  providers: Array<{
    providerId: string;
    priority: number;
    enabled: boolean;
    timeoutMs: number;
    retryMax: number;
    circuitBreaker: { failureThreshold: number; coolDownMs: number };
  }>;
  createdAt: Date;
  updatedAt: Date;
}
```

### `playback_ledger`

Ledger append-only per monetizzazione e analytics screentime.

```typescript
interface IPlaybackLedgerEvent {
  _id: ObjectId;
  orgId: ObjectId;
  screenId: ObjectId;
  assetId?: ObjectId;
  playlistId?: ObjectId;
  contentType?: string;

  startedAt: Date;
  endedAt: Date;
  durationMs: number;

  renderContext?: {
    resolution?: string;
    playerVersion?: string;
    locale?: string;
  };

  tags?: string[];
  billingKey?: string;
  createdAt: Date;
}
```

### `translation_cache`

Cache live translation con invalidazione per versione contenuto.

```typescript
interface ITranslationCache {
  _id: ObjectId;
  orgId: ObjectId;
  sourceHash: string; // hash testo+versione
  sourceLocale: string;
  targetLocale: string;
  translatedText: string;
  providerId: string;
  model?: string;
  qualityScore?: number;
  createdAt: Date;
  expiresAt?: Date;
}
```

### `sandbox_policies`

Policy capability-based per webapp, connector e agent automation.

```typescript
interface ISandboxPolicy {
  _id: ObjectId;
  orgId: ObjectId;
  subjectType: "webapp-instance" | "connector" | "automation-agent";
  subjectId: string;
  capabilities: string[];
  status: "active" | "suspended";
  killSwitchEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Additional indexes (recommended)

```javascript
db.automation_jobs.createIndex({ orgId: 1, status: 1, createdAt: -1 });
db.semantic_actions_catalog.createIndex({ actionKey: 1, orgId: 1 }, { unique: true });
db.provider_routes.createIndex({ orgId: 1, capability: 1 }, { unique: true });
db.playback_ledger.createIndex({ orgId: 1, screenId: 1, startedAt: -1 });
db.playback_ledger.createIndex({ orgId: 1, assetId: 1, startedAt: -1 });
db.translation_cache.createIndex({ orgId: 1, sourceHash: 1, targetLocale: 1 }, { unique: true });
db.sandbox_policies.createIndex({ orgId: 1, subjectType: 1, subjectId: 1 }, { unique: true });
```

### Retention guidance

1. `automation_jobs`: 90-180 giorni (stato e audit operativo).
2. `playback_ledger`: retention lunga (billing/compliance), minimo 12 mesi.
3. `translation_cache`: 7-30 giorni (cache costo/latency).
4. `provider_routes` e `sandbox_policies`: retention completa con versioning change log.

---

**Last reviewed**: 2026-03-17  
**Next review**: 2026-04-14  
**Schema version**: 1
