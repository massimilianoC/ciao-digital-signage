> **Nota**: Questo file è l'archivio della versione italiana originale.
> La versione canonica e aggiornata è in inglese al path speculare nella root del progetto.

# QueuePLUS — Spec Correzioni ed Evoluzione

**Data**: 2026-03-19  
**Versione**: 1.0  
**Origine**: Review UX/funzionale `REVIEW_20260326_1`  
**Stato**: Pronto per implementazione

---

## Indice

1. [QR Ticket Live — Correzioni UX](#1-qr-ticket-live--correzioni-ux)
2. [Remote — Correzioni UX e configurazione display](#2-remote--correzioni-ux-e-configurazione-display)
3. [Gestione multi-coda e dataset](#3-gestione-multi-coda-e-dataset)
4. [Display — TTS e binding multi-coda](#4-display--tts-e-binding-multi-coda)
5. [Riepilogo item/priorità](#5-riepilogo-itempriorità)

---

## 1. QR Ticket Live — Correzioni UX

### 1.1 Animazione lampeggio + allarme sonoro soft in stato "In chiamata"

**Problema**: La pagina di tracking (`/webapps/queue-plus/ticket/[ticketCode]`) non segnala in nessun modo visivo o sonoro che il numero è stato chiamato. L'utente deve guardare continuamente lo schermo.

**Requisiti**:

- Quando lo `status` transita a `serving` (numero in chiamata):
  - Il numero del ticket **lampeggia** sull'intera pagina (alternanza rapida luce/buio o colore acceso/spento, ciclo ~600ms).
  - Viene emesso un **allarme soft** una sola volta al momento della transizione: tono breve (200–400ms), frequenza gradevole (es. 880 Hz), volume basso (~0.3). Usare Web Audio API (`AudioContext`) nativo del browser, senza dipendenze esterne.
  - Il lampeggio continua finché lo stato rimane `serving`.
- Il tono deve essere emesso **una sola volta** per transizione `waiting → serving`, non a ogni refresh polling.
- Non richiedere permessi microfono/notifiche.

**File coinvolti**:

- `webapps/queue-plus/src/QueuePlusTicketTrackingApp.tsx`

**Note tecniche**:

- Usare `useRef` per tracciare lo stato precedente e rilevare la transizione.
- `AudioContext.createOscillator()` per il tono.
- Animazione CSS via classe condizionale (`animate-pulse` o keyframes custom).

---

### 1.2 Auto-invalidazione QR code nel Kiosk dopo 60 secondi o alla prima connessione

**Problema**: Il QR code emesso dal Kiosk rimane attivo indefinitamente. Se qualcuno fotografa il QR di un altro utente e lo usa per "rubare" la pagina di tracking del ticket, può seguire la coda al posto suo.

**Requisiti**:

- Dopo l'emissione di un ticket con tracking digitale, il QR code mostrato nel Kiosk si disabilita automaticamente in uno dei seguenti casi (il primo che si verifica):
  1. **Timeout**: 60 secondi dall'emissione del ticket (configurabile in registry, default 60s con opzione 30s).
  2. **Prima connessione**: la pagina di tracking viene caricata per la prima volta (`ticketFirstAccessedAt` nil → not nil).
- Quando il QR è invalidato:
  - Il Kiosk rimuove il QR visivo e sostituisce con la scritta "QR non più disponibile".
  - Il link rimane funzionante (l'utente che ha già aperto la pagina continua a monitorare).
- Il QR non viene invalidato in caso di reload della pagina di tracking da parte dell'utente già connesso.

**Modifiche al modello**:

```ts
// WebAppQueuePlusTicket: aggiungi
qrExpiresAt: Date;          // emissione + 60s (o configurato)
ticketFirstAccessedAt?: Date; // set al primo GET /tickets/[code]
```

**File coinvolti**:

- `lib/db/models/webapp-queue-plus/WebAppQueuePlusTicket.ts` — aggiungere `qrExpiresAt`, `ticketFirstAccessedAt`
- `lib/services/queue-plus-ticket.service.ts` — impostare `qrExpiresAt` in `issueQueuePlusDigitalTicket()`; aggiornare `ticketFirstAccessedAt` in `getQueuePlusDigitalTicketState()` se ancora nil
- `app/api/public/webapps/queue-plus/tickets/[ticketCode]/route.ts` — nessuna modifica strutturale, la logica è nel service
- `webapps/queue-plus/src/QueuePlusKioskApp.tsx` — avviare countdown 60s; allo scadere (o al flag `ticketFirstAccessedAt` ricevuto via polling) azzerare `trackingUrl` e mostrare placeholder "QR non più disponibile"

**Nota**: Il Kiosk non ha accesso diretto al campo `ticketFirstAccessedAt`. La risposta dell'API di emissione non cambia. Il Kiosk usa solo il countdown locale 60s (semplice e affidabile); la validazione lato server è garantita dal `qrExpiresAt`. Se si vuole il feedback "utente connesso", il Kiosk può fare polling leggero su un endpoint dedicato `/tickets/[code]/qr-status` — da valutare nella fase di implementazione.

---

### 1.3 Stati della pagina ticket: colori e feedback contestuale

**Problema**: La pagina di tracking mostra lo stato come testo semplice senza differenziazione visiva efficace tra gli stati critici.

**Requisiti**:

| Stato | Colore/tema | Comportamento |
|---|---|---|
| `waiting` (posizione > 1) | Neutro (slate/blu scuro) | Mostra posizione in coda e attualità |
| `waiting` (posizione = 1, "prossimo") | **Giallo/Ambra** (`#F59E0B`) | Highlight "Prossimo in lista!", leggera pulsazione border |
| `serving` (in chiamata) | **Verde** (`#10B981`) | Lampeggio, allarme soft (vedi 1.1) |
| `served` (servito) | **Grigio** (#6B7280) | "Grazie! Sei stato servito." — nessuna animazione |
| `expired` | Rosso scuro | "Ticket scaduto." |

**Soglia "prossimo"**: posizione = 1 (unica persona davanti all'utente è quella in servizio).

**File coinvolti**:

- `webapps/queue-plus/src/QueuePlusTicketTrackingApp.tsx`

---

## 2. Remote — Correzioni UX e configurazione display

### 2.1 Selezione display in runtime: tutti se non configurati, filtrati se configurati

**Problema**: L'attuale implementazione mostra solo i display in `allowedDisplayIds` (array dalla config). Se l'array è vuoto, il selettore è vuoto e non si può controllare nessun display.

**Requisito**:

- Se `allowedDisplayIds` è vuoto o non configurato → il Remote mostra **tutti i display disponibili** per la stessa org/dataset (fetched dinamicamente dai dati dell'istanza).
- Se `allowedDisplayIds` è popolato → il Remote mostra **solo quelli** (filtro esplicito).

**Impatto**:

- `QueuePlusRemoteApp.tsx`: adattare il `<select>` display per gestire i due casi.
- Il campo `remoteQueues[].availableDisplayIds` (o un campo ad-hoc) deve essere restituito dallo state endpoint nel caso "all displays". Oppure si aggiunge un sub-endpoint pubblico `GET /api/public/webapps/queue-plus/[instanceId]/displays` che ritorna l'elenco dei display disponibili per il dataset attivo.
- `lib/services/queue-plus-public-state.ts`: includere `availableDisplayIds` nello state del remote quando `allowedDisplayIds` è vuoto.

---

### 2.2 Configurazione display nel Remote: multi-select con tag chip

**Problema**: Il campo `allowedDisplayIds` nel configSchema è di tipo `text` con hint "tramite tab avanzato". Non esiste una UX intuitiva per selezionare uno o più display.

**Requisito**:

- Nel CMS, per le istanze Remote di QueuePLUS, il campo "Display consentiti" utilizza un **componente multi-select incrementale con chip**:
  - Input testuale con autocomplete/dropdown dei display disponibili (istanze `mode=queue` o `mode=display` nella stessa org).
  - Selezione aggiunge un tag chip con il nome del display e una `×` per rimuoverlo.
  - Salvataggio su click del tasto "Salva configurazione".
- Se nessun display viene selezionato (chip list vuota) → il remote controlla tutti i display (comportamento default, vedi 2.1).

**Componente**:

- Nuovo campo `type: "multiselect-display"` nel configSchema, oppure gestito nel tab avanzato con un campo dedicato di tipo `multiselect`.
- Il componente CMS di configurazione avanzata (`components/cms/webapps/...`) deve gestire questo tipo.

**File coinvolti**:

- `lib/sdk/webapp-registry.ts` — aggiornare `allowedDisplayIds` da `type: "text"` a un tipo multi-select o annotare come `multiselect`
- Componente CMS configurazione avanzata QueuePLUS

---

### 2.3 Controllo remoto con targeting display specifico per coda specifica

**Problema**: Obiettivo operativo: **un display per sportello**. Il Remote deve poter selezionare un display specifico e avanzare solo la coda assegnata a quel display. Attualmente il binding esiste (lock/multigate) ma:

- Il selettore display mostra solo ID tecnici, non nomi comprensibili.
- Non esiste un mapping esplicito "display → coda di competenza" visibile nell'UI del Remote.
- Quando si crea un Remote dopo le code, si possono pilotare più code ma non si riesce a forzare l'avanzamento su un display specifico.

**Requisito**:

- Il display selector nel Remote mostra, per ogni display, il **nome friendly** (o il `queueName` della coda collegata) invece del solo ID tecnico.
- Quando un display è selezionato, i controlli di avanzamento (avanza/indietro/reset) operano **solo su quel display e sulla sua coda**.
- Il lock multigate (già implementato) garantisce l'esclusività.
- Il mapping "display → queueName" viene letto dall'istanza display corrispondente (campo `queueName` della config).

**File coinvolti**:

- `lib/services/queue-plus-public-state.ts` — aggiungere `displayName`/`queueName` nei dati di ogni display nel remote state
- `webapps/queue-plus/src/QueuePlusRemoteApp.tsx` — mostrare nome invece di ID nel selettore display

---

## 3. Gestione multi-coda e dataset

### 3.1 Doppio selettore in config che si sovrascrive (bug criticalità media)

**Problema**: Quando si crea una coda secondaria tramite "nuova istanza display + nuovo nome coda", viene creato il dataset ma il display si associa alla coda principale a causa di un selettore doppio nella config che va in override. Risultato: due istanze display puntano alla stessa coda.

**Causa attesa**: Il campo `datasetId` è presente sia come campo diretto che come parte di `allowedDatasetIds`/`kioskQueueNames`; in fase di salvataggio config uno dei due prevale sull'altro.

**Requisito**:

- Ogni istanza display ha **un solo `datasetId` di riferimento** (la coda che mostra). Non deve essere possibile associarla implicitamente a un'altra coda tramite un selector secondario.
- Rimozione o disabilitazione del campo/selettore secondario che causa l'override.
- Il campo `allowedDatasetIds` (per i Remote) non deve influenzare il `datasetId` di istanze Display.

**Azione**: Audit config dell'endpoint `PUT /api/webapps/queue-plus/[instanceId]/config` (o equivalente) per identificare il punto di override e correggere la logica di merge.

---

### 3.2 Creazione dataset da sezione DATASET: errore 500 (bug criticalità alta)

**Problema**: Dalla sezione CMS "Dataset" per QueuePLUS, la creazione di un nuovo dataset restituisce errore HTTP 500.

**Requisito**:

- La creazione di un nuovo dataset QueuePLUS dalla sezione Dataset deve:
  1. Creare un documento nella collection `webapp_queue_plus_data` con struttura di coda standard (coda vuota, dataset "bootstrapped").
  2. Restituire il nuovo `datasetId`.
  3. Rendere il dataset immediatamente visibile nei selettori di configurazione di tutte le istanze QueuePLUS della stessa org.
- Il nome della coda e le impostazioni avanzate si configurano successivamente tramite edit del dataset o modifica della config istanza.

**File da verificare**:

- Handler di creazione dataset per `appId = queue-plus` (probabilmente `app/api/webapps/datasets/` o simile)
- `lib/services/queue-plus.service.ts` — funzione di bootstrap dataset

**Priorità short-term**: Finché il bug non è risolto, la creazione via nuova istanza display/remote/kiosk è workaround accettabile. Il fix del 500 è bloccante per flussi CMS avanzati.

---

### 3.3 Visibilità dataset alle configurazioni istanze esistenti

**Problema**: Una volta creata una coda secondaria (tramite nuova istanza display o kiosk), essa non compare nei selettori `allowedDatasetIds`/`allowedDisplayIds` delle istanze Remote già esistenti.

**Requisito**:

- Il selettore "Dataset gestibili dal remote" nel CMS deve essere **dinamico**: elenca tutti i dataset QueuePLUS disponibili nell'org al momento della modifica della configurazione, non solo quelli esplicitamente hardcoded al momento della creazione del Remote.
- Stessa logica per kiosk: `kioskQueueNames` deve offrire autocomplete su tutti i dataset disponibili.
- **Non** deve esistere una funzione di assegnazione in override che invalida una selezione già fatta su un'altra istanza.

---

## 4. Display — TTS e binding multi-coda

### 4.1 Text-to-Speech per annunci audio

**Problema**: Il Remote permette di aggiornare il messaggio display e ha campi audio in stato (`audio.speechMode: "number" | "message" | "both"`), ma il Display (`QueuePlusDisplayApp.tsx`) non esegue nessuna sintesi vocale. L'utente non sente audio.

**Soluzione**: Web Speech API nativa di Chrome — `window.speechSynthesis`.

**Requisito**:

- Quando `audio.enabled = true` e `audio.speechMode !== "off"`:
  - Alla transizione di `currentServing` (cambio numero), il Display pronuncia l'annuncio.
  - `speechMode = "number"`: legge solo il numero (es. "Numero trentadue").
  - `speechMode = "message"`: legge solo `displayMessage`.
  - `speechMode = "both"`: legge numero poi messaggio.
- Le lingue sono configurate in `audio.languages[]`. Se la lingua richiesta non è disponibile nel browser si usa la default.
- Nessun `preChime`/`postChime` nella prima iterazione (feature opzionale futura).
- Il tono `preChime` (se abilitato) precede il riconoscimento vocale con un suono breve (Web Audio API), come indicato in 1.1.

**File coinvolti**:

- `webapps/queue-plus/src/QueuePlusDisplayApp.tsx` — aggiungere `useRef` per `previousServing`, `useEffect` che triggered su cambio e invoca `speechSynthesis.speak()`
- Nessuna dipendenza esterna necessaria (API nativa Chrome).

---

### 4.2 Binding display su coda: logica "accetta tutto" vs "follow specifico"

**Problema**: Un display deve poter gestire più code. Attualmente la logica di quale coda "seguire" non è chiara nell'UI, e il Remote può sovrascrivere (perdendo la sincronizzazione).

**Regola di comportamento**:

| Configurazione display | Comportamento |
|---|---|
| `datasetId` non configurato / vuoto | Accetta aggiornamenti da qualunque coda della stessa org (modalità broadcast) |
| `datasetId` configurato | Segue solo quella coda (modalità follow) |
| Remote invia override esplicito | Il display viene forzato sul numero inviato, perde temporaneamente il follow fino al prossimo reset o reconnect |

**Requisito**:

- La logica di filtering degli aggiornamenti realtime sul Display deve rispettare la tabella sopra.
- Il fallback "accetta tutte" è quello corrente; la modalità "follow" serve un check nel handler WebSocket/polling.
- Il Remote deve segnalare all'operatore quando sta operando un override su un display in modalità follow (avviso nella UI: "Stai sovrascrivendo la sincronizzazione automatica del display X").

**Valutazione criticalità**: Media. Da implementare dopo la stabilizzazione dei fix 3.1–3.3.

---

## 5. Riepilogo item/priorità

| ID | Area | Tipo | Priorità | File principali |
|---|---|---|---|---|
| **1.1** | Ticket tracking — lampeggio + suono | Bug/UX | Alta | `QueuePlusTicketTrackingApp.tsx` |
| **1.2** | QR Kiosk — auto-invalidazione 60s | Feature | Alta | `WebAppQueuePlusTicket.ts`, `queue-plus-ticket.service.ts`, `QueuePlusKioskApp.tsx` |
| **1.3** | Ticket tracking — stati colorati | UX | Media | `QueuePlusTicketTrackingApp.tsx` |
| **2.1** | Remote — display selector "tutti se non configurati" | Bug | Alta | `queue-plus-public-state.ts`, `QueuePlusRemoteApp.tsx` |
| **2.2** | Remote config — multi-select chip display | Feature | Media | `webapp-registry.ts`, CMS config component |
| **2.3** | Remote — targeting display specifico con nome friendly | Feature | Media | `queue-plus-public-state.ts`, `QueuePlusRemoteApp.tsx` |
| **3.1** | Config doppio selettore override | Bug | Media | API config endpoint, service |
| **3.2** | Creazione dataset dalla sezione Dataset: 500 | Bug | Alta | Dataset API handler, `queue-plus.service.ts` |
| **3.3** | Dataset visibili in tutti i selettori istanze | Feature/Bug | Media | CMS config components, registry |
| **4.1** | TTS Web Speech API sul Display | Feature | Alta | `QueuePlusDisplayApp.tsx` |
| **4.2** | Display binding multi-coda follow/override | Feature | Bassa | `QueuePlusDisplayApp.tsx`, control handler |

---

## Decisioni aperte (da confermare prima dell'implementazione)

| Decisione | Opzioni | Default proposto |
|---|---|---|
| Timeout QR Kiosk (1.2) | 30s o 60s? | **60s** |
| Soglia "prossimo in lista" (1.3) | posizione = 1 o ≤ 2? | **posizione = 1** |
| Display selector: endpoint dedicato o via state (2.1) | campo in state o sub-endpoint `/displays` | **campo in state** (minore superficie API) |
| TTS: lingue multiple in sequenza o solo prima lingua (4.1) | Leggi in tutte le lingue o solo prima | **Solo prima lingua configurata** (semplificazione) |

---

*Documento generato da analisi di `REVIEW_20260326_1` e ispezione codebase del 2026-03-19.*

