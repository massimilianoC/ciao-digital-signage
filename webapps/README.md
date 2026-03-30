# Webapps Package Root

This folder is the plugin-style root for webapp packages.

Each webapp subfolder is fully sandboxed and contains all app-proprietary assets:

```
webapps/{app-id}/
  webapp.manifest.json   # SDK-facing metadata (app id, modes, settings schema, entrypoints)
  db.setup.json          # Collection/index directives for setup/migration
  BOUNDARIES.md          # Domain boundary notes (optional)
  src/                   # Player runtime UI components ("use client")
  docs/                  # Per-app documentation (README, operations, config guides)
  fixtures/              # Test/sample data files (optional)
```

Framework infrastructure (CMS pages, API routes, services, models, SDK, socket handlers,
tests) remains in the standard Next.js project locations (`app/`, `lib/`, `components/cms/`,
`e2e/`, etc.) and is NOT duplicated inside webapp folders.

The runtime currently uses `lib/sdk/webapp-registry.ts` as source of truth.
These package files are the forward-compatible contract for external ZIP onboarding.
