# Queue Roadmap

## Feature Request 2026-03-18

## Obiettivo del documento

Questo documento riorganizza le richieste evolutive della webapp queue in una forma più fruibile per un agente di sviluppo. Il focus è preservare integralmente le informazioni emerse, esplicitare l'intento funzionale di ogni requisito e aggiungere un recap tecnico sintetico utile alla progettazione e all'implementazione incrementale.

## Obiettivi trasversali

- Spostare le configurazioni sensibili o operative dal setup iniziale a configurazioni persistite per coda, display, remote o kiosk.
- Rendere remote, display, waiting list e kiosk più flessibili nel supporto multi-coda e multi-dispositivo.
- Introdurre capacità audio, stampa e ticket digitale senza perdere compatibilità con il modello attuale basato su queue shared state.
- Preparare il dominio per modalità operative più avanzate rispetto agli attuali `reservation` e `round-robin`.

## Requisiti

### 1. Text-to-speech e audio configurabile per display e remote

#### Descrizione

Il sistema deve poter leggere tramite text-to-speech il messaggio pubblicato sul display, oppure leggere il numero corrente nella lingua selezionata sul display o sul remote corrente. La riproduzione audio deve supportare anche suoni opzionali, come cicalino, lettura del numero di coda e altri elementi correlati al delay o alla chiamata. Queste opzioni non devono vivere solo nell'inizializzazione dell'istanza, ma nella configurazione della coda o del dataset associato.

#### Requisiti funzionali

- Supportare la lettura del messaggio pubblicato sul display.
- Supportare in alternativa la lettura del numero corrente.
- Consentire la selezione lingua lato display o lato remote.
- Consentire la riproduzione opzionale di suoni accessori prima e/o dopo la lettura.
- Spostare le opzioni audio da setup iniziale a configurazione persistita della coda.

#### Recap tecnico implementativo

- Estendere il configuration schema della queue con un blocco `audioSettings` persistito nel dataset, ad esempio con flag per `enabled`, `mode`, `languages`, `preChime`, `postChime`, `speakCurrentNumber`, `speakDisplayMessage` e timing.
- Distinguere tra configurazione di default della coda e override runtime del remote o del display, con priorità esplicita.
- Introdurre nel public state del display i metadati necessari per guidare la riproduzione audio lato client senza duplicare logica nel remote.
- Prevedere un event payload realtime dedicato per trigger audio o un cambio di `displayMessage/currentServing` che includa una `speechInstruction` derivata server-side.
- Definire fallback coerenti quando la lingua richiesta non è disponibile sul browser/client.

### 2. Remote multi-coda con selezione dinamica della coda

#### Descrizione

Il remote deve poter controllare più code senza obbligare una configurazione iniziale rigida su una singola coda. L'operatore deve poter scegliere la coda da una combo box direttamente nell'interfaccia. In alternativa o in aggiunta, il remote può essere inizializzato in modo analogo al kiosk: si configura quante code può gestire quel remote, e poi l'utente passa da una coda all'altra tramite switch, tab view o dual view.

#### Requisiti funzionali

- Consentire la selezione della coda da combo box nel remote.
- Supportare remote configurati per una o più code autorizzate.
- Supportare modalità di navigazione tra code: switch semplice, tab view o dual view.
- Evitare dipendenza esclusiva da una queueName fissa in fase di bootstrap.

#### Recap tecnico implementativo

- Evolvere il modello da `queueName` singolo a `allowedQueueNames` o equivalente per le istanze remote.
- Introdurre uno `activeQueueName` nel local UI state del remote, sincronizzato con query param o persisted preference se utile.
- Aggiornare le API di controllo per ricevere esplicitamente la coda target quando il remote è multi-coda.
- Valutare una modalità read-only di preview per code non attive, utile a una futura dual view.
- Riutilizzare il pattern già presente nel kiosk per selezione di code multiple, uniformando validazione e autorizzazioni.

### 3. Modalità multigate con remote master e display slave

#### Descrizione

Va introdotta una modalità `multigate`, alternativa a `round-robin` e `reservation`, per gestire scenari multi-sportello. In questo scenario N sportelli hanno N remote per gestire N code diverse, e ciascun sportello consuma la coda su un display specifico. Il remote non controlla solo una o più code, ma anche uno o più display. Il display non segue più necessariamente una coda in autonomia: può diventare un display pilotato dal remote.

