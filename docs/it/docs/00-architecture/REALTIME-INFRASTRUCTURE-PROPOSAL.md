> **Nota**: Questo file è l'archivio della versione italiana originale.
> La versione canonica e aggiornata è in inglese al path speculare nella root del progetto.

# Proposta infrastruttura Real-Time sandboxed (sistema + Eliminacode)

> **Stato documento**: ✅ Proposta accettata, implementazione parziale (Fase A/B in corso)
> **Ultimo aggiornamento**: 2026-03-18

## Stato implementazione (as of 2026-03-18)

| Componente | Stato | File/Path |
|------------|-------|----------|
| Namespace Socket.IO `/webapp` | ✅ Implementato | `lib/socket/server.ts` |
| Auth handshake + room join | ✅ Implementato | `lib/socket/handlers/webapp.handlers.ts` |
| Event envelope + channel keys | ✅ Implementato | `lib/realtime/webapp-events.ts` |
| Server-side emitter | ✅ Implementato | `lib/realtime/webapp-emitter.ts` |
| SDK client (browser) | ✅ Implementato | `lib/sdk/realtime-client.ts` |
| Snapshot su connect (queue) | ✅ Implementato | `webapp.handlers.ts` → `emitQueueSnapshot` |
| `queue.updated` push post-mutazione | ⏳ Pending | Da wiring nei POST handler |
| Polling degradato 5s → 20-30s | ⏳ Pending | `refreshSeconds` ancora a 5 in public state |
| Adapter astratto per scalabilita' | 📋 Backlog | Step 2/3 (Redis/NATS) |

---

## Stato attuale (as-is)

Il progetto ha gia' un layer Socket.IO stabile per il runtime player/admin (`/player`, `/admin`, `/activation`) con auth di base e recovery connessioni.

Per la webapp Eliminacode (queue):

- Lo stato viene letto via API token-gated.
- Le azioni remote (`advance`, `issue`, `set`, `reset`, `display`) passano via POST.
- Il refresh UI avviene ogni 5s (`refreshSeconds: 5`).
- Non c'e' push event-driven dedicato alla coda.

Effetto osservato: lag percepito tra comando remoto e aggiornamento display, soprattutto in scenari con operatore + tabellone su device diversi o rete non ottimale.

## Obiettivo

Introdurre un sottoservizio realtime unificato che:

- isoli i canali per tenant/app/istanza (sandboxing logico);
- supporti realtime immediato per webapp e schermi;
- non rompa il sistema esistente (adozione incrementale);
- mantenga fallback polling come safety net;
- permetta, in futuro, switch a backend a code/event bus senza riscrivere le webapp.

## Principi architetturali

1. No cross-tenant leakage: ogni evento deve essere scoped da `orgId`.
2. No lock-in: astrarre il bus realtime dietro interfaccia interna.
3. Progressive enhancement: se realtime non disponibile, polling continua.
4. Snapshot + delta: allineamento iniziale completo, poi eventi incrementali.
5. Idempotenza: eventi con `eventId` e `version` per dedup/reorder.

## Architettura proposta

### 1) Realtime Subservice (nuovo modulo applicativo)

Nuovo modulo interno (stesso processo Node inizialmente):

- `lib/realtime/contracts.ts`: envelope evento, topic naming, versioning.
- `lib/realtime/bus.ts`: interfaccia publish/subscribe astratta.
- `lib/realtime/adapters/socketio.ts`: adapter default (nessun servizio esterno).
- `lib/realtime/adapters/optional-queue.ts`: adapter opzionale per scala (fase futura).
- `lib/realtime/auth.ts`: validazione claims `orgId/appId/instanceId/screenId`.

Obiettivo: mantenere Socket.IO come trasporto primario, ma non hardcodare la logica business dentro i namespace legacy.

### 2) Channel model sandboxed

Topic/room naming standard:

- `org:{orgId}:app:{appId}`
- `org:{orgId}:app:{appId}:instance:{instanceId}`
- `org:{orgId}:screen:{screenId}`
- `org:{orgId}:group:{groupId}`
- `org:{orgId}:queue:{queueName}` (specifico Eliminacode)

Regole:

- una connessione puo' joinare solo room autorizzate;
- nessun broadcast globale non scoped;
- tutti i payload includono `orgId` e metadata di versione.

### 3) Event envelope unico

```json
{
  "eventId": "uuid",
  "eventType": "queue.updated",
  "orgId": "...",
  "appId": "queue",
  "instanceId": "...",
  "entityId": "queue:cassa1",
  "version": 42,
  "ts": "2026-03-18T10:15:30.000Z",
  "source": "api.public.queue.control",
  "payload": {}
}
```

Campi chiave:

- `version`: monotonia per entity (utile contro out-of-order);
- `eventId`: dedup lato client;
- `source`: osservabilita e tracing.

### 4) Stato e riconciliazione

Pattern operativo consigliato:

1. Client si connette al canale autorizzato.
2. Client richiede `snapshot` iniziale.
3. Server invia snapshot con `version` corrente.
4. Server invia delta realtime.
5. Se heartbeat/reconnect fallisce, client fa polling di riconciliazione.

