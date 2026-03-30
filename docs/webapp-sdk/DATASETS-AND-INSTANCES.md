# WebApp SDK Dataset And Instance Architecture

## Objective

Standardize a second first-class concept in the sandboxed WebApp SDK:

- app type: what a webapp package is
- dataset: reusable app-scoped data resource owned by one webapp type
- instance: one presentation/runtime configuration that renders or interacts with one or more datasets

This document defines the target architecture for a documentation-first refactor. It does not require immediate runtime implementation.

## Implementation Progress (In Itinere)

Last update: 2026-03-18

Completed in code:

- Added first-class SDK dataset model: `webapp_datasets`
- Added first-class dataset binding model: `webapp_dataset_bindings`
- Added SDK dataset service layer for list/detail/create/update/delete/validate
- Added app-adapter behavior:
  - Google Calendar datasets resolved from `webapp_calendar_sources`
  - Queue datasets managed in SDK collection + runtime state linked by dataset
  - WordpressLink datasets managed via `webapp_datasets`
- Added API routes:
  - `GET/POST /api/webapps/datasets?appId=...`
  - `GET/PATCH/DELETE /api/webapps/datasets/[datasetId]?appId=...`
  - `POST /api/webapps/datasets/[datasetId]/validate?appId=...`
- Added CMS workspace tab model for `/webapps/[appId]`:
  - `Istanze`
  - `Dataset`
- Added CMS dataset list with validate and delete actions plus SDK create flow
- Added instance binding API and UI:
  - `GET/PATCH /api/webapps/instances/[instanceId]/datasets`
  - instance config panel includes dedicated `Dataset` tab with role-based bindings
- Added dedicated CMS dataset routes:
  - `/webapps/[appId]/datasets`
  - `/webapps/[appId]/datasets/[datasetId]`
  - dataset detail includes JSON config edit, validate and delete flows
- Added common SDK host sandbox contract for existing apps:
  - `lib/sdk/webapp-host.service.ts`
  - manager mode (`app` vs `sdk`) and custom configurator identity
  - binding capability and allowed role matrix
- Added automated coverage:
  - unit test for host sandbox contract
  - E2E dataset flow tests for Google Calendar, Queue, WordpressLink
- Added custom dataset editor baseline in CMS dataset detail popup:
  - Google Calendar: source fields editor + standard SDK actions
  - Queue: queue policy editor (name/type/service/limits) + standard SDK actions
  - WordpressLink: source editor baseline (source/auth/url/paging) + standard SDK actions

Current limitations intentionally kept for compatibility:

- Google Calendar dataset creation remains on app-specific pages; the generic SDK workspace links to that manager.
- Generic fallback dataset editor is available (raw JSON toggle), but schema-driven (`@rjsf`) and advanced tree editor (`jsoneditor`) are not yet wired.

Queue backend note (2026-03-18):

- queue instance identity is now dataset-first (`settings.datasetId`)
- kiosk queue routing uses `settings.kioskDatasetIds`
- `webapp_queue_data` runtime state is keyed by `datasetId` (with `queueName` retained as display/channel metadata)

WordPress Link dataset auto-creation (2026-03-18):

- `createWordpressLinkConnector()` now auto-creates a `WebAppDataset` with `storageMode: "remote-mirror"` and `datasetKind: "wordpress-catalog"`
- A `WebAppDatasetBinding` (`role: "primary"`, `required: true`) is auto-created linking instance → dataset
- `fetchWordpressLinkCatalog()` persists a snapshot of catalog items in `dataset.config.cachedItems` after successful remote fetch
- On remote fetch failure, the cached snapshot is served as fallback (fire-and-forget pattern for write, sync read for fallback)

Formal requirement-to-implementation report: `DATASET-SANDBOXED-IMPLEMENTATION-REPORT.md`.

## Why The Current Model Is No Longer Enough

The current SDK models `webapp_instances` well, but dataset-like resources are inconsistent across apps:

- Queue already has shared state independent from instances in `webapp_queue_data`
- Google Calendar already has tenant-scoped reusable sources in `webapp_calendar_sources`
- Wordpress Link currently mixes remote source definition, mapping, visual template, and player behavior inside one instance config

This creates three different patterns for the same functional need: reusable data sources isolated per app and per org.

## Core Design Principle

Every sandboxed webapp can optionally expose two independent management surfaces:

1. Instance management
2. Dataset management

Instances and datasets must be separated because they evolve at different speeds and have different responsibilities.

### Dataset Responsibility

A dataset owns:

- backend/source configuration
- cached or mirrored data owned by the app
- validation and sync rules
- schema and integrity rules
- app-specific editing UX

### Instance Responsibility

An instance owns:

- rendering mode
- presentation theme
- interaction mode
- layout/view configuration
- dataset bindings used by that instance

## Proposed Domain Model

### 1. App Type

Static package-level definition from registry/manifest.

Owns:

- metadata
- supported display modes
- supported dataset kinds
- custom editors availability
- capabilities