#### Requisiti funzionali

- Introdurre `multigate` come nuova modalità operativa.
- Consentire a un remote di gestire più code e più display.
- Consentire a un display di lavorare in due modalità: `follow-queue` oppure `remote-controlled`.
- Consentire al remote master di selezionare sia la coda sia il display target da combo box.
- Supportare display slave pilotati dai remote master.

#### Recap tecnico implementativo

- Estendere il dominio con una relazione esplicita tra remote, display e code autorizzate, ad esempio con `allowedDisplayIds`, `activeDisplayId`, `displayMode` e `serviceMode = multigate`.
- Separare il concetto di queue state dal concetto di routing della presentazione verso uno specifico display.
- Definire un command bus applicativo in cui il remote invia azioni verso una combinazione `queue + display`, non solo verso la queue.
- Aggiornare il public state del display per supportare una sorgente di rendering derivata dal remote invece che dalla queue direttamente.
- Introdurre regole di concorrenza e ownership per evitare che più remote pilotino contemporaneamente lo stesso display senza arbitraggio.

### 4. Controllo audio del display dal remote

#### Descrizione

Dal remote deve essere possibile controllare il riproduttore audio del display corrente. Il display deve avere in configurazione iniziale e successiva l'abilitazione o meno dell'audio, la lettura del numero, i cicalini custom prima e/o dopo, il supporto a una o più lingue configurate e la capacità di riprodurre i messaggi inviati dal remote.

#### Requisiti funzionali

- Consentire al remote di attivare o governare l'audio del display selezionato.
- Consentire al display di avere audio abilitato/disabilitato come impostazione persistita.
- Supportare riproduzione di numero, messaggio, cicalino pre e post, una o più lingue.
- Fare in modo che i messaggi inviati dal remote possano generare audio sul display corrente.

#### Recap tecnico implementativo

- Distinguere i livelli di configurazione tra queue audio policy, display device capability e runtime command del remote.
- Modellare capability del display, ad esempio `audioEnabled`, `supportedLanguages`, `supportsCustomChime`.
- Aggiungere controlli UI nel remote solo se il display attivo dichiara di supportare l'audio o se la policy della coda lo consente.
- Introdurre eventi realtime specifici di `display.audio.play`, `display.audio.stop` o equivalente, con attenzione a idempotenza e replay indesiderati in reconnect.
- Prevedere audit minimale delle azioni audio se il remote opera su più display.

### 5. Waiting list con layout configurabile list o grid

#### Descrizione

La waiting list deve offrire una configurazione iniziale e avanzata che consenta di scegliere tra layout `grid` e `list`, con `list` come default. L'osservazione di prodotto è che la lista è spesso più facile da seguire di una griglia.

#### Requisiti funzionali

- Supportare due layout della waiting list: `list` e `grid`.
- Impostare `list` come layout di default.
- Rendere il layout configurabile sia in setup sia in configurazione avanzata.

#### Recap tecnico implementativo

- Introdurre nel config schema `waitingListLayout: 'list' | 'grid'` con default stabile.
- Mantenere invariato il payload dati della waiting list, separando il layout dalla semantica dei dati.
- Verificare che la resa responsive dei due layout sia coerente con schermi pubblici di dimensioni diverse.
- Se esistono template o preview CMS, aggiungere anteprima della waiting list per ridurre errori di configurazione.

### 6. Waiting list multi-coda con viste separate o unificate

#### Descrizione

La waiting list deve poter seguire più code contemporaneamente. Le code possono essere mostrate in liste distinte in parallelo oppure fuse in un'unica lista ordinata per timestamp di arrivo. In caso di lista mista, ogni elemento deve mantenere gli accenti grafici distintivi della propria coda, per esempio nel bordo della card o della chip.

#### Requisiti funzionali

- Supportare waiting list collegate a più code.
- Supportare due modalità di aggregazione: liste separate o lista unificata.
- Ordinare la lista unificata per timestamp di arrivo.
- Preservare indicatori grafici distintivi per la coda di provenienza.

#### Recap tecnico implementativo