Questo elimina il polling come driver primario, mantenendolo come rete di sicurezza.

## Focus Eliminacode (anti-lag)

## Root cause del lag

- Loop basato su timeout fisso da 5s.
- POST comando e GET stato non atomici lato UX (round-trip separati).
- Nessun push immediato su update queue.

## Soluzione dedicata (senza interferire con altre webapp)

1. Introdurre namespace logico `realtime queue` su Socket.IO (puo' essere nuovo namespace o stanza dedicata nel namespace webapp).
2. Ogni aggiornamento coda emette `queue.updated` nella room `org:{orgId}:queue:{queueName}`.
3. Remote e display si sottoscrivono alla stessa room.
4. Il comando POST ritorna anche `newVersion` e `eventId` applicato.
5. Il display aggiorna UI subito su evento push, non attende il timer.
6. Polling resta attivo ma degradato (es. 20-30s) come fallback/recovery.

Eventi minimi Eliminacode:

- `queue.snapshot`
- `queue.updated`
- `queue.ticket.issued`
- `queue.error` (facoltativo)

Payload `queue.updated` consigliato:

```json
{
  "queueName": "cassa1",
  "currentServing": "A042",
  "waitingCount": 18,
  "waitingQueuePreview": ["A043", "A044", "A045"],
  "displayMessage": "Sportello 2",
  "accentColor": "#2563EB"
}
```

## UX target Eliminacode

- P95 remote action -> display update: < 500 ms su WAN normale.
- P99 fallback consistency: < 30 s (via polling di riconciliazione).
- Nessun blocco UX in caso di disconnessione breve (optimistic local + rollback se errore).

## Proposta generale per tutte le webapp

## SDK realtime comune

Aggiungere nel WebApp SDK una piccola API comune:

- `subscribe(channel, handlers)`
- `requestSnapshot(entity)`
- `publishCommand(command)` (solo per app autorizzate)
- `onConnectionStateChange(state)`

Vantaggi:

- ogni webapp usa la stessa semantica;
- minor rischio di implementazioni custom inconsistenti;
- onboarding app esterne piu' semplice.

## Integrazione schermi (sync contenuti)

Riutilizzare lo stesso sottoservizio per:

- notifiche manifest/schedule agli screen player;
- comandi sincroni (override, refresh, sync anchor);
- fan-out per gruppo/schermo/org.

Canali consigliati:

- `org:{orgId}:screen:{screenId}`
- `org:{orgId}:group:{groupId}`
- `org:{orgId}:manifest`

## Locale/P2P (futuro, opzionale)

Per sincronizzazione rete locale e riduzione traffico server:

- mantenere control-plane centralizzato via Socket.IO;
- aggiungere data-plane P2P solo dove ha senso (asset pesanti, non comandi critici);
- usare WebRTC DataChannel per contenuti tra player vicini, con fallback HTTP.

Nota: per comandi realtime (queue/control/manifest), il server resta source of truth.

## Tecnologia: cosa usare davvero

Scelta consigliata in 3 step:

1. Step 1 (subito): Socket.IO only + adapter interno astratto.
2. Step 2 (scala media): Redis adapter/backplane per multi-instance Node.
3. Step 3 (scala alta/event sourcing): NATS o RabbitMQ solo se emerge bisogno reale di durability/fan-out avanzato cross-service.

Valutazione richiesta (RabbitMQ/Mosquitto):

- RabbitMQ: potente ma maggiore complessita' operativa; non necessario in prima fase.
- Mosquitto/MQTT: ottimo per IoT edge, meno naturale se il resto stack applicativo e' web-centric su Socket.IO.
- Decisione pragmatica: partire senza broker esterno; predisporre adapter per introdurlo senza refactor massivo.

## Sicurezza e isolamento

1. Auth handshake obbligatoria con token scoped.
2. ACL room join server-side (mai dal solo input client).
3. Rate limiting per command endpoint e publish realtime.
4. Audit log eventi comando (`who`, `when`, `from`, `result`).
5. Kill-switch per app/istanza: revoca token e blocco publish/subscribe.

## Osservabilita'

Metriche minime:

- end-to-end command latency (remote -> display);
- reconnect rate e duration;
- event drop/dedup count;
- snapshot size e frequency;
- fallback polling activation rate.

Alert:

- latenza P95 sopra soglia;
- burst reconnect anomalo per org;
- mismatch version rate elevato.

## Piano di rollout consigliato

### Fase A — Hardening Eliminacode (✅ PARZIALMENTE COMPLETATA)

- ✅ Namespace `/webapp` con auth + room join.
- ✅ Snapshot su connect: `queue.snapshot` emesso all'handshake.
- ✅ Client SDK con reconnection automatica e snapshot request.
- ⏳ Emit `queue.updated` dopo ogni mutazione queue (POST advance/issue/set/reset).
- ⏳ Degradare polling `refreshSeconds` da 5s a 20-30s.
- ⏳ KPI di latenza misurati in log.

### Fase B — Realtime SDK comune (✅ PARZIALMENTE COMPLETATA)

- ✅ `lib/realtime/webapp-events.ts`: contratti envelope, naming canali.
- ✅ `lib/realtime/webapp-emitter.ts`: `emitWebappEvent()` riutilizzabile.
- ✅ `lib/sdk/realtime-client.ts`: `initWebappRealtimeClient()` riutilizzabile.
- ⏳ Estendere a Google Calendar (event push su refresh).
- ⏳ Applicare a WordPress Link (push su fetch ciclo).

### Fase C — Realtime per screen sync (Backlog)

- Uniformare push manifest/commands al nuovo envelope versionato.
- Aggiungere metriche standard e dashboard di stato.

### Fase D — Backplane opzionale (Backlog)

- Valutazione carico reale.
- Abilitazione adapter Redis o broker se saturazione multi-node.

## Compatibilita' e non interferenza

Questa proposta e' progettata per non interferire con il sistema generale:

- Nessuna rimozione dei path HTTP esistenti.
- Polling mantenuto come fallback.
- Namespace/room isolati per dominio app.
- Migrazione graduale per singola webapp.

## Decisione raccomandata

1. Implementare subito real-time dedicato per Eliminacode (quick win sul lag).
2. Consolidare un sottoservizio realtime comune con envelope e ACL uniformi.
3. Rimandare RabbitMQ/Mosquitto finche' non ci sono requisiti concreti di scala/durability che Socket.IO + backplane non coprono.

In sintesi: prima risolviamo il lag reale con una base leggera, poi abilitiamo la scalabilita' con adapter pluggabili senza cambiare contratto applicativo.

## Estensione: AI Automation + Multi-Provider Event Fabric

Questa estensione definisce come usare la stessa infrastruttura realtime per orchestrare automazioni AI, provider esterni e workflow operativi.

### Obiettivo esteso

1. Riutilizzare l'envelope eventi comune per azioni AI e non solo per queue/player.
2. Isolare tenant e capability a livello di canale, comando e risultato.
3. Supportare provider multipli senza vincolo su un singolo vendor.

### Event Taxonomy (nuovi eventType)

- `automation.command.requested`
- `automation.command.accepted`
- `automation.command.needs-confirmation`
- `automation.command.rejected`
- `automation.job.started`
- `automation.job.progress`
- `automation.job.completed`
- `automation.job.failed`
- `provider.webhook.received`
- `provider.webhook.rejected`

### Command Gate Pattern (azioni ad alto impatto)

Per comandi con impatto operativo (`publish`, `override`, `clear`, `replace schedule`):

1. LLM/Workflow propone comando strutturato.
2. Policy engine valuta permessi, vincoli e conflitti.
3. Se necessario, il sistema emette `automation.command.needs-confirmation`.
4. Solo dopo conferma esplicita viene emesso `automation.command.accepted` e avviato il job.

### Async Execution Pattern

Task lunghi (gen image/video/audio, translate batch, publish massivo) passano da una queue asincrona.

Contratto minimo job:

```json
{
  "jobId": "uuid",
  "orgId": "...",
  "action": "media.generate",
  "requestedBy": "user-or-connector",
  "status": "queued|running|completed|failed",
  "input": {},
  "output": {},
  "startedAt": "...",
  "completedAt": "..."
}
```

### Multi-Provider Gateway (Protocol-Neutral)

Ogni provider viene astratto da un adapter con la stessa interfaccia:

- `prepareRequest(context, action)`
- `execute(request)`
- `normalizeResponse(raw)`
- `normalizeError(raw)`
- `supports(modelOrCapability)`

Strategie richieste nel gateway:

1. Priorita' provider per capability (`llm.chat`, `media.image`, `media.video`, `translate.text`).
2. Timeout e retry con backoff.
3. Circuit breaker per provider degradati.
4. Failover su provider secondario quando policy lo consente.

### Protocolli standard supportati

1. **OpenAI-compatible API**: chat, completion, tool/function calling.
2. **Webhook signed callbacks**: validazione firma e timestamp.
3. **MCP-style tool registry**: esposizione di capability backend in forma tool semanticamente descritti.
4. **REST provider custom**: mapping via adapter senza impattare i layer superiori.

### Open Source candidates (allineati allo stack)

- **Job orchestration**: BullMQ (quick start), Temporal (workflow avanzati).
- **Event fabric/backplane**: Redis Streams (semplice), NATS (bassa latenza), RabbitMQ (durability/routing).
- **Observability**: OpenTelemetry + Prometheus + Grafana.

### Canali consigliati per automation

- `org:{orgId}:automation`
- `org:{orgId}:automation:job:{jobId}`
- `org:{orgId}:provider:{providerId}`
- `org:{orgId}:screen:{screenId}` (notifiche publish/scheduler)

### KPI infrastrutturali (automation)

1. Command acceptance latency (P95).
2. Job completion time by action/provider.
3. Provider error rate e failover activation rate.
4. Numero comandi bloccati da policy/conflitto.
5. Scheduler conflict resolution success rate.

### Compatibilita' con implementazione attuale

- Nessuna rottura API esistenti.
- Socket.IO resta base transport in prima fase.
- Polling resta fallback per client legacy.
- Introduzione progressiva per feature/connector.

