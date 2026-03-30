> **Nota**: Questo file è l'archivio della versione italiana originale.
> La versione canonica e aggiornata è in inglese al path speculare nella root del progetto.

# Google Calendar Connector - README rapido

## Stato attuale nel progetto

Il connettore e gia implementato in modalita MVP e funziona cosi:

1. CMS crea una istanza connector da pagina:

- /content/google-calendar/new

1. API di creazione salva:

- istanza: webapp_instances
- config: webapp_configs
- stato: webapp_state
- secret API key (se mode=api-key): webapp_secrets_refs

1. Player legge il contenuto via iframe URL:

- /webapps/google-calendar/[instanceId]?token=[publicToken]

1. Il frontend Google Calendar NON chiama Google direttamente:

- chiama /api/public/webapps/google-calendar/[instanceId]/events?token=...
- il backend risolve config + secret e chiama Google API o URL ICS

Questo design evita di esporre la API key nel codice client del player.

## Modalita supportate oggi

- public-ics
  - usa publicIcsUrl
  - backend scarica ICS e lo normalizza
  - adatto a calendari pubblici o feed pubblicabili

- api-key
  - usa calendarId + apiKey
  - backend chiama Calendar API v3 events.list
  - adatto a calendari leggibili con API key (tipicamente pubblici)

## Punto critico sicurezza

Una API key usata direttamente nel player/browser e sempre esposta (network tab, source map, bundle sniffing).

Quindi:

- per calendari pubblici: accettabile con key fortemente limitata
- per calendari privati: non usare API key client-side
- per calendari privati: usare backend proxy con credenziali server-side (OAuth refresh token o service account delegato)

## Documenti correlati

- API create/list connector: app/api/webapps/google-calendar/route.ts
- API eventi pubblica player: app/api/public/webapps/google-calendar/[instanceId]/events/route.ts
- Service parsing/fetch: lib/services/google-calendar-connector.service.ts
- Form CMS: components/cms/GoogleCalendarConnectorForm.tsx
- Player UI app: webapps/google-calendar/src/GoogleCalendarApp.tsx

## Note pratiche

- Oggi i secret sono persistiti in webapp_secrets_refs.
- Prossimo hardening consigliato: cifratura at-rest (KMS o envelope encryption) + rotazione + audit read access.

