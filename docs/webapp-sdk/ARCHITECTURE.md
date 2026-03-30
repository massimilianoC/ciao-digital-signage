# WebApp SDK Architecture

## Decision Summary

The optimal architecture is a hybrid platform:

1. A lightweight SDK for hosted web apps.
2. A standard backend connector layer for secure integrations.
3. A central persistence model with controlled extension points.

This is preferable to creating a separate database for every app by default.

## Why Not A Separate Database Per App By Default

A dedicated database per app sounds flexible, but it creates operational fragmentation:

- duplicated backup and retention policies
- weak governance across tenants
- inconsistent indexing and observability
- harder migrations
- harder AI-assisted scaffolding and maintenance

Use a dedicated external database only when the app has true domain complexity or transactional isolation requirements.

## Recommended Persistence Model

Default choice: keep web app metadata and most operational state inside the central Ciao MongoDB, using standardized collections and optional app-scoped namespaces.

### Standard Shared Collections

1. webapps_catalog

- One document per app type/template.
- Describes SDK package version, manifest capabilities, UI category, security profile.

1. webapp_instances

- One document per configured app instance.
- Bound to org/tenant and optionally screen/group/playlist usage.
- Stores configRef, deployment status, lifecycle state, version.

1. webapp_datasets

- One document per reusable tenant-scoped dataset owned by a specific app type.
- Stores dataset identity, configuration metadata, storage strategy, and summary state.
- Enables reuse across multiple instances of the same app without cross-app access.

1. webapp_configs

- Stores validated per-instance config.
- Example: calendarId, refreshSeconds, locale, theme variant.
- Must remain schema-driven and versioned.

1. webapp_state

- Stores ephemeral or recoverable state snapshots.
- Example: lastSyncAt, lastError, cache summary, watchdog health.
- TTL or rolling retention recommended where appropriate.

1. webapp_bindings

- Maps app instance to playlist, fixed asset, screen, group, org, or future layout slot.

1. webapp_dataset_bindings

- Maps app instances to one or more datasets with explicit binding roles.
- Supports `primary`, `secondary`, `fallback`, or `overlay` relationships.

1. webapp_secrets_refs

- Stores references to secrets, never raw secrets.
- Example: key vault secret id, token exchange policy id.

### Optional App-Scoped Collections In Central DB

For apps that need custom structured data, allow dedicated collections in the same DB, but under a naming convention:

- webapp_<appId>_records
- webapp_<appId>_cache
- webapp_<appId>_events

This provides flexibility without losing platform governance.

## When To Use An External Or Parallel Database

Use an external or dedicated app database only if one of these is true:

1. The app manages its own transactional business domain.
2. Data volume or write profile is very different from core Ciao workloads.
3. Legal or tenant isolation requires physical separation.
4. The third-party product already owns the source-of-truth database.

Even in this case, Ciao should still keep platform metadata in the central DB.

## Golden Rule

- Central DB keeps platform truth.
- External systems keep domain truth when needed.
- SDK apps never decide this ad hoc; they follow the storage tier chosen in the integration card.

## Suggested Document Standards

Each web app instance should support these standard concepts:

- identity
- config
- state
- health
- binding
- secret reference
- telemetry pointer

This standardization allows agents to scaffold apps predictably.

For the dataset-aware target architecture, see `DATASETS-AND-INSTANCES.md`.

## Local Mirror / Frontier Data Strategy

For integrations that need a local mirror or frontier tables, use this layered approach:

1. Source system remains authoritative.
2. Ciao connector syncs a normalized read model into central Mongo collections.
3. SDK app reads only the normalized read model or connector endpoint.
4. If writeback is needed, it goes through Ciao backend, never directly from app to third-party unless explicitly approved.

This is ideal for:

- train schedules
- queue counters
- calendar events
- booking availability snapshots

## Real-Time Channel Architecture

Webapps can use a shared Socket.IO namespace (`/webapp`) with sandboxed routing.

Core rules:

- all connections are scoped by `appId`, `instanceId`, and token;
- every subscription uses unique channel keys;
- channel ACL is enforced server-side;
- polling remains fallback, not primary sync driver.

Room model:

- `org:{orgId}:app:{appId}:instance:{instanceId}`
- `org:{orgId}:app:{appId}:channel:{channelKey}`

Channel key requirement:

- mandatory `instance:<instanceId>` key;
- optional domain keys such as `queue:<queueName>`.

For complete contract and implementation examples, see `REALTIME.md`.

## State Categories

Use these three state classes for every app:

1. Config state

- long-lived
- edited from CMS or provisioning flow

1. Runtime state

- current health, last refresh, last payload hash, interaction lock
- can be recomputed

1. Domain mirror state

- cached normalized business data used by app UI
- may be time-bounded and refreshed asynchronously

## AI-Friendly Storage Contract

Agents should always produce these schemas first:

- AppCatalogDocument
- WebAppInstanceDocument
- WebAppConfigDocument
- WebAppStateDocument
- SecretRefDocument

If custom collections are needed, agents should extend the model after these platform documents exist.

## Recommended Default For Google Calendar Pilot

Use central DB only.

- webapps_catalog: app type definition
- webapp_instances: tenant instance
- webapp_configs: calendarId, mode, timezone, refreshSeconds
- webapp_state: sync status, last fetch time, error state
- optional cached events collection: webapp_google_calendar_cache

Do not create a separate database for the Google Calendar pilot.
