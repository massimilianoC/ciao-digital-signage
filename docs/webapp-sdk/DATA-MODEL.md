# WebApp SDK Data Model

## Core Recommendation

Use one central MongoDB database for the Ciao platform, with:

- standardized shared collections for all web apps
- optional app-specific collections in the same database
- external databases only for exceptional cases

## Collection Set

### webapps_catalog

Purpose:

- register app templates and capabilities

Fields:

- appId
- name
- category
- hostingMode
- securityProfile
- sdkVersion
- supportedInteractionModes
- supportedBindingModes
- schemaVersion

### webapp_instances

Purpose:

- represent one tenant-configured app deployment

Fields:

- instanceId
- appId
- orgId
- tenantId
- status
- version
- configId
- stateId
- bindingIds
- createdBy
- updatedBy
- createdAt
- updatedAt

### webapp_datasets

Purpose:

- represent one reusable dataset owned by one app type and one org

Fields:

- datasetId
- appId
- orgId
- name
- slug
- status
- schemaVersion
- datasetKind
- editorMode
- storageMode
- config
- summary
- createdBy
- updatedBy
- createdAt
- updatedAt

### webapp_configs

Purpose:

- persist validated custom settings per app instance

Fields:

- configId
- instanceId
- schemaVersion
- settings
- uiProps
- refreshPolicy
- dataAccessMode

### webapp_state

Purpose:

- persist runtime and sync state

Fields:

- stateId
- instanceId
- health
- lastSyncAt
- lastSuccessAt
- lastError
- payloadHash
- watchdogStatus
- metrics

### webapp_bindings

Purpose:

- bind instance to player usage

Fields:

- bindingId
- instanceId
- bindingType
- targetType
- targetId
- playlistId
- fixedAssetId
- slotId
- priority

### webapp_dataset_bindings

Purpose:

- bind one instance to one or more app-scoped datasets

Fields:

- bindingId
- appId
- orgId
- instanceId
- datasetId
- role
- order
- required
- createdAt
- updatedAt

### webapp_secrets_refs

Purpose:

- reference external secrets safely

Fields:

- secretRefId
- instanceId
- provider
- secretKey
- tokenPolicy
- rotationPolicy

## Naming Convention For App-Specific Collections

If a web app needs custom records, use this convention:

- webapp_<appId>_cache
- webapp_<appId>_records
- webapp_<appId>_jobs
- webapp_<appId>_events

## What Agents Should Generate First

For any new integration, agents should generate in this order:

1. config schema
2. dataset document example if the app supports reusable data
3. instance document example
4. state document example
5. binding example
6. secret ref example
7. custom collection schema only if truly needed

## Anti-Patterns

Avoid these unless there is a justified exception:

- a new database per app by default
- storing raw third-party secrets in config documents
- letting frontend apps write directly into platform collections without backend validation
- unversioned free-form settings without schema metadata
- mixing dataset definition and presentation settings into one untyped instance blob when the app clearly supports reusable shared data

For the full target model and migration path, see `DATASETS-AND-INSTANCES.md`.
