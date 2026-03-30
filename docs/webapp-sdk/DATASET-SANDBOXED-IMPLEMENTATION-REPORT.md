# Dataset Sandboxed Implementation Report

Last update: 2026-03-18

## Scope

This report covers implementation status for sandboxed dataset management in webapps, including:

- common SDK host contract
- frontend manager and configurator expression in SDK
- app-specific porting for Google Calendar, Queue, WordpressLink
- automated test coverage strategy

## Requirements Analysis

### Requirement 1: sandboxed dataset model per app/org

Expected:

- no cross-app and no cross-org dataset leakage
- datasets and bindings are first-class and scoped

Implemented:

- shared collections:
  - `webapp_datasets`
  - `webapp_dataset_bindings`
- service layer validates app scope and org scope
- queue app remains app-managed projection with read-only behavior

Status: complete

### Requirement 2: frontend dataset manager with SDK-expressed configurator

Expected:

- each webapp declares dataset manager strategy
- UI can switch between app-managed and sdk-managed pathways

Implemented:

- common host contract service:
  - `lib/sdk/webapp-host.service.ts`
- contract includes:
  - manager mode (`app` or `sdk`)
  - frontend route
  - custom configurator identity
  - binding capability and allowed roles
- frontend list panel uses the contract to resolve behavior

Status: complete

### Requirement 3: core common service in host layer

Expected:

- one general service that hosts dataset capability contract for existing webapps

Implemented:

- `getWebappDatasetSandboxContract(appId)`
- `listWebappDatasetSandboxContracts()`
- centralized contract for:
  - Google Calendar
  - Queue
  - WordpressLink
- API and config panel now enforce capability through contract

Status: complete

### Requirement 4: porting existing webapps

Expected:

- common dataset management architecture applied to existing apps

Implemented:

1. Google Calendar

- datasets mapped to `webapp_calendar_sources`
- app-managed dataset route and manager path
- exposed through generic dataset API for listing/validation
- verified end-to-end via connector/player smoke (`e2e/google-calendar-connector.spec.ts`)

2. Queue (Eliminacode)

- datasets represented as app-managed shared-state projection
- read-only in generic dataset CRUD
- validation exposed through generic dataset endpoint

3. WordpressLink

- sdk-managed dataset CRUD via `webapp_datasets`
- instance binding to dataset through role-based binding API/UI

Status: complete

## Implementation Inventory

Core model and service:

- `lib/db/models/WebAppDataset.ts`
- `lib/db/models/WebAppDatasetBinding.ts`
- `lib/sdk/webapp-dataset.service.ts`
- `lib/sdk/webapp-host.service.ts`

API layer:

- `app/api/webapps/datasets/route.ts`
- `app/api/webapps/datasets/[datasetId]/route.ts`
- `app/api/webapps/datasets/[datasetId]/validate/route.ts`
- `app/api/webapps/instances/[instanceId]/datasets/route.ts`

CMS layer:

- `components/cms/webapps/WebappWorkspace.tsx`
- `components/cms/webapps/WebappDatasetList.tsx`
- `components/cms/webapps/WebappDatasetDetailPanel.tsx`
- `components/cms/webapps/WebappInstanceDatasetBindings.tsx`
- `components/cms/webapps/WebappConfigPanel.tsx`
- `app/(cms)/webapps/[appId]/datasets/page.tsx`
- `app/(cms)/webapps/[appId]/datasets/[datasetId]/page.tsx`

## Automated Test Strategy

### Unit tests

- `tests/services/webapp-host.service.test.ts`
  - verifies sandbox contract consistency for all 3 apps
  - verifies manager mode and configurator identity
  - verifies capability matrix (CRUD/binding/roles)

### E2E tests

- `e2e/webapps-datasets.spec.ts`
  - Google Calendar: create source -> list via generic dataset API -> validate
  - Queue: create instance -> verify readonly dataset projection -> validate
  - WordpressLink: create instance -> create dataset -> bind instance -> validate -> unbind -> delete

## Compliance Matrix

| Requirement | Status | Evidence |
|---|---|---|
| Sandboxed dataset model | complete | models + service + scoped API |
| SDK-expressed frontend manager/configurator | complete | host contract + CMS integration |
| Common host core service | complete | `webapp-host.service.ts` |
| Porting existing webapps | complete | calendar/queue/wordpress-link adapters |
| Tests for 3 existing webapps | implemented | e2e spec + unit contract tests |

## Phase Progress Snapshot

| Phase | Scope | Status |
|---|---|---|
| A | Data model (`webapp_datasets`, `webapp_dataset_bindings`) | complete |
| B | Common SDK services + host contract | complete |
| C | Dataset API + instance binding API | complete |
| D | CMS workspace, binding tab, dedicated dataset routes | complete |
| E | Porting for Calendar, Queue, WordpressLink | complete |
| F | Unit + E2E validation for 3 apps | complete |
| G | CI/pipeline hardening for dataset-sandbox flow | complete |

## Known Residual Risks

1. Generic dataset editor is JSON-first; schema-form and advanced tree editor integration remains a follow-up enhancement.

## Next Hardening Steps

1. Add schema-driven and tree-mode dataset editor fallback (`@rjsf` + `jsoneditor`).
2. Add visual UI smoke assertions for instance dataset binding tab flows.
3. Add observability metrics for dataset validation outcomes and binding mutations.

## Custom Dataset Editors (Baseline)

Dataset detail popup now supports app-specific custom editors with standard SDK actions (`Valida`, `Salva`, `Elimina`) for:

- Google Calendar
- Queue
- WordpressLink

Raw JSON fallback remains available in the same popup for advanced/manual edits.

## Queue Backend Migration (Completed)

Queue backend now uses explicit dataset identity:

- instance settings use `datasetId` and `kioskDatasetIds`
- queue runtime state is anchored by `webapp_queue_data.datasetId`
- queue control API accepts dataset-targeted control actions

Compatibility assumptions for this migration:

- no production data migration required
- database reset from zero accepted

## CI Integration

Dataset-sandbox verification is now codified as:

- workflow: `.github/workflows/dataset-sandbox.yml`
- script: `npm run pipeline:dataset-sandbox`
- e2e target: `npm run test:e2e:datasets`
