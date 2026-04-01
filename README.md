# Ciao Digital Signage

Digital Signage platform for managing screens, content, playlists, schedules,
and webapp-based integrations.

## Project Status

Active development. Public documentation is intentionally focused on stable,
contributor-safe information.

## Features

- Multi-tenant CMS workflows for screens, content, playlists, and schedules.
- Browser-based player runtime with realtime updates.
- Webapp connector model with SDK-oriented integration patterns.
- Test coverage across unit and end-to-end flows.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- MongoDB + Mongoose
- Socket.IO
- Playwright + Vitest

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- A MongoDB instance reachable from local environment

### Install

```bash
npm ci
```

### Run

```bash
npm run dev
```

Open [http://localhost:3100](http://localhost:3100).

### Seed Sample Users

The repository includes a contributor-safe sample user seed for local testing:

```bash
npm run seed:users
```

Recommended workflow:

- Copy values from [TEST-USERS.env.example](TEST-USERS.env.example) into your private [TEST-USERS.env.local](TEST-USERS.env.local) or `.env.local`.
- `TEST-USERS.env.local` is intended for your personal seeded local users and is gitignored.
- Set explicit sample passwords for predictable local logins.
- Use `SEED_ALLOW_PLACEHOLDER_PASSWORDS=true` only for disposable local setups where generated passwords are acceptable.
- Do not use the sample seed or sample credentials for shared, staging, or production environments.

### Local Port Convention

- Default app port is 3100.
- Override with `PORT=<your-port>` when needed.

## Quality Checks

```bash
npm run typecheck
npm run lint
npm run test
```

## Documentation

- Repository structure: [docs/REPO-STRUCTURE.md](docs/REPO-STRUCTURE.md)
- Public roadmap: [ROADMAP.md](ROADMAP.md)
- Public milestones: [MILESTONES.md](docs/governance/MILESTONES.md)
- Versioning strategy: [VERSIONING.md](docs/governance/VERSIONING.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Community guidelines: [COMMUNITY.md](docs/governance/COMMUNITY.md)
- License policy: [LICENSE-POLICY.md](docs/governance/LICENSE-POLICY.md)
- Communication handoff brief: [docs/COMMUNICATION-HANDOFF.md](docs/COMMUNICATION-HANDOFF.md)
- Agent guidance: [AGENTS.md](AGENTS.md)

## Licensing

This repository uses PolyForm Noncommercial 1.0.0.

- Non-commercial use is permitted by default.
- Commercial use requires a separate commercial agreement.

Read full terms in [LICENSE](LICENSE) and policy details in [docs/governance/LICENSE-POLICY.md](docs/governance/LICENSE-POLICY.md).

## Public Repo Notes

- Internal runbooks, private deployment details, and granular execution plans
  are intentionally excluded from the public release process.
- Never commit credentials, tokens, private host information, or customer data.
