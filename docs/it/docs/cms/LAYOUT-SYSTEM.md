> **Nota**: Questo file è l'archivio della versione italiana originale.
> La versione canonica e aggiornata è in inglese al path speculare nella root del progetto.

# Layout Compositi — Documentazione Tecnica Completa

> **Stato**: Implementato (fase attiva di sviluppo)
> **Ultimo aggiornamento**: 2026-03-30
> **Autore**: Claude Code

---

## Indice

1. [Panoramica](#1-panoramica)
2. [Architettura dei componenti](#2-architettura-dei-componenti)
3. [Modello dati](#3-modello-dati)
4. [API Routes](#4-api-routes)
5. [Flusso utente (editor)](#5-flusso-utente-editor)
6. [Regole anti-loop e nesting](#6-regole-anti-loop-e-nesting)
7. [Sistema sfondo (backgroundImage)](#7-sistema-sfondo-backgroundimage)
8. [Propagation warning](#8-propagation-warning)
9. [Integrazione player](#9-integrazione-player)
10. [Acceptance criteria e stato](#10-acceptance-criteria-e-stato)
11. [TODO / Sviluppi futuri](#11-todo--sviluppi-futuri)

---

## 1. Panoramica

I **Layout Compositi** sono entità riusabili che dividono lo schermo in zone indipendenti. Ogni zona ospita un tipo di contenuto diverso (playlist, asset statico, webapp, sub-layout). Il layout risultante è trattato come asset pianificabile nel resto del CMS (schedule, playlist).

**Principi chiave:**

- Coordinate in percentuale (0–100%) → resolution-agnostic
- Reusabilità: un layout può essere assegnato a N schermi
- Modifica condivisa: salvataggio propaga a tutti gli schermi assegnati
- Anti-loop: max 3 livelli di nesting, rilevamento cicli in real-time
- Background image: sia il canvas globale che ogni singola zona supportano un'immagine di sfondo (riferimento visivo per l'editor + fallback player)

---

## 2. Architettura dei componenti

```
app/(cms)/layouts/
├── page.tsx                  ← Lista layout (card view)
├── new/page.tsx              ← Pagina creazione nuovo layout
└── [id]/page.tsx             ← Pagina editor layout esistente

components/cms/layouts/
├── LayoutCompositeEditor.tsx ← Componente editor principale (orchestratore)
├── ZoneCanvas.tsx            ← Canvas drag-resize per le zone
├── ZoneContentPicker.tsx     ← Modale selezione contenuto zona
├── PropagationWarningModal.tsx ← Modale avviso propagazione
└── types.ts                  ← TypeScript types condivisi
```

### LayoutCompositeEditor

Orchestratore principale. Gestisce tutto lo stato dell'editor e le chiamate API.

**Props:**

```typescript
interface LayoutCompositeEditorProps {
  layoutId?: string;       // undefined = nuovo layout
  initialData?: CompositeLayoutData;
}
```

**Stati editor:**

```
idle → dirty → saving → saved
                      ↓
              confirming_propagation → saving → saved
                      ↓
                    error
```

**Stato locale:**

| Campo | Tipo | Descrizione |
|---|---|---|
| `name` | `string` | Nome del layout |
| `zones` | `LayoutZone[]` | Array zone |
| `resolution` | `Resolution` | Risoluzione canvas (default 1920×1080) |
| `backgroundImage` | `string` | URL immagine sfondo globale layout |
| `selectedZoneId` | `string \| null` | Zona attiva nell'inspector |
| `editorState` | `EditorState` | Stato FSM dell'editor |
| `deleteZoneId` | `string \| null` | Zona in attesa di conferma eliminazione |
| `showContentPicker` | `boolean` | Mostra/nascondi ZoneContentPicker |
| `showPropagationWarning` | `boolean` | Mostra/nascondi PropagationWarningModal |
| `usageCount` | `number` | Numero di layout che referenziano questo |

**Side effects:**

- Mount (layout esistente): `GET /api/layouts/{id}/assigned-count`
- Save: `POST /api/layouts` (nuovo) o `PATCH /api/layouts/{id}` (esistente)
- Delete layout: `DELETE /api/layouts/{id}` → redirect `/layouts`

### ZoneCanvas

Rendering canvas puro. Nessuna chiamata API. Solo rendering + interazioni mouse.

**Props:**

```typescript
interface ZoneCanvasProps {
  zones: LayoutZone[];
  resolution: Resolution;
  selectedZoneId: string | null;
  backgroundImage?: string;         // URL sfondo globale del canvas
  onZoneAdd: (zone: LayoutZone) => void;
  onZoneMove: (id: string, x: number, y: number) => void;
  onZoneResize: (id: string, w: number, h: number, x: number, y: number) => void;
  onZoneSelect: (id: string | null) => void;
  onZoneRemove: (id: string) => void;
}
```

**Modalità di interazione:**

```
idle
  ↓ mousedown su canvas vuoto
adding { startX, startY, currentX, currentY }
  ↓ mouseup (se area ≥ MIN_ZONE_SIZE=5%)
→ onZoneAdd() + idle

idle
  ↓ mousedown su zona
moving { zoneId, startMouseX, startMouseY, startZoneX, startZoneY }
  ↓ mouseup
→ onZoneMove() + idle

idle
  ↓ mousedown su handle resize
resizing { zoneId, handle, startMouseX, startMouseY, startZone }
  ↓ mouseup
→ onZoneResize() + idle
```

**Vincoli geometrici:**

- `MIN_ZONE_SIZE = 5%`
- Le zone vengono snappate ai bordi del canvas (clamp 0–100)
- Durante il resize, la dimensione minima è sempre rispettata

**Aspetto visivo:**

- Canvas background: `#1a1a1a` (dark, rappresenta lo schermo fisico) + overlay griglia
- Se `backgroundImage` presente: mostrato come `background-image` CSS cover sul canvas
- Zone: sfondo bianco `rgba(255,255,255,0.82)` per visibilità sull'editor dark
- Zona selezionata: `rgba(255,255,255,0.92)` + bordo `hsl(var(--primary))` + box-shadow
- Se `zone.backgroundImage` presente: mostrato come `background-image` CSS cover sulla zona

### ZoneContentPicker

Modale per assegnare un contenuto a una zona. Carica i contenuti disponibili e applica la logica anti-loop.

**Comportamento:**

1. Carica tutti i layout dell'org via `GET /api/layouts`
2. Per ogni layout candidato calcola se causerebbe un loop (traversal grafo)
3. Carica contenuti statici (asset), playlist
4. Graying out degli item che causerebbero loop o superamento profondità massima

### PropagationWarningModal

Modale informativa che appare prima del salvataggio di un layout già assegnato.

**Props:**

```typescript
interface PropagationWarningModalProps {
  usageCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}
```

**Note**: `usageCount` viene recuperato da `GET /api/layouts/{id}/assigned-count` al mount dell'editor. La modale si attiva se `!isNew && usageCount > 0`.

### Inspector Panel (sidebar destra)

Quando una zona è selezionata, il panel mostra:

| Campo | Comportamento |
|---|---|
| **Nome zona** | Input testo → `handleZoneLabelChange` |
| **Sfondo zona** | Input URL → `handleZoneBackgroundImageChange` + preview |
| **Posizione** | Read-only: X%, Y%, W%, H% |
| **Contenuto** | Assegnato: mostra tipo+label + pulsante rimozione. Non assegnato: pulsante "Assegna contenuto" che apre ZoneContentPicker |
| **Elimina zona** | Pulsante rosso → apre modale di conferma |

Quando nessuna zona è selezionata:

| Campo | Comportamento |
|---|---|
| **Sfondo layout** | Input URL → `handleLayoutBackgroundImageChange` + preview |

**Modale eliminazione zona**: overlay dark con dialog, pulsanti "Annulla" / "Elimina". Controllo via stato `deleteZoneId`.

---

## 3. Modello dati

### TypeScript types (`components/cms/layouts/types.ts`)

```typescript
type ZoneContentType = "playlist" | "content" | "layout";

interface ZoneContent {
  type: ZoneContentType;
  refId: string;           // ObjectId as string
  label: string;           // display name
}

interface LayoutZone {
  id: string;              // crypto.randomUUID()
  x: number;               // 0–100 (percent)
  y: number;               // 0–100 (percent)
  width: number;           // 1–100 (percent)
  height: number;          // 1–100 (percent)
  label?: string;          // nome zona (rinominabile dall'utente)
  content?: ZoneContent;   // contenuto assegnato
  backgroundImage?: string; // URL immagine sfondo zona (editor + player fallback)
}

interface Resolution {
  width: number;   // px, default 1920
  height: number;  // px, default 1080
}

interface CompositeLayoutData {
  _id?: string;
  name: string;
  resolution: Resolution;
  zones: LayoutZone[];
  backgroundImage?: string; // URL immagine sfondo globale layout
}
```

### Mongoose model (`lib/db/models/CompositeLayout.ts`)

Collection: `compositelayouts`

```typescript
interface ICompositeLayout {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;       // tenant isolation — SEMPRE incluso nelle query
  name: string;                // required, trim, max 200
  status: "active" | "suspended"; // default "active"
  resolution: { width: number; height: number }; // default 1920×1080
  zones: LayoutZone[];         // coordinate % (Mongoose subdoc array)
  backgroundImage?: string;    // URL immagine sfondo globale
  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes:**

```javascript
{ orgId: 1 }                  // implicit (index: true)
{ orgId: 1, _id: 1 }         // lookup singolo per org
{ orgId: 1, status: 1 }      // filtro lista attivi
```

---

## 4. API Routes

### `GET /api/layouts`

Ritorna tutti i layout `status: "active"` dell'org, ordinati per `updatedAt` desc.

**Auth**: session cookie (orgId da sessione)
**Response**: `ICompositeLayout[]`

---

### `POST /api/layouts`

Crea nuovo layout composito.

**Body (Zod validated):**

```typescript
{
  name: string;          // min 1, max 200
  resolution?: { width: number; height: number }; // default 1920×1080
  zones?: LayoutZone[];  // default []
  backgroundImage?: string; // URL valido o stringa vuota
}
```

**Response**: `ICompositeLayout` (201)

---

### `GET /api/layouts/:id`

Ritorna un layout per ID (isolamento org).

**Response**: `ICompositeLayout` | 404

---

### `PATCH /api/layouts/:id`

Aggiorna campi del layout (partial update con `$set`).

**Body (Zod validated):**

```typescript
{
  name?: string;
  status?: "active" | "suspended";
  resolution?: { width: number; height: number };
  zones?: LayoutZone[];
  backgroundImage?: string; // URL valido o stringa vuota
}
```

**Response**: `ICompositeLayout` aggiornato | 404

---

### `DELETE /api/layouts/:id`

Elimina il layout.

**Response**: `{ ok: true }` | 404

---

### `GET /api/layouts/:id/assigned-count`

Restituisce quanti altri layout referenziano questo layout tramite nesting.
Usato per decidere se mostrare la PropagationWarningModal.

**Response**: `{ count: number }`

---

### `GET /api/player/layout` (pubblico)

Endpoint per il player runtime. Autenticato via screen token (non sessione CMS).

**Query params**: `screenId`, `token`
**Cookie richiesto**: `ciao_player_session` (ottenuto con `POST /api/player/session/claim`)
**Response**: layout completo con zone e contenuti delle zone

---

## 5. Flusso utente (editor)

```
1. Apertura editor
   ├── Nuovo: editor vuoto, name=""
   └── Esistente: fetch layout da DB → popola stato

2. Disegno zone
   └── Mousedown su canvas + drag → ghost rect → mouseup → onZoneAdd()
       Ogni zona ha: id (uuid), x%, y%, w%, h%

3. Selezione zona (click)
   └── Inspector panel si popola con: nome, sfondo, posizione, contenuto

4. Rinomina zona
   └── Input "Nome zona" nel panel → handleZoneLabelChange()

5. Sfondo zona
   └── Input URL nel panel → handleZoneBackgroundImageChange()
       Preview thumbnail nel panel. Canvas aggiorna subito (live).

6. Assegna contenuto
   └── Pulsante "+ Assegna contenuto" → apre ZoneContentPicker
       Selezione → handleContentAssign() → zona aggiornata

7. Sfondo layout globale (quando nessuna zona è selezionata)
   └── Input URL in panel → handleLayoutBackgroundImageChange()
       Mostrato come background-image del canvas.

8. Eliminazione zona
   └── Pulsante "Elimina zona" → deleteZoneId impostato
       Modale conferma → handleDeleteZoneConfirm()

9. Salvataggio
   ├── Se nuovo: POST /api/layouts → redirect /layouts/{id}
   ├── Se esistente + usageCount > 0: PropagationWarningModal → PATCH
   └── Se esistente + usageCount = 0: PATCH diretto

10. Eliminazione layout (toolbar top)
    └── window.confirm() → DELETE /api/layouts/{id} → redirect /layouts
```

---

## 6. Regole anti-loop e nesting

**Limite profondità**: max 3 livelli (A → B → C; non A → B → C → D)

**Rilevamento loop**: avviene in ZoneContentPicker al momento della selezione del contenuto:

1. Editor carica il grafo di tutti i layout dell'org (via `GET /api/layouts`)
2. Per ogni candidato, traversal grafo per verificare se la sua aggiunta creerebbe un ciclo o supererebbe MAX_NESTING_DEPTH
3. I layout problematici vengono mostrati grayed-out (disabled) nella lista
4. Tooltip: `"Loop rilevato"` o `"Profondità massima raggiunta"`

**Esempio loop:**

```
Layout A: zona 1 → Layout B
Layout B: zona 1 → ???
  → Layout A è grayed out (causerebbe A → B → A)
```

**Costante:** `MAX_NESTING_DEPTH = 3` in `ZoneContentPicker.tsx`

---

## 7. Sistema sfondo (backgroundImage)

Il campo `backgroundImage` (URL stringa) esiste a due livelli:

### Livello layout (canvas globale)

- Persistito in `ICompositeLayout.backgroundImage`
- Nell'editor: mostrato come `background-image: url(...) center/cover` sul canvas
- Scopo: riferimento visivo per il designer (es. screenshot dello schermo reale)
- Nel player: può essere usato come fallback quando nessun contenuto è in riproduzione

### Livello zona

- Persistito in `LayoutZone.backgroundImage`
- Nell'editor: mostrato come `background-image` CSS cover sulla zona specifica
- Label zona con sfondo semi-opaco bianco per leggibilità
- Nel player: usato come fallback visivo per la zona prima che il player vi renda i contenuti

**Validazione API**: `z.string().url().optional().or(z.literal(""))` — URL valido o stringa vuota (per cancellare il valore)

---

## 8. Propagation warning

Quando si salva un layout già assegnato a schermi o gruppi:

1. `GET /api/layouts/{id}/assigned-count` al mount → `usageCount`
2. Su `handleSave()`: se `!isNew && usageCount > 0` → `setShowPropagationWarning(true)`, stato → `confirming_propagation`
3. Utente vede PropagationWarningModal con il conteggio degli schermi impattati
4. "Salva e propaga" → `performSave()` → PATCH normale
5. "Annulla" → stato torna `dirty`, nessuna modifica

**Nota**: la propagazione è immediata (nessuna coda). Il player riceve il layout aggiornato alla prossima chiamata di polling.

---

## 9. Integrazione player

Il player usa `GET /api/player/layout` per ottenere la definizione del layout composito assegnato allo schermo. L'endpoint è pubblico ma richiede `screenId` + `token` e cookie lock `ciao_player_session`.

Per avviare la sessione player, il runtime chiama prima `POST /api/player/session/claim`:

- se il monitor non ha lock attivo, la sessione viene concessa e viene emesso il cookie HttpOnly;
- se il monitor e' gia in riproduzione su un altro browser, l'API risponde `409 SESSION_LOCKED`.

**Rendering player:**

- Ogni zona viene renderizzata come `<div>` posizionato assolutamente con coordinate percentuali
- Il contenuto di ogni zona viene renderizzato dentro il div della zona
- Se `zone.backgroundImage` è presente, il player lo mostra come sfondo della zona finché il contenuto non è pronto
- Se `layout.backgroundImage` è presente, il player lo mostra come sfondo del canvas

---

## 10. Acceptance criteria e stato

| ID | Criterio | Stato |
|---|---|---|
| AC-01 | Crea layout con zone drag-resize nel canvas | ✅ |
| AC-02 | Ogni zona può contenere tipi di contenuto diversi | ✅ |
| AC-03 | Layout che causerebbero loop sono grayed out | ✅ |
| AC-04 | Nesting si ferma a 3 livelli | ✅ |
| AC-05 | Modifica layout condiviso mostra avviso schermi impattati | ✅ |
| AC-06 | Layout salvato disponibile come contenuto nel CMS | ✅ |
| AC-07 | Rinomina zona dall'inspector panel | ✅ |
| AC-08 | Eliminazione zona con modale di conferma | ✅ |
| AC-09 | Sfondo immagine per layout (canvas globale) | ✅ |
| AC-10 | Sfondo immagine per singola zona | ✅ |
| AC-11 | Preview thumbnail immagine sfondo nel panel | ✅ |
| AC-12 | Zone visivamente bianche e leggibili sull'editor | ✅ |

---

## 11. TODO / Sviluppi futuri

- [ ] **Upload immagine sfondo**: sostituire input URL con uploader asset (CDN integration)
- [ ] **Preview layout completa**: modalità preview "come lo vede il player" (fullscreen)
- [ ] **Snap to grid**: aggiungere snap-to-grid opzionale per allineare le zone
- [ ] **z-index zone**: supporto ordinamento z-index per zone sovrapposte
- [ ] **Duplica zona**: pulsante per duplicare una zona esistente
- [ ] **Undo/Redo**: history di modifiche nel canvas
- [ ] **Import sfondo da asset**: browser asset library per selezionare l'immagine sfondo
- [ ] **Player fallback behavior**: documentare e implementare il comportamento player quando `backgroundImage` è presente ma il contenuto non è ancora caricato
- [ ] **Template predefiniti**: layout di partenza (es. "split 50/50", "PiP", "ticker bottom")

