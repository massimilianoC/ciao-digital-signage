# Repository Structure

This repository is organized for fast navigation by both contributors and coding agents.

## Top-level Layout

- `app/`: Next.js App Router pages and route handlers.
- `components/`: UI and feature components (CMS/player/ui).
- `lib/`: domain services, db models, auth, scheduling, socket runtime.
- `scripts/`: developer and operations scripts (seed, reset, build packaging).
- `tests/` and `e2e/`: unit/integration and Playwright suites.
- `webapps/`: bundled webapp connectors and assets.
- `docs/`: architecture, governance, deployment and product docs.
- `infra/docker/`: Dockerfile and docker-compose variants.
- `src/edge/`: extracted edge/runtime glue modules (root shims delegate here).

## Root Files Kept Intentionally

Some files must remain in root for framework/tooling compatibility:

- `middleware.ts`: Next.js runtime entry point (delegates to `src/edge/auth-middleware.ts`).
- `next.config.ts`: Next.js loader expects root config.
- `tsconfig.json`: TypeScript project root config.
- `playwright.config.ts`: default Playwright discovery path.
- `vitest.config.ts`: default Vitest discovery path.
- `next-env.d.ts`: Next.js generated type definitions.

Keeping only these files in root makes the project clean without breaking standard tool behavior.

## Docker Commands

Use the docker files from `infra/docker/`:

- Dev services: `docker compose -f infra/docker/docker-compose.dev.yml up -d`
- Full local stack: `docker compose -f infra/docker/docker-compose.yml up -d`
- Production-like stack: `docker compose -f infra/docker/docker-compose.prod.yml up -d`

## Contributor Navigation Hints

- Start from `README.md` for project overview and governance docs.
- Use `docs/architecture/` for technical internals.
- Use `docs/REPO-STRUCTURE.md` as the quick map when onboarding.
