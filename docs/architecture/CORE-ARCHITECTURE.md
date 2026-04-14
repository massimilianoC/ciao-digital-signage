# Ciao Core Architecture

> **Status**: ✅ COMPLETE  
> **Implementation**: 100%  
> **Last Updated**: 2026-03-18  
> **Phase**: 1-7 (all core platform phases)

## Overview

Ciao is a **multi-tenant digital signage platform** with:

- **7 complete phases** of architecture and implementation
- **Browser-based player** (Chrome 100%+)
- **Real-time manifest delivery** via Socket.IO
- **Content library** with images, videos, PDFs, widgets
- **Scheduling engine** with priority-based conflict resolution
- **Multi-tenant isolation** at DB level
- **CMS dashboard** for admin operations

## Quick Architecture Summary

| Layer | Technology | Status |
|-------|----------|--------|
| **Frontend (Player)** | Next.js App Router, React 19, Tailwind CSS 4 | ✅ Complete |
| **Frontend (CMS)** | Next.js App Router, React 19, Shadcn components | ✅ Complete |
| **Backend API** | Next.js API Routes | ✅ Complete |
| **Real-Time** | Socket.IO (Node.js custom server) | ✅ Complete |
| **Database** | MongoDB 7+, Mongoose ODM | ✅ Complete |
| **Auth** | better-auth — multi-tenant sessions + email/password | ✅ Complete |
| **File Storage** | Local `/public/uploads/`, `/public/thumbnails/` | ✅ Complete |

## Platform Phases

### Phase 1: Foundation (Auth + Multi-Tenancy)

- ✅ better-auth integration with org isolation
- ✅ MongoDB org namespace enforcement
- ✅ Session context on all routes

### Phase 2: Core Content

- ✅ Content library CRUD (image, video, PDF, widget)
- ✅ File upload with thumbnails
- ✅ Screen pairing + group assignment
- ✅ Playlist management (add/remove items)

### Phase 3: Scheduling

- ✅ Screen scheduling with FSM (idle→playing→parking)
- ✅ Priority resolver (fixed > recurring > default)
- ✅ Schedule CRUD in CMS

### Phase 4: Real-Time Sync

- ✅ Socket.IO manifest delivery
- ✅ Player heartbeat + presence tracking
- ✅ Admin override commands (force-play, clear)
- ✅ Connectivity FSM (initialize→online→offline)

### Phase 5: Browser Player

- ✅ Fullscreen rendering
- ✅ Content cycling + transitions
- ✅ Responsive layout

### Phase 6: CMS Dashboard

- ✅ Layout + sidebar navigation
- ✅ Global breadcrumb policy in shared CMS layout
- ✅ Dashboard metrics + screen status
- ✅ CRUD pages (content, playlist, schedule, screen)

### CMS Navigation Policy

- Shared breadcrumb rendered in `app/(cms)/layout.tsx` for all CMS routes.
- Standard hierarchy: `Dashboard > Section > Detail` with route-aware labels.
- Back action is always available from breadcrumb (parent route link).
- Page-level custom breadcrumbs should be avoided unless there is an exceptional flow.

### Phase 7: Frontend Specs

- ✅ UX hardening + interaction design
- ✅ PDF/YouTube content support
- ✅ Lifecycle scheduling (active/parking)
- ✅ Screen connectivity visualization

## Data Model (Simplified)

**Core Collections**:

- `users` — Multi-tenant user accounts
- `organizations` — Org metadata + billing info
- `members` — User → Org membership + roles
- `screens` — Physical screen devices
- `groups` — Screen grouping
- `playlists` — Content sequences + assignments
- `content` — Media items + types
- `schedules` — Time-based item assignments
- `contentTypes` — Text, image, video, pdf, widget metadata

**Real-Time State**:

- `screenStatus` — In-memory map per player connection
- `overrides` — Active force-overrides per screen

**Webapp Framework** (Phase 8 — ✅ Delivered):

- `webappInstances` — Registered app instances
- `webappConfigs` — App configuration per instance (Google Calendar, Queue, WordPress Link)
- `webappStates` — App health + last sync
- `webappSecretsRefs` — API key storage (separate collection)
- `webapp_queue_data` — Shared queue state (Eliminacode app)
- `webapp_calendar_sources` — Reusable calendar source datasets

*Full schema: See [DATA-MODEL.md](./DATA-MODEL.md)*

