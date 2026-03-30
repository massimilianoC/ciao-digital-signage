# Feature and WebApp Sandboxing Blueprint

> **Status**: DRAFT FOR IMPLEMENTATION
> **Scope**: Specific sandbox policies per feature family
> **Last Updated**: 2026-03-18

## Purpose

Definire i layer specializzati sandboxed per feature verticali e webapp, indicando cosa resta nel common platform e cosa viene delegato a moduli/connector esterni.

## Common vs Specialized Contract

Ogni feature deve dichiarare in modo esplicito:

1. Componenti del common platform richiesti.
2. Componenti specializzati del dominio.
3. Provider esterni coinvolti.
4. Capability minime richieste.
5. Dati sensibili trattati.

## Sandboxing Template (mandatory)

Usare questo template per ogni nuova feature/webapp:

```yaml
featureId: string
ownerTeam: string
scope:
  in: []
  out: []
capabilitiesRequired: []
commonDependencies: []
specializedModules: []
externalProviders: []
dataSensitivity:
  pii: none|low|medium|high
  secrets: none|indirect|direct
riskLevel: low|medium|high
confirmationGate: required|optional|none
auditEvents: []
killSwitch: true|false
```

## Feature Family: GEN-MEDIA

> L'idea è dare a un operatore o a un sistema automatizzato la capacità di generare contenuti visivi direttamente dalla piattaforma — immagini promozionali, sfondi digitali, brevi video — senza uscire dal flusso di lavoro Ciao. Il media generato diventa automaticamente un asset nella libreria dell'organizzazione, pronto per essere assegnato a playlist e schermi. La generazione avviene sempre via provider esterno, mai in-process, con moderazione obbligatoria prima del publish.

### Common layer

- Provider gateway, job queue, asset ingest API, tagging pipeline.

### Specialized layer

- Prompt presets.
- Input composition (text + image edit flows).
- Post-processing rules per media type.

### External providers

- OpenAI-compatible image/video endpoints.
- ComfyUI-like async generation APIs.

### Required safeguards

1. Content policy validation pre/post generation.
2. Output moderation before publish.
3. Quota per tenant e per action.

## Feature Family: Publish Automation

> L'idea è che un operatore possa esprimere un’intenzione in linguaggio naturale — "metti questo video sul monitor della sala riunioni da lunedì mattina" — e la piattaforma traduca autonomamente quell’intenzione in una regola di scheduling concreta, mostrandone l’anteprima prima di applicarla. Il sistema deve gestire i conflitti in modo trasparente, offrire alternative e supportare il rollback nel caso in cui il risultato non sia quello atteso.

### Common layer

- Semantic action library, schedule resolver, policy engine.

### Specialized layer

- Intent mapping “pubblica X su monitor Y”.
- Conflict explanation UX (sovrascrivi/inserisci in slot libero).

### Required safeguards

1. Confirmation gate obbligatoria su conflitti.
2. Dry-run con preview scheduling.
3. Rollback snapshot per annullare publish.

## Feature Family: Scheduler Query Assistant

> L’idea è un assistente che risponde a domande sulla programmazione corrente e futura degli schermi — "cosa va in onda questa settimana sul gruppo showroom?", "quale schermo ha slot liberi venerdì pomeriggio?" — restituendo risposte discorsive o dati strutturati esportabili. È uno strumento di sola lettura pensato per semplificare la reportistica operativa senza richiedere accesso diretto al database o al CMS.

### Common layer

- Read API scheduler, content resolver, export service.

### Specialized layer

- Risposte discorsive vs strutturate (json/csv/xls).
- Livelli di dettaglio configurabili.

### Required safeguards

1. Nessuna mutazione in modalita' query-only.
2. Redazione campi sensibili in export.

## Feature Family: Monetization Analytics

> L’idea è tracciare in modo preciso e immutabile quanto ogni contenuto viene effettivamente mostrato su ciascuno schermo, per costruire metriche commerciali affidabili: screentime, impression pesate per visibilità, copertura per campagna. Questi dati abilitano modelli di fatturazione basati sull’erogazione reale anziché sulla sola programmazione, e aprono la strada a report di performance per i clienti finali dell’organizzazione.

