# Queue Domain Boundaries

## Queue domain owns

- Shared queue lifecycle and progression (`issue`, `advance`, `retreat`, `set`, `reset`)
- Service strategy (`reservation` and `round-robin`)
- Public display projection (current number, waiting list, display message/accent)
- Kiosk ticket emission for enabled queues

## Queue domain does not own

- Screen assignment and scheduling rules
- Playlist sequencing
- Player runtime orchestration
- Authentication/session lifecycle

## Configuration boundaries

- Queue app config lives in `webapp_configs.settings` (mode, queue policy, kiosk queue list)
- Queue runtime shared state lives in `webapp_queue_data`
- Player consumable state is exposed only via token-gated public API

## External package expectations

A distributable ZIP should include:

- `webapp.manifest.json`
- `db.setup.json`
- Frontend components scoped under `webapps/queue/src/`
- API handlers scoped under `app/api/public/webapps/queue/`