## Key Decisions

### Multi-Tenancy Strategy

**Decision**: Database-level isolation via `orgId` field.

- Pro: Single MongoDB instance, simpler ops, cost-effective
- Con: No hard isolation (must enforce in code)

### Scheduling Priority Resolver

**Decision**: Fixed > Recurring > Default (by duration)

- Pro: Deterministic, client-predictable
- Con: Requires FSM (idle→playing→parking)

### Real-Time Sync (not pull-based)

**Decision**: Socket.IO manifest push + heartbeat.

- Pro: Live updates, immediate override response
- Con: Idle connections use minimal bandwidth (heartbeat only)

### Webapp Framework

**Decision**: Shared MongoDB, registry pattern, iframe sandbox.

- Pro: Unified ops, agent-friendly SDKs, no external DB
- Con: Requires org scoping per app
- **Status**: ✅ Core framework complete (3 apps: google-calendar, queue, wordpress-link)
- **Reference**: [webapp-sdk/ARCHITECTURE.md](../webapp-sdk/ARCHITECTURE.md)

## Deployment

- **Development**: `npm run dev` on [localhost:3100](http://localhost:3100)
- **Production**: Self-hosted Linux server with a custom Node.js process manager.
  Apache reverse proxy supported — see `infra/apache/` for vhost templates.
  Docker Compose variants available in `infra/docker/`.
  Full deployment guide: [docs/DEPLOY-PRODUCTION.md](../DEPLOY-PRODUCTION.md) (internal)

## Security

- **Tenant isolation**: All queries filtered by `orgId` from session
- **API key storage**: Never in frontend; webhook proxy pattern or `.env` secrets
- **Socket.IO auth**: player requires `screenToken` + browser session cookie lock (`ciao_player_session`)
- **Monitor exclusivity**: one active browser session per monitor by default (`allowMultiSession=false`)
- **Email verification**: Required post-registration
- **CORS**: Configured per environment

*Full details: [SECURITY.md](./SECURITY.md)*

## Testing Strategy

| Suite | Status | Reference |
|-------|--------|-----------|
| TypeScript | ✅ `npm run typecheck` | PASS |
| Unit tests | ✅ Google Calendar parser, Queue displayNumber | PASS |
| E2E (core) | ✅ Pairing, groups, scheduling, player | PASS |
| E2E (legacy) | ⚠️ Full suite partial | [TEST-STRATEGY.md](./TEST-STRATEGY.md) |

*Full coverage: [TEST-STRATEGY.md](./TEST-STRATEGY.md)*

## What's Next (Phase 8+)

| Feature | Status | Notes |
|---------|--------|-------|
| Webapp SDK framework | ✅ Complete | Registry, iframe, capability token, config schema |
| Realtime `/webapp` namespace | ✅ Implemented | `lib/socket/handlers/webapp.handlers.ts`, `lib/sdk/realtime-client.ts` |
| Queue app (Eliminacode) | ✅ Core implemented | 4 modes (display/remote/waiting-list/kiosk), realtime snapshot push |
| WordPress Link connector | ✅ Implemented | REST pull, multi-view, taxonomy filters, field bindings |
| Google Calendar connector | 🔄 ~70% done | Public ICS + api-key mode, CMS catalog wiring pending |
| Realtime queue.updated push | ⏳ Pending | Emit on every mutation (POST actions) not yet wired |
| Bulk playlist ops | 📋 Backlog | — |
| Advanced scheduler UI | 📋 Backlog | — |
| Correlation ID / pairing trace | ❌ Blocked | Low priority |

*See [.planning/NEXT-PHASE.md](../../.planning/NEXT-PHASE.md) and [docs/webapps/WEBAPPS-TODO.md](../webapps/WEBAPPS-TODO.md)*

## Target Layered Architecture (Phase 8+)

Questa sezione formalizza la strategia futura per estendere Ciao con automazioni AI, connettori esterni e feature verticali mantenendo i vincoli di sicurezza multi-tenant e sandboxing.

### Layer Canonici

1. **Common Platform Layer**

- Identity, session context e RBAC.
- Tenant context enforcement (`orgId`) su API, eventi e storage.
- Secret manager e provider gateway (server-side only).
- Realtime/event bus con envelope versionato.
- Job orchestration per workflow asincroni.
- Osservabilita', audit e policy engine.

1. **Specialized Feature Layer**

- AI Automation (chat + workflow orchestrati).
- GEN-MEDIA pipeline (image/video/audio/3d).
- Publish orchestration scheduler-aware.
- Monetization analytics (screentime, impression, coverage).
- i18n e live translation.
- Landing builder webapp sandboxed.

1. **Connector/Provider Edge Layer**

- OpenAI-compatible LLM/media endpoints.
- Telegram/WhatsApp webhook ingress.
- Calendar/CMS/content providers esterni.
- Adapter provider-neutral (retry, timeout, circuit breaker, failover).

### Regola di Classificazione delle Capability

| Capability | Common Platform | Specialized Module | External Provider |
|---|---|---|---|
| Auth/RBAC, org scoping, audit | Required | No | No |
| Prompt orchestration, semantic actions | Required | Required | Optional |
| Content generation model execution | Optional | Optional | Required |
| Scheduler conflict resolution | Required | Required | No |
| Live translation strategy | Required (cache, routing) | Required (player behavior) | Required (model translation) |
| Screen monetization metrics | Required (event ledger) | Required (domain analytics) | Optional (BI export) |

### Build Interno vs Webapp Esterna vs Provider Esterno

Usare questa matrice decisionale prima di implementare una nuova feature:

1. **Build interno** se la feature richiede accesso privilegiato a scheduler, playlists, policy tenant, o azioni con alto impatto operativo.
2. **Webapp esterna sandboxed** se la feature e' prevalentemente UI/domain specific e puo' operare tramite capability token e API proxy.
3. **Provider esterno** se il valore principale e' model inference o integrazione con canali terzi, mantenendo controlli nel provider gateway interno.

### Strategic Protocol Stack

- **REST/HTTP + webhook** per integrazioni sincrone e callback provider.
- **Socket.IO envelope** per invalidazioni realtime e fan-out tenant-scoped.
- **Async jobs** (queue worker) per task lunghi (generation, translation batch, publish batch).
- **MCP/tool registry pattern** per esporre azioni backend come strumenti semanticamente descritti.
- **OpenAI-compatible tool/function calling** per interoperabilita' con provider multipli.

### Open Source Reference (Candidate Integrations)

| Area | Candidate | Ruolo in Ciao |
|---|---|---|
| Workflow orchestration | Temporal, n8n | Automation flows, retries, compensation |
| Event bus/backplane | Redis Streams, NATS, RabbitMQ | Fan-out multi-node e durability opzionale |
| Job queue | BullMQ | Esecuzione task asincroni per AI/media |
| Observability | OpenTelemetry, Prometheus, Grafana, Loki | Tracing, metriche, log centralizzati |
| Feature flags | Unleash | Rollout graduale per org/feature |
| Secrets | HashiCorp Vault / cloud KMS | Envelope encryption e rotation |
| i18n | i18next | Gestione traduzioni CMS/player |

### Roadmap Tranches (Indicativa)

| Finestra | Area | Stato |
|----------|------|-------|
| 0-30gg (✅ completato) | Webapp realtime namespace `/webapp`, envelope unico, SDK client | Done |
| 0-30gg (⏳ in corso) | Emit eventi su ogni mutazione (queue.updated post-action), polling degradato da 5s a 20-30s | Pending |
| 31-90gg | Provider gateway multi-provider, AI automation MVP (chat + semantic actions) | Backlog |
| 91-180gg | Monetization analytics (playback ledger), live translation, landing builder pilot | Backlog |

### Documenti Correlati

- [REALTIME-INFRASTRUCTURE-PROPOSAL.md](./REALTIME-INFRASTRUCTURE-PROPOSAL.md)
- [SECURITY.md](./SECURITY.md)
- [DATA-MODEL.md](./DATA-MODEL.md)
- [AI-AUTOMATION-LAYER.md](./AI-AUTOMATION-LAYER.md)
- [FEATURE-SANDBOXING-BLUEPRINT.md](./FEATURE-SANDBOXING-BLUEPRINT.md)

## Links

- **Root README**: [../../README.md](../../README.md)
- **Webapp SDK docs**: [../webapp-sdk/](../webapp-sdk/)
- **Webapp connectors**: [../webapps/](../webapps/)
- **Planning**: [../../.planning/README.md](../../.planning/README.md)

---

**Last reviewed**: 2026-03-18
**Next review**: 2026-04-14 (monthly)