### 2. Dataset

Tenant-scoped reusable resource owned by one app type.

Examples:

- Google Calendar dataset: ICS URL, ICS upload, Google private feed
- Queue dataset: queue definition and operational shared state
- Wordpress Link dataset: remote catalog source plus optional local mirror and fallback payload

### 3. Instance

Tenant-scoped deployable surface that renders or controls datasets.

Examples:

- Queue remote panel instance
- Queue display board instance
- Google Calendar board instance
- Wordpress catalog grid instance
- Wordpress kiosk instance

### 4. Binding

Join between instance and dataset.

One instance can bind:

- one primary dataset
- multiple datasets
- fallback datasets
- overlay datasets

One dataset can be reused by:

- many instances of the same app

Cross-app reuse is explicitly forbidden. Datasets are sandboxed per `appId`.

## Shared Platform Collections

### webapp_datasets

Platform truth for dataset identity and metadata.

Suggested fields:

- datasetId
- orgId
- appId
- name
- slug
- status
- schemaVersion
- datasetKind
- editorMode
- storageMode
- config
- summary
- tags
- createdBy
- updatedBy
- createdAt
- updatedAt

Notes:

- `config` contains validated dataset configuration, not runtime cache blobs unless the dataset is intentionally inline
- `summary` is lightweight status for CMS cards and selectors

### webapp_dataset_bindings

Join table between instances and datasets.

Suggested fields:

- bindingId
- orgId
- appId
- instanceId
- datasetId
- role
- order
- required
- createdAt
- updatedAt

Recommended roles:

- `primary`
- `secondary`
- `fallback`
- `overlay`

## App-Scoped Data Storage

`webapp_datasets` should not force all payloads into one generic document shape.

Use this rule:

- platform identity and metadata live in shared collections
- app-owned payloads or mirrors stay app-scoped

Allowed storage strategies per dataset:

1. `inline`

- payload stays in `webapp_datasets.config`
- use only for small documents

1. `asset-ref`

- payload stored as internal webapp asset
- dataset references asset or content id

1. `app-collection`

- payload stored in `webapp_<appId>_*`
- dataset metadata points to the app-owned data

1. `remote-mirror`

- source is remote
- app maintains local normalized mirror/cache

This preserves platform governance without flattening domain-specific data.

## Manifest And Registry Extension

The runtime registry and `webapp.manifest.json` should expose dataset capabilities explicitly.

### New Manifest Section

```json
{
  "capabilities": {
    "instances": true,
    "datasets": true,
    "multiDatasetBinding": false,
    "customDatasetEditor": true,
    "localMirror": true
  },
  "datasets": {
    "supportedKinds": ["ics-url", "ics-upload", "google-private"],
    "bindingRoles": ["primary", "fallback"],
    "defaultBindingMode": "single",
    "editor": {
      "type": "react-component",
      "componentId": "google-calendar.dataset-editor"
    },
    "fallbackEditor": {
      "type": "json-schema"
    }
  }
}
```

### New Registry Concerns

`lib/sdk/webapp-registry.ts` should eventually expose:

- `hasDatasets`
- `datasetBindingMode`
- `datasetRoles`
- `hasCustomDatasetEditor`
- `datasetSchema`
- `datasetSummaryFields`

The current `configSchema` remains instance-focused and should not be overloaded with dataset editing concerns.

## CMS Navigation Contract

The catalog flow should become:

```text
/webapps
/webapps/[appId]
/webapps/[appId]/instances/new
/webapps/[appId]/datasets
/webapps/[appId]/datasets/new
/webapps/[appId]/datasets/[datasetId]
```

### Recommended UX

`/webapps/[appId]` becomes the app workspace with two top-level sections:

- Istanze
- Dataset

Dataset section should support:

- list
- create
- duplicate
- delete
- validate
- inspect usage

Instance section should support:

- list
- create
- configure presentation
- assign datasets
- open player

### Dataset Detail UX

Each dataset detail should expose four standard tabs:

- `Configurazione`
- `Dati`
- `Validazione`
- `Utilizzi`

`Configurazione` is app-specific.

`Dati` shows the current payload or mirror summary.

`Validazione` shows schema validation, sync errors, integrity checks, and health.

`Utilizzi` shows which instances reference the dataset.

## Generic Fallback Editor

If a webapp does not implement a custom dataset editor, the SDK should provide a generic dataset workbench.

### Fallback Behavior

1. If the app exposes JSON Schema, render a schema-driven form first.
2. If the app exposes only raw structured JSON, render a tree/code editor.
3. Always expose validation state and raw JSON view.

### Recommended Library Stack

Primary recommendation for schema-driven editing:

- `@rjsf/core`
- `@rjsf/validator-ajv8`

Why:

- actively maintained
- built for JSON Schema driven forms
- strong validation path
- supports theming and a `shadcn` package upstream

Primary recommendation for raw JSON fallback:

- `jsoneditor`

Why:

