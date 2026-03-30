> **Nota**: Questo file è l'archivio della versione italiana originale.
> La versione canonica e aggiornata è in inglese al path speculare nella root del progetto.

# Google Calendar Webapp - TODO operativo

## Decisioni confermate (bloccate)

- Scope catalogo sorgenti calendario: solo organizzazione (tenant/org), non globale platform.
- Isolamento: sandboxing per organizzazione obbligatorio su tutte le query e su tutti gli endpoint.
- Sorgenti ICS: storage come asset webapp dedicato.
- Visibilita CMS: le sorgenti ICS NON compaiono nella content library generale.
- Ownership funzionale: asset interni alla webapp Google Calendar.

## Obiettivo funzionale

Avere un configuratore Google Calendar capace di:

- usare feed public ICS e feed privati in modo sicuro
- gestire catalogo sorgenti per tenant
- mantenere segreti e token solo lato backend
- esporre al player solo dati eventi normalizzati

## Modello dati target (tenant-scoped)

Collection proposta: webapp_calendar_sources

Campi minimi:

- _id
- orgId
- name
- type: ics-url | ics-upload | google-private
- visibility: org
- status: active | disabled
- icsUrl (se type=ics-url)
- assetRefId (se type=ics-upload)
- oauthRefId (se type=google-private)
- timezone
- refreshSeconds
- lastSyncAt
- lastError
- checksum
- createdBy
- updatedBy

Vincoli:

- indice su { orgId, name }
- indice su { orgId, status }
- unique opzionale su { orgId, icsUrl } per dedup feed esterni

## Asset storage webapp (non content library)

Direttiva implementativa:

- salvare file ICS come asset webapp in spazio dedicato
- non includere questi asset nelle query della content library standard

Opzione pratica:

- folder logica: /connectors/google-calendar/sources
- flag metadata: internalWebappAsset=true
- query CMS content library deve escludere internalWebappAsset=true

## Sandboxing organizzazione (hard requirement)

Checklist enforcement:

- ogni endpoint legge orgId da sessione
- nessuna query senza filtro orgId
- validazione ownership su sourceId/instanceId
- token pubblico player valido solo per instanceId appartenente a orgId coerente
- log con correlation id + orgId

## OAuth: come interviene nel flusso

Scenario target: calendario privato Google visibile su kiosk senza esporre credenziali.

Flusso OAuth tenant-admin:

1. Admin org avvia collegamento Google dal configuratore backend.
2. Backend crea state/nonce e redirect verso Google consent.
3. Callback backend salva refresh token cifrato (tenant-scoped).
4. Source type=google-private punta a oauthRefId.
5. Player continua a chiamare endpoint Ciao pubblico per eventi.
6. Backend usa access token short-lived per chiamare Google Calendar API.

Principio chiave:

- nessuna API key o token OAuth nel player.
- il player riceve solo payload eventi gia filtrato/normalizzato.

## API TODO (ordine implementazione)

1. POST /api/webapps/google-calendar/sources

- crea sorgente tenant-scoped

1. GET /api/webapps/google-calendar/sources

- lista sorgenti org

1. PATCH /api/webapps/google-calendar/sources/:id

- update metadata/stato

1. POST /api/webapps/google-calendar/sources/:id/validate

- test fetch + parse + health

1. POST /api/webapps/google-calendar/oauth/start

- avvio flow OAuth

1. GET /api/webapps/google-calendar/oauth/callback

- callback + persistenza refresh token cifrato

1. POST /api/webapps/google-calendar/sources/:id/sync

- sync manuale (admin)

## Sicurezza TODO

- cifrare secret/token at-rest (envelope encryption)
- rotazione token policy
- revoca collegamento OAuth per org
- rate limit endpoint eventi pubblici
- timeout/retry/backoff su fetch esterni
- allowlist host per ICS URL
- audit log su read secret/token

## Integrazione UI TODO (CMS)

- Nuova tab: Sorgenti Calendario (tenant)
- Selector sorgente in GoogleCalendarConnectorForm
- Stato sorgente: healthy/error/last sync
- Pulsante "Ricollega Google" per source oauth

## Test TODO

- Unit: ownership org enforcement su tutte le query
- Unit: encryption/decryption secret storage
- Integration: oauth callback + token refresh
- E2E: create source -> create connector -> player render
- E2E: source disabled -> player mostra errore controllato

## Nota di governance

Questa implementazione e esplicitamente org-scoped, sandboxed e non globale.
Qualsiasi estensione futura cross-org deve essere considerata out-of-scope fino a nuova approvazione.

## Piano operativo (stato esecuzione)

### Sprint A - Foundation backend

- [x] A1 - Modellare sorgenti calendario tenant-scoped (`webapp_calendar_sources`)
- [x] A2 - API `GET/POST /api/webapps/google-calendar/sources`
- [x] A3 - API `POST /api/webapps/google-calendar/sources/:id/validate`
- [x] A4 - Integrazione `sourceId` nella creazione connector

### Sprint B - Isolamento asset webapp

- [x] B1 - Flag `internalWebappAsset` nel modello content
- [x] B2 - Esclusione di default in content library (`/api/content`)
- [x] B3 - Mark automatico asset connector (google-calendar, queue)

### Sprint C - UI configuratore

- [x] C1 - Dropdown sorgenti tenant nel form Google Calendar
- [x] C2 - Fallback modalita manuale se catalogo non disponibile
- [x] C3 - UX per creazione/validazione sorgente dentro CMS (pagina dedicata)

### Sprint D - OAuth privato (in attesa)

- [ ] D1 - Endpoint oauth/start
- [ ] D2 - Endpoint oauth/callback
- [ ] D3 - Persistenza refresh token cifrato
- [ ] D4 - Source type `google-private` completo e validabile

### Sprint E - Test e hardening

- [ ] E1 - Unit test servizi `google-calendar-sources`
- [ ] E2 - E2E create source -> create connector -> player render
- [ ] E3 - Host allowlist per `ics-url`
- [ ] E4 - timeout/retry/backoff configurabile fetch ICS

