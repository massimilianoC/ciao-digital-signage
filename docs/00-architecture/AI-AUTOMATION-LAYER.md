# Ciao AI Automation Layer

> **Status**: DRAFT FOR IMPLEMENTATION
> **Scope**: Vision + operational contracts
> **Last Updated**: 2026-03-18

## Purpose

Definire il layer comune di automazione AI per Ciao come interfaccia alternativa alla UI click-based, mantenendo sicurezza multi-tenant, policy-driven execution e supporto multi-provider.

## Scope In / Scope Out

### In scope

- Chat-driven operations (LLM commands).
- Workflow-driven operations (UI wizard, webhook, scheduler automation).
- Semantic action library per API backend.
- Provider gateway multi-provider e provider-neutral.
- Guardrail con conferma su azioni impattanti.

### Out of scope

- Addestramento modelli proprietari.
- Eliminazione dei flussi manuali CMS esistenti.
- Dipendenza obbligatoria da un singolo provider.

## Layered Architecture

1. **Intent Layer**
   - Input chat, form UI, webhook, connector command.
   - Speech-to-text opzionale lato browser per prefilling input.

2. **Semantic Layer**
   - Parsing intent in azioni strutturate.
   - Mapping tra nomi umani ("monitor Y", "asset X") e entity ID reali.
   - Risoluzione ambiguita' con richieste chiarimento.

3. **Policy and Safety Layer**
   - RBAC + capability checks.
   - Conflict checks su schedule e override attivi.
   - Confirmation gates per azioni ad alto impatto.

4. **Execution Layer**
   - Sync commands (veloci): query, update puntuali.
   - Async jobs (lunghi): generation, translation batch, publish massivo.

5. **Provider Gateway Layer**
   - Adapter per LLM/media provider.
   - Routing multi-provider con fallback.
   - Normalizzazione output ed error taxonomy.

6. **Observability and Audit Layer**
   - Tracing end-to-end.
   - Event ledger e audit con actor/action/result.
   - KPI per latenza, affidabilita', costi provider.

## Command Lifecycle

1. Input ricevuto (chat/webhook/UI).
2. Semantic parser propone `actionKey` + payload strutturato.
3. Policy engine valida permessi e conflitti.
4. Se rischio alto, viene richiesta conferma utente.
5. Executor invoca API interne o job queue.
6. Realtime updates verso frontend/players.
7. Audit e telemetria persistiti.

## Canonical Action Keys (initial set)

- `content.generate.image`
- `content.generate.video`
- `content.create.from-upload`
- `playlist.create`
- `playlist.add.asset`
- `schedule.propose.publish`
- `schedule.apply.publish`
- `screen.override.play`
- `screen.override.clear`
- `screen.query.next-content`
- `analytics.export.screentime`

## Protocol Strategy

### OpenAI-compatible function/tool calling

Usato come protocollo base per interoperare con provider diversi mantenendo payload coerenti.

### MCP-style tool registry

Raccomandato per esporre azioni backend come strumenti descritti semanticamente e versionati.

### Webhook protocol

Per connettori Telegram/WhatsApp/altri canali: ingress firmato, timestamp validation, replay protection.

### Realtime envelope

Usare envelope unico con `eventId`, `version`, `orgId`, `source`, `payload`.

## Multi-Provider Strategy

1. Capability routing per dominio (`llm.chat`, `media.image`, `translate.text`).
2. Priorita' provider per org.
3. Timeout/retry/circuit breaker uniformi.
4. Failover su provider secondario configurabile.
5. Cost and quality telemetry per confronto provider.

## Open Source Reference Stack (Candidate)

- **Temporal**: workflow complessi con retry/compensation.
- **n8n**: low-code orchestration per connettori e webhook.
- **BullMQ**: queue execution rapida su stack Node.
- **Redis Streams / NATS / RabbitMQ**: event fabric in base a scala/durability.
- **OpenTelemetry + Prometheus + Grafana**: tracing, metriche e alerting.
- **Unleash**: rollout per tenant/feature.

## High-Impact Safeguards

Obbligatori per comandi ad impatto operativo:

1. Dry-run opzionale con output di impatto previsto.
2. User confirmation con contesto conflitti.
3. Rollback strategy dove possibile.
4. Human-in-the-loop forzato per override/schedule replacement.

## KPI

- Command-to-ack latency P95.
- Job success rate per action.
- Provider failover rate.
- Scheduler conflict resolution success.
- Time-to-publish medio per automazioni.

## Deliverables by increment

1. **Increment 1**: semantic actions + confirmation gates + audit minimum.
2. **Increment 2**: provider gateway multi-provider + async jobs.
3. **Increment 3**: connector chat channels + monetization analytics integration.

## Related docs

- [CORE-ARCHITECTURE.md](./CORE-ARCHITECTURE.md)
- [REALTIME-INFRASTRUCTURE-PROPOSAL.md](./REALTIME-INFRASTRUCTURE-PROPOSAL.md)
- [SECURITY.md](./SECURITY.md)
- [DATA-MODEL.md](./DATA-MODEL.md)
- [FEATURE-SANDBOXING-BLUEPRINT.md](./FEATURE-SANDBOXING-BLUEPRINT.md)