- actively maintained
- tree mode and code mode
- format, repair, search, duplicate, move
- built-in JSON Schema validation via Ajv

Useful lightweight inspector, not primary editor choice:

- `@uiw/react-json-view`

Why not as the main fallback editor:

- excellent as interactive viewer/inspector
- editing support exists, but current v2 line is still presented as evolving
- better fit for preview panels than as the canonical CMS editor

Rejected candidates for this project phase:

- `react-json-editor-ajrm`: archived and deprecated
- `react-json-view` (mac-s-g): explicitly no longer maintained
- `alibaba/lowcode-engine`: far too large for this need and introduces a second platform inside the CMS

## Validation Contract

Every dataset should support a common validation envelope:

- schema validity
- data validity
- source reachability
- sync health
- last successful validation
- last successful sync
- integrity checksum when applicable

Suggested response shape:

```ts
interface WebAppDatasetValidationResult {
  valid: boolean;
  schemaValid: boolean;
  dataValid: boolean;
  connectivityValid: boolean;
  checksum?: string;
  summary?: Record<string, unknown>;
  issues: Array<{
    severity: "error" | "warning" | "info";
    code: string;
    message: string;
    path?: string;
  }>;
  validatedAt: string;
}
```

## Sandboxing Rules

Datasets are private to one `appId` and one `orgId`.

Mandatory rules:

- no cross-app dataset references
- no cross-org dataset queries
- instance-to-dataset binding must validate `orgId` and `appId`
- public tokens must only resolve through instances, never directly through raw datasets
- dataset payload mutations must go through backend app-owned APIs

## How Existing Webapps Map To The New Model

### Queue

Current state:

- dataset is implicit in `queueName`
- shared runtime data lives in `webapp_queue_data`
- instance config mixes presentation and data identity

Target state:

- introduce Queue dataset as first-class entity
- dataset config owns `queueName`, numbering policy, booking policy, kiosk domain definition
- instance owns mode, theme, labels, layout and interaction surface
- shared queue runtime state remains app-scoped, but linked by `datasetId`

Expected gain:

- multiple queue instances can reuse one dataset without encoding identity in free text settings

### Google Calendar

Current state:

- reusable sources already exist in `webapp_calendar_sources`
- instance already supports `catalogSourceId`

Target state:

- promote `webapp_calendar_sources` to the common dataset concept or align it to `webapp_datasets`
- retain dataset kinds `ics-url`, `ics-upload`, `google-private`
- allow optional primary plus fallback source patterns later
- keep events cache/mirror app-scoped

Expected gain:

- Google Calendar becomes the reference implementation of dataset-aware webapp UX

### Wordpress Link

Current state:

- instance owns source definition, auth mode, field bindings, template and refresh
- remote dataset discovery exists via prefetch
- no reusable dataset abstraction yet

Target state:

- dataset owns remote endpoint, auth strategy, taxonomy scope, collection selection, local mirror policy, snapshot/fallback behavior
- instance owns view mode, template preset, visual theme, interaction model, and which dataset version to render
- support local snapshot publishing and fallback if the source site is offline

Expected gain:

- one WordPress dataset can feed multiple presentation instances
- offline or mirrored catalog behavior becomes explicit instead of improvised per instance

## Suggested Refactor Order

### Phase 0: Documentation And Contracts

- define shared terminology
- extend manifest spec
- extend registry types
- document CMS routing and UX

### Phase 1: Platform Data Layer

- add `webapp_datasets`
- add `webapp_dataset_bindings`
- add SDK service layer for CRUD, validation, and usage queries

### Phase 2: CMS Workspace

- convert `/webapps/[appId]` into workspace with `Istanze` and `Dataset`
- add dataset list/detail/new routes
- add generic dataset workbench

### Phase 3: Google Calendar Migration

- align current sources manager to the shared dataset workspace contract
- keep existing storage with compatibility adapter first

### Phase 4: Queue Migration

- formalize queue dataset entity
- migrate instances from `queueName` identity to `datasetId`
- keep compatibility alias during transition

### Phase 5: Wordpress Link Migration

- split dataset configuration from presentation configuration
- introduce local mirror and snapshot lifecycle
- move dataset discovery/prefetch into dataset editor

## Migration Strategy

Use compatibility adapters instead of breaking changes.

Recommended approach:

1. Add dataset abstractions alongside current instance model.
2. Backfill dataset records from existing app-specific structures.
3. Write instances with both legacy reference and new `datasetId` during migration.
4. Switch UI to dataset-first management.
5. Remove legacy-only pathways after all webapps are migrated.

## Non-Goals For This Phase

- building the final runtime APIs
- changing player token behavior
- implementing app-specific dataset editors
- migrating all existing persisted records immediately

## Deliverables For The Next Implementation Phase

- SDK types for dataset capability contracts
- platform dataset service and API routes
- CMS app workspace with dataset section
- generic dataset workbench
- Google Calendar as first migrated app
- Queue compatibility refactor
- Wordpress Link dataset/presentation split
