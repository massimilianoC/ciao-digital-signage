# CMS App Catalog

## Overview

The CMS exposes a dedicated section at `/webapps` (menu item "Apps") that provides a full master-detail view of all registered webapp integrations.

## Navigation Structure

```
/webapps                      — Catalog grid: all registered app types
/webapps/[appId]              — App workspace with instance and dataset sections
/webapps/[appId]/instances/new — Create new instance form (app-specific)
/webapps/[appId]/datasets     — Dataset list for one app type
/webapps/[appId]/datasets/new — Create new dataset
```

## App Catalog Grid (/webapps)

Displays one card per registered app. Card shows:

- App name + icon
- Description
- Category badge (Produttività, Operazioni, …)
- Display mode tags (player, direct)
- Click → navigates to instance list

## App Workspace (/webapps/[appId])

Recommended target UX:

- Secondary navigation with `Istanze` and `Dataset`
- Shared app header with capabilities, help, and app-specific actions

## Instance List

Displays all instances for the current org and selected app type.

- Each row: name, status badge, instance ID, configure button, player link
- "Nuova istanza" button → navigates to the app-specific creation page
- "Configura" button → opens the WebappConfigPanel popup

Instances remain responsible for presentation and player exposure.

## Dataset List

Displays all datasets for the current org and selected app type.

- Each row: name, status, dataset kind, validation summary, usage count
- Actions: configure, duplicate, validate, delete
- Dataset detail should expose tabs for `Configurazione`, `Dati`, `Validazione`, and `Utilizzi`

Datasets remain sandboxed to the current `appId` and never appear as reusable assets for another app.

## Configuration Popup (WebappConfigPanel)

The popup opens on top of the instance list. It has two tabs:

### Tab 1: Configurazione (auto-form)

Auto-generated from `configSchema` in the webapp registry.
Fields are rendered based on their `type`:

- `text`, `url`, `secret`, `textarea` — text inputs
- `number` — number input
- `select` — dropdown
- `toggle` — checkbox
- `color` — color picker + hex display

Conditional fields (via `conditions`) are hidden/shown based on current values.

On "Salva", sends `PATCH /api/webapps/instances/[instanceId]` with updated settings.

### Tab 2: Avanzato (custom React component)

Each app can register a custom React component for advanced configuration.
Current implementations:

- `queue` → `QueueCustomConfig`: live queue preview + quick-control buttons
- `google-calendar` → informational placeholder (creation wizard handles advanced config)

Dataset editing should follow the same rule:

- custom React editor when the webapp provides one
- shared SDK fallback editor when it does not

## Adding a New App

1. Add entry to `lib/sdk/webapp-registry.ts` (configSchema + playerPath)
2. Create service in `lib/services/[appId]-connector.service.ts`
3. Create `POST /api/webapps/[appId]/route.ts` for instance creation
4. Create player UI components in `webapps/{app-id}/src/`
5. Create player page `app/webapps/[appId]/[instanceId]/page.tsx`
6. (Optional) Create `components/cms/webapps/[appId]/[AppId]CustomConfig.tsx` and register in `WebappConfigPanel.tsx`
7. If the app supports datasets, define its dataset contract and editor behavior
8. Document in `docs/webapps/[appId]/README.md`

## API Reference

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/webapps/catalog` | List registered apps |
| GET | `/api/webapps/instances?appId=X` | List instances for org |
| GET | `/api/webapps/instances/[id]` | Get instance detail + config |
| PATCH | `/api/webapps/instances/[id]` | Update settings / status |
| DELETE | `/api/webapps/instances/[id]` | Delete instance |
| GET | `/api/webapps/datasets?appId=X` | List datasets for org and app |
| GET | `/api/webapps/datasets/[id]` | Get dataset detail |
| PATCH | `/api/webapps/datasets/[id]` | Update dataset config / status |
| DELETE | `/api/webapps/datasets/[id]` | Delete dataset |
| POST | `/api/webapps/queue` | Create queue instance |
| POST | `/api/webapps/google-calendar` | Create Google Calendar instance |

For the detailed target architecture, see `DATASETS-AND-INSTANCES.md`.