### Common layer

- Playback ledger append-only.
- Aggregation API tenant scoped.
- Export pipeline.

### Specialized layer

- Metriche commerciali (screentime, impression weighted, coverage).
- Pricing rules e segmentazione campagne.

### Required safeguards

1. Event integrity (immutability + checks).
2. Time-window reconciliation.
3. Audit su esportazioni e accessi report.

## Feature Family: Multilingual and Live Translation

> L’idea è che i contenuti mostrati sugli schermi si adattino automaticamente alla lingua del contesto — per una fiera internazionale, un aeroporto, o una sede con personale multiculturale — senza dover creare e mantenere varianti manuali per ogni lingua. La traduzione avviene via provider esterno e viene cachata per minimizzare costi e latenza; lo schermo riceve aggiornamenti in push quando il contenuto sorgente cambia o la policy di lingua viene modificata.

### Common layer

- i18n dictionary storage.
- Translation cache by locale/version.
- Invalidation events realtime.

### Specialized layer

- Policy monitor locale (screen-level).
- Live translation render strategy.

### Required safeguards

1. Translate-on-update, non per-frame.
2. Fallback a lingua base se provider down.
3. Label lock per termini non traducibili.

## Feature Family: Landing Builder WebApp

> L’idea è un editor integrato nella piattaforma con cui un operatore — anche non tecnico — può costruire pagine o micro-app web da mostrare sugli schermi, assistito da un LLM che genera o corregge il codice su richiesta. Il risultato è una webapp sandboxed che vive nel catalogo dell’organizzazione, può essere assegnata a playlist come qualsiasi altro contenuto, e non può accedere a risorse privilegiate al di fuori del perimetro del token che le viene concesso.

### Common layer

- Webapp SDK sandbox, asset pipeline, auth token scoped.
- Project artifact storage e versioning.

### Specialized layer

- Tripartite editor (code/preview/assistant).
- Prompt-to-code assistance e scaffolding.

### External providers

- LLM coding assistants via API.

### Required safeguards

1. Sandboxed runtime senza accesso privileged.
2. Static analysis lint/security prima di publish.
3. Capability limitate per deploy e bind a playlist/screen.

## Connector Channels: Telegram and WhatsApp

> L’idea è che un operatore possa controllare i propri schermi e ricevere notifiche di stato direttamente da Telegram o WhatsApp, senza aprire il CMS — utile per ambienti retail o eventi in cui chi gestisce i display è in movimento. I comandi arrivano come webhook firmati, vengono validati e instradati al layer semantico, e le azioni ad alto impatto richiedono sempre una conferma esplicita prima di essere eseguite.

### Common layer

- Webhook ingress, signature verification, routing to semantic layer.

### Specialized layer

- Channel-specific formatting, session handling, anti-spam policy.

### Required safeguards

1. Replay protection webhook.
2. Command rate limiting per channel identity.
3. High-impact commands sempre con conferma.

## Recommended Open Source Integrations

- **Code editor foundation**: Monaco Editor, CodeMirror.
- **Workflow automation**: n8n, Temporal.
- **Queue and jobs**: BullMQ.
- **Policy and feature flags**: Open Policy Agent (optional), Unleash.
- **Observability**: OpenTelemetry, Grafana stack.

## Governance Checklist

Prima del go-live di ogni feature/webapp:

1. Threat model completato.
2. Capability matrix approvata.
3. Secret flow validato (create/rotate/revoke).
4. Audit events implementati.
5. Kill-switch testato.
6. E2E smoke su tenant isolati.

## Related docs

- [CORE-ARCHITECTURE.md](./CORE-ARCHITECTURE.md)
- [AI-AUTOMATION-LAYER.md](./AI-AUTOMATION-LAYER.md)
- [REALTIME-INFRASTRUCTURE-PROPOSAL.md](./REALTIME-INFRASTRUCTURE-PROPOSAL.md)
- [SECURITY.md](./SECURITY.md)
- [DATA-MODEL.md](./DATA-MODEL.md)
