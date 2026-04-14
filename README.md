# Ciao Signage — Your Own Personal TV

**Ciao Ciao** to proprietary players, expensive licenses, and Windows boxes
that freeze mid-presentation. **Hello** to a fully open, browser-native digital
signage platform you own, control, and extend — on any screen, in five minutes.

[![Version](https://img.shields.io/badge/version-0.2.1--alpha-blue)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0-lightgrey)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

---

## What Is Ciao Signage?

Point any Chrome browser at a URL. That screen is now yours — managed in
real-time from a web CMS, no software to install, no proprietary hardware,
no vendor lock-in. Welcome to **your own personal TV**.

Whether you run one screen in a café or a fleet of hundreds across multiple
locations, Ciao Signage gives you the same professional toolbox — completely
self-hostable, completely open.

**What you get out of the box:**

- 🖥️ **Multi-tenant CMS** — screens, content, playlists and schedules, each
  organisation sees only its own data.
- 📡 **Real-time player** — Socket.IO manifest delivery; change something in
  the CMS and every screen reacts instantly, no polling, no reload.
- 🔌 **Webapp SDK** — embed any interactive web app inside a screen zone via
  a lightweight SDK. Calendars, queues, dashboards, kiosk UIs — all schedulable
  like normal content. No native plugin required.
- 🧩 **Composite layouts** — split any screen into independent zones, each
  with its own content and schedule.
- 🔐 **Auth & roles** — super-admin, org-admin, and member roles out of the box
  (powered by [better-auth](https://www.better-auth.com/)).
- 🧪 **Test coverage** — unit tests (Vitest) and end-to-end flows (Playwright).

## Who Is It For?

| You are | Your situation | How Ciao helps |
|---------|---------------|----------------|
| **Digital artist** | 5 synced screens for an exhibition | Open a browser on each monitor, manage videos from the dashboard |
| **Small retail chain** | Menu boards at 3 locations need updating | Edit the layout once — prices update everywhere in real-time |
| **Installer / integrator** | Client wants live news in a shop window | Plug in an HDMI stick with a browser, point it at the player URL, done |
| **Event organiser** | Live programme info on lobby boards | Use the SDK to show today's agenda pulling from any data source |

## Project Status

**Alpha — active development.** Core CMS and player flows are working.
APIs and data models may change before the first stable release.
Contributions, issue reports, and feedback are very welcome.

## Built-In Webapp Connectors

Three production-ready connectors ship with the platform:

| Connector | What it does |
|-----------|-------------|
| **Google Calendar** | Display live calendar feeds on any screen zone |
| **Queue / Eliminacode** | Full queue management — display board, remote counter, kiosk ticket kiosk |
| **WordPress Link** | Pull and show content from any WordPress site via REST API |

All three are built on the open Webapp SDK. You can build and publish your own
using the same framework.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS 4 |
| Language | TypeScript |
| Database | MongoDB 7+ with Mongoose |
| Real-time | Socket.IO |
| Auth | better-auth |
| Testing | Vitest + Playwright |

---

## Deploy — Minimum Requirements

### System Requirements

| Requirement | Minimum |
|-------------|---------|
| Node.js | 20 LTS or later |
| npm | bundled with Node 20 |
| MongoDB | 7.0 or later |
| OS | Linux, macOS, or Windows (WSL2 recommended) |

### MongoDB Setup

Ciao requires MongoDB. Two paths are supported:

#### Option A — Local MongoDB (recommended for development)

Install MongoDB Community Edition 7+ and start it as a replica set
(required for multi-document transactions):

```bash
# macOS via Homebrew
brew tap mongodb/brew && brew install mongodb-community@7.0
brew services start mongodb-community@7.0
```

Then initialise a single-node replica set once:

```bash
mongosh --eval "rs.initiate()"
```

Use this connection string in `.env.local`:

```
MONGODB_URI=mongodb://localhost:27017/ciao?replicaSet=rs0
```

> **Why a replica set?** Ciao uses MongoDB multi-document transactions.
> Standalone mode does not support transactions; a single-node replica set
> does, with no extra hardware cost.

#### Option B — Docker (MongoDB bundled)

Start the full local stack (app + MongoDB + MailHog for email) with one command:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

The app is exposed on port **3000**, MongoDB on **27017**, and the MailHog
web UI on **8025**.

#### Option C — Remote MongoDB (Atlas or self-hosted)

Use any MongoDB 7+ instance reachable from your environment. Set the full
connection URI in `.env.local`:

```
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/ciao?retryWrites=true&w=majority
```

[MongoDB Atlas free tier](https://www.mongodb.com/atlas) (M0) works for
development and small deployments.

### Environment Variables

Copy the example file and fill in the required values:

```bash
cp env.example .env.local
```

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | ✅ | MongoDB connection string (see above) |
| `BETTER_AUTH_SECRET` | ✅ | Random 32+ character secret. Generate with `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | ✅ | Server-side base URL (e.g. `http://localhost:3100` locally) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Public-facing URL baked into the client bundle at build time |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | ❌ | SMTP settings for transactional email. Optional in development (MailHog can replace them) |

See [`env.example`](env.example) for the full reference with inline comments.

---

## Quick Start (Development)

### 1. Clone and Install

```bash
git clone https://github.com/massimilianoC/ciao-digital-signage.git
cd ciao-digital-signage
npm ci
```

### 2. Configure Environment

```bash
cp env.example .env.local
# Edit .env.local and set MONGODB_URI, BETTER_AUTH_SECRET, BETTER_AUTH_URL,
# and NEXT_PUBLIC_APP_URL (use http://localhost:3100 for local dev).
```

### 3. Start MongoDB

Follow **Option A** or **Option B** in the [Deploy](#deploy--minimum-requirements)
section above.

### 4. Seed Sample Users

```bash
npm run seed:users
```

See the [Local Quick Start appendix](#appendix-local-quick-start-alpha) for the
full seeding guide.

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3100](http://localhost:3100) and log in with the
credentials you set during seeding.

---

## Quality Checks

```bash
npm run typecheck   # TypeScript compilation check
npm run lint        # ESLint
npm run test        # Vitest unit tests
npm run test:e2e    # Playwright end-to-end tests
```

---

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
- Agent guidance: [AGENTS.md](AGENTS.md)

---

## Contributing

All contributions are welcome — bug reports, feature ideas, documentation
improvements, and code changes. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
before opening a pull request.

---

## Licensing — The One Million Rule

Ciao Signage is open-source, with a licensing model designed to protect the
community and the small players:

**Free for everyone** with annual revenue under **€1 million**:
schools, non-profits, freelancers, artists, small businesses, hobbyists.

**Commercial license required** for organisations above that threshold and
for system integrators who resell Ciao as part of larger deployments.

> The goal: a small shop, a school, or an independent artist can run their
> own personal TV at zero cost. We only ask for a commercial agreement from
> those who already have a solid business.

[Full terms](LICENSE) — [Licensing policy](docs/governance/LICENSE-POLICY.md)

---

## Security & Public Repo

- Never commit credentials, tokens, private host information, or customer data.
- Internal runbooks and private deployment details are intentionally excluded
  from the public release.
- See [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy.

---

## Ready to Go?

**Create your own personal TV — free.**  
Clone the repo, run `npm ci`, configure your `.env.local`, and you are live
in minutes. Have questions or ideas? Open an issue or start a discussion.

For large-scale commercial deployments, [reach out about a commercial licence](docs/governance/LICENSE-POLICY.md).

---

## Appendix: Local Quick Start (Alpha)

This appendix is a complete, self-contained guide for getting Ciao Signage
running locally from scratch. Especially useful for new contributors during
the current alpha phase.

### Prerequisites Checklist

- [ ] Node.js 20 LTS ([nodejs.org](https://nodejs.org))
- [ ] npm (comes with Node)
- [ ] MongoDB 7+ — local install **or** Docker **or** Atlas free tier
- [ ] `git`

### Step 1 — Clone the Repository

```bash
git clone https://github.com/massimilianoC/ciao-digital-signage.git
cd ciao-digital-signage
```

### Step 2 — Install Dependencies

```bash
npm ci
```

### Step 3 — Create Your Local Environment File

```bash
cp env.example .env.local
```

Open `.env.local` and set at minimum:

```env
MONGODB_URI=mongodb://localhost:27017/ciao?replicaSet=rs0
BETTER_AUTH_SECRET=<run: openssl rand -hex 32>
BETTER_AUTH_URL=http://localhost:3100
NEXT_PUBLIC_APP_URL=http://localhost:3100
```

### Step 4 — Start MongoDB

**Local install (macOS example):**

```bash
brew services start mongodb-community@7.0
# First time only — initialise the replica set:
mongosh --eval "rs.initiate()"
```

**Docker (no local MongoDB install needed):**

```bash
# Starts MongoDB only (no app container)
docker run -d --name ciao-mongo \
  -p 27017:27017 \
  mongo:8 --replSet rs0
# First time only — initialise the replica set:
docker exec ciao-mongo mongosh --eval "rs.initiate()"
```

### Step 5 — Set Up Seed Credentials

Copy the example credentials file to a private local copy (git-ignored):

```bash
cp TEST-USERS.env.example TEST-USERS.env.local
```

Edit `TEST-USERS.env.local` and replace the placeholder passwords with
values you will remember for local logins:

```env
SUPER_ADMIN_EMAIL=super-admin@example.test
SUPER_ADMIN_PASSWORD=MyLocal_SuperAdmin_2026!

ORG_ADMIN_EMAIL=org-admin@example.test
ORG_ADMIN_PASSWORD=MyLocal_OrgAdmin_2026!

ORG_MEMBER_EMAIL=org-member@example.test
ORG_MEMBER_PASSWORD=MyLocal_OrgMember_2026!
```

> **Tip:** `TEST-USERS.env.local` is git-ignored. Do not commit real
> passwords to the repository.

### Step 6 — Seed Sample Users

```bash
npm run seed:users
```

The script creates three users inside a "Demo Organization":

| Role | Default email |
|------|--------------|
| Super Admin | `super-admin@example.test` |
| Org Admin | `org-admin@example.test` |
| Org Member | `org-member@example.test` |

To seed just a bare-minimum super-admin (without the test org structure):

```bash
npm run seed
```

### Step 7 — Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3100](http://localhost:3100) and log in with the
super-admin credentials you set in Step 5.

### Step 8 — (Optional) Start Email Capture

For password-reset and invitation emails in development, start MailHog:

```bash
npm run dev:services
# MailHog web UI → http://localhost:8025
```

Then add these lines to `.env.local`:

```env
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM=noreply@ciao.local
```

### Useful Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server (hot reload) |
| `npm run seed:users` | Seed test users + demo organisation |
| `npm run seed` | Seed a bare super-admin only |
| `npm run db:reset` | Reset test data (destructive) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run dev:services` | Start Docker aux services (MailHog) |

### Troubleshooting

**`MongoServerError: Transaction numbers are only allowed on a replica set member`**  
Your MongoDB is running in standalone mode. Initialise the replica set:

```bash
mongosh --eval "rs.initiate()"
```

Then restart MongoDB and your app.

**`ECONNREFUSED 127.0.0.1:27017`**  
MongoDB is not running. Start it with `brew services start mongodb-community@7.0`
or via Docker (see Step 4).

**`Missing SUPER_ADMIN_PASSWORD`**  
You haven't set passwords in `TEST-USERS.env.local`. Either copy from
`TEST-USERS.env.example` and fill in values, or run the seed with
auto-generated passwords for a disposable setup:

```bash
SEED_ALLOW_PLACEHOLDER_PASSWORDS=true npm run seed:users
```

**Port 3100 already in use**  

```bash
npm run dev:clean   # kills the port then restarts
# or
PORT=3200 npm run dev
```