- Evolvere la waiting list da `queueName` singola a `queueNames[]` o struttura equivalente.
- Introdurre una strategia di aggregazione configurabile, ad esempio `split` o `mergedByTimestamp`.
- Uniformare il shape degli item per includere almeno `queueName`, `accentColor`, `issuedAt`, `displayLabel` e identificativo univoco.
- Valutare se l'aggregazione avviene server-side per garantire ordinamento consistente tra client e websocket polling fallback.
- Prevedere rendering accessibile dei marker cromatici, evitando di basarsi solo sul colore.

### 7. Configurazione stampante termica e altri tipi di stampanti per kiosk

#### Descrizione

Il kiosk deve poter essere configurato per stampanti termiche e, più in generale, per altri tipi di stampanti. La stampa del ticket non deve essere un comportamento hardcoded ma una capacità configurabile del kiosk.

#### Requisiti funzionali

- Consentire configurazione della stampante per il kiosk.
- Supportare almeno stampante termica, lasciando spazio ad altri tipi di stampanti.
- Rendere la stampa un'opzione esplicita del flusso kiosk.

#### Recap tecnico implementativo

- Introdurre nel config schema del kiosk un blocco `printingSettings` con tipo stampante, protocollo o adapter e comportamento di fallback.
- Separare la generazione del ticket dal trasporto verso il device di stampa, così da poter cambiare driver o integrazione senza toccare il dominio ticketing.
- Allineare la feature ai vincoli del repository: se servono integrazioni hardware non supportate dal web standard, prevedere adapter dedicati o eventuale integrazione extension-based solo dove consentito.
- Modellare chiaramente gli stati `print requested`, `print succeeded`, `print failed`, `print skipped` per non bloccare il flusso di prenotazione.

### 8. Ticket digitale tramite QR code senza stampa obbligatoria

#### Descrizione

Deve essere possibile consumare il ticket tramite QR code, evitando la stampa obbligatoria. L'utente cattura il QR code e prenota il ticket sul proprio device. Il ticket deve arrivare come PDF salvato e come pagina web pubblica dinamica con token di sessione, in modo che l'utente possa seguire la coda dal proprio dispositivo con un biglietto univoco associato a quel device o a quella sessione.

#### Requisiti funzionali

- Consentire emissione ticket via QR code senza stampa fisica.
- Consentire all'utente di acquisire il ticket sul proprio device.
- Rendere disponibile il ticket sia come PDF sia come pagina web pubblica dinamica.
- Proteggere l'accesso tramite token di sessione.
- Mantenere unicità del ticket consumato sul device dell'utente.

#### Recap tecnico implementativo

- Introdurre un flusso `issueDigitalTicket` che generi ticket, session token e URL pubblico firmato o tokenizzato.
- Distinguere tra identificativo del ticket di coda e identificativo della sessione pubblica dell'utente.
- Prevedere una pagina pubblica dedicata al tracking ticket con polling/realtime, stato di avanzamento e fallback in caso di refresh o cambio rete.
- Formalizzare il lifecycle del PDF: generazione immediata, lazy generation o render on demand, con storage e retention definiti.
- Gestire il QR code come rappresentazione dell'URL pubblico del ticket, evitando di esporre dati sensibili direttamente nel payload visualizzato.

## Note di implementazione prioritarie

- Le feature audio, multi-coda e multigate toccano il modello dati condiviso: conviene introdurre prima i nuovi schema fields e le capability flags, poi aggiornare UI e API.
- Waiting list multi-coda e remote multi-coda beneficiano di un vocabolario comune per autorizzazioni, selezione attiva e aggregazione dei dati.
- Stampa kiosk e ticket digitale possono convivere come strategie alternative dello stesso flusso di emissione ticket.
- La modalità `multigate` richiede una decisione architetturale chiara su ownership dei display e arbitraggio tra remote concorrenti.

## Possibile scomposizione in fasi

1. Estensione schema configurazioni: audio, multi-coda, waiting list layout, printing, digital ticket.
2. Aggiornamento API e realtime contracts per queue-targeting, display-targeting e audio commands.
3. Evoluzione UI remote/display/waiting-list/kiosk con nuove selezioni e nuove preview.
4. Introduzione modalità `multigate` con regole di binding tra remote e display.
5. Attivazione ticket digitale, pagina pubblica e PDF.
