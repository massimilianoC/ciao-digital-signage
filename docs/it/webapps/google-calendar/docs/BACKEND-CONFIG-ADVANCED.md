> **Nota**: Questo file è l'archivio della versione italiana originale.
> La versione canonica e aggiornata è in inglese al path speculare nella root del progetto.

# Google Calendar Connector - Guida avanzata configuratore backend

## Obiettivo

Fornire una strategia robusta per:

- collegare calendari Google pubblici o privati
- evitare esposizione credenziali nel player
- supportare catalogo ICS tenant-scoped riusabile da tutte le app calendar della stessa org

## 1) Decision tree rapido

1. Calendario pubblico e basta read-only?

- Usa mode=public-ics oppure mode=api-key con key limitata.

1. Calendario privato Google (non pubblico)?

- NON usare API key nel player.
- Usa backend proxy con OAuth oppure service account delegato.

1. Vuoi catalogo interno di feed ICS condivisi tra istanze della stessa org?

- Implementa "Org ICS Catalog" (sezione 5).

## 2) Modalita A - Public ICS (consigliata per onboarding veloce)

### Pro

- setup molto rapido
- nessuna OAuth complexity
- basso impatto operativo

### Contro

- feed pubblico per definizione
- rischio data leak se calendario contiene dati sensibili

### Config suggerita

Nel configuratore:

- mode: public-ics
- publicIcsUrl: URL HTTPS pubblico
- timezone: Europe/Rome (o tenant-specific)
- refreshSeconds: 300 (o 120 per ambienti dinamici)
- maxItems: 10-20

Hardening:

- allowlist host per URL ICS
- timeout fetch (es. 5-8s)
- max payload size (es. 1-2 MB)
- retry con backoff

## 3) Modalita B - API key Google

### Quando usarla

- solo con calendari leggibili via API key (tipicamente pubblici)
- non per dati realmente privati

### Setup Google Cloud aggiornato (sintesi)

1. Abilita Google Calendar API nel progetto GCP.
2. Crea API key.
3. Applica restrizioni obbligatorie:

- API restriction: solo Google Calendar API
- Application restriction:
  - se chiamata backend server-to-server: IP restriction (egress IP nota)
  - se chiamata browser: HTTP referrer restriction (meno sicura per kiosk)

1. Imposta quote e alert.

Riferimenti ufficiali recenti:

- Calendar API overview (last updated 2026-03-02)
- JS quickstart (last updated 2026-03-05)
- Google raccomanda restrizioni severe sulle API key

### Nota critica

Se la key e nel player, e recuperabile da chiunque abbia accesso al device o al traffico.
Per kiosk condivisi/non trusted, evitare completamente key client-side.

## 4) Modalita C - Calendario privato (raccomandata enterprise)

Per rendere visibile un calendario privato nel kiosk mantenendo sicurezza, usa backend proxy.

### Opzione C1 - OAuth refresh token per tenant

Flusso:

1. Admin tenant autorizza una volta (scope readonly).
2. Backend salva refresh token cifrato.
3. Player chiama endpoint pubblico interno con token app (instance public token).
4. Backend usa access token short-lived e chiama Google.

Pro:

- compatibile con account utente standard

Contro:

- gestione consenso/revoca piu complessa

### Opzione C2 - Service Account + delega o ACL calendar

Flusso:

1. Service account creato in GCP.
2. Il calendario privato viene condiviso al service account (read).
3. Backend usa JWT/service auth server-side.
4. Player continua a chiamare solo backend Ciao.

Pro:

- niente credenziali utente finale
- piu robusto per ambienti kiosk enterprise

Contro:

- setup IAM/Workspace piu tecnico

## 5) Org ICS Catalog nel configuratore istanza

Richiesta: avere calendari ICS disponibili a livello organizzazione (tenant-scoped).

### Design consigliato

Crea una nuova entita catalogo, non legata a una singola istanza:

- collection: webapp_calendar_sources
- campi minimi:
  - sourceId
  - orgId (sempre valorizzato)
  - name
  - type: ics-url | uploaded-ics
  - icsUrl (se esterno)
  - fileRef (se upload)
  - visibility: org
  - tags
  - health (ok/error)
  - lastSyncAt
  - checksum

Nel configuratore Google Calendar:

- sourceMode: custom-url | catalog-source
- catalogSourceId (se selected)

### Dove salvare i file ICS

Opzione 1 (preferita): asset folder dedicata contenuti

- percorso logico: /connectors/google-calendar/sources
- meta in Content o collection dedicata
- vantaggi: riuso pipeline asset esistente, governance, audit

Opzione 2: binary su Mongo (GridFS/blob)

- utile per installazioni isolate
- svantaggi: crescita DB, backup piu pesanti, meno friendly per CDN

Raccomandazione:

- default Opzione 1
- Opzione 2 solo quando non esiste storage esterno o per installazioni air-gapped

## 6) Contratti API suggeriti per il configuratore avanzato

Nuovi endpoint consigliati:

- POST /api/webapps/google-calendar/sources
  - crea source ICS org-scoped

- GET /api/webapps/google-calendar/sources
  - lista fonti catalogo filtrate per tenant/scope

- PATCH /api/webapps/google-calendar/sources/:id
  - rename, tags, visibility, disable

- POST /api/webapps/google-calendar/sources/:id/validate
  - testa fetch + parse + conta eventi

- POST /api/webapps/google-calendar/private-auth/start
  - avvio OAuth admin flow

- POST /api/webapps/google-calendar/private-auth/callback
  - salva token cifrato

## 7) Sicurezza e compliance checklist

- Secret storage cifrato (no plain text persistito)
- Key/token mai restituiti al frontend
- Scope OAuth minimo: calendar.readonly
- Rate limit su endpoint eventi pubblici
- Token URL player con TTL/rotation periodica
- Logging con correlation id e senza PII superflua
- Kill switch per disabilitare fonte calendario compromessa

## 8) Piano implementazione incrementale

1. Hardening immediato (breve)

- cifrare webapp_secrets_refs.secretKey
- aggiungere timeout/retry/backoff e host allowlist

1. Private calendar support (medio)

- OAuth backend flow oppure service account mode
- estendere schema settings con authMode

1. Global ICS catalog (medio)

- collection + CRUD + validate endpoint
- UI picker nel form configuratore

1. Operativita (medio-lungo)

- sync worker e cache eventi
- monitor health e alerting

## 9) Nota importante per il tuo scenario kiosk

Se il player visualizza direttamente codice che contiene credenziali Google, quelle credenziali sono da considerare pubbliche.

Per calendari privati, la sola strada solida e:

- player -> backend Ciao
- backend Ciao -> Google Calendar API con credenziali server-side

In questo modo il kiosk vede solo dati eventi gia filtrati e normalizzati, non i segreti di accesso.

