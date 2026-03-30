# QueuePLUS

QueuePLUS is the sandboxed successor to Eliminacode.

## Intent

QueuePLUS exists to validate three things without destabilizing the legacy queue app:

- the WebApp SDK as a real platform for sandboxed apps with their own data service
- coexistence of two similar webapps (`queue` and `queue-plus`) in the same Ciao workspace
- a future-ready queue model that can evolve toward multi-queue remote control, multigate routing, audio orchestration, kiosk ticket strategies, and digital ticket delivery

## Current implementation scope

The first implementation intentionally keeps the visual baseline close to the existing queue webapp while changing the platform boundaries:

- separate `appId`: `queue-plus`
- separate runtime collection: `webapp_queue_plus_data`
- separate public APIs and player route
- separate CMS creation route and advanced configurator
- SDK-first dataset management
- remote support for switching among allowed queue datasets

## What stays isolated from legacy queue

- no changes to legacy queue routes
- no changes to legacy queue runtime collection
- no reuse of legacy queue instances or content URLs
- no mutation of legacy queue dataset records

## Why this matters

QueuePLUS is the safe place to test the SDK limits for powerful sandboxed apps backed by DB state. If QueuePLUS proves stable, the patterns can later inform a migration strategy or a side-by-side product evolution.
