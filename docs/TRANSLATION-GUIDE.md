# Translation Guide — Italian → English

> **Purpose**: Operational guide for an agent or contributor executing the full Italian-to-English
> translation pass of this repository's documentation.
>
> **Scope**: 7 publicly tracked files that are currently in Italian. All other docs are already in English.

---

## Strategy

1. **Translate in-place** — overwrite the Italian file with the English translation at the same path.
2. **Archive the Italian original** — save the pre-translation Italian version under `docs/it/` mirroring
   the original path, so Italian-speaking developers retain a reference.
3. **Do not rename files** — file names stay identical (e.g., `README.md` stays `README.md`).
4. **Do not change the document structure** — keep all headings, sections, tables, lists, and
   code blocks in the same order and hierarchy.

---

## Archive structure

Italian originals must be saved here **before** translating:

```
docs/it/
  cms/
    LAYOUT-SYSTEM.md
  00-architecture/
    REALTIME-INFRASTRUCTURE-PROPOSAL.md
  webapps/
    google-calendar/
      README.md
      BACKEND-CONFIG-ADVANCED.md
      TODO.md
    queue-plus/
      SPEC-CORRECTIONS-EVOLUTION-20260319.md
    wordpress-link/
      README.md
```

Add this note at the top of every archived Italian file:

```markdown
> **Nota**: Questo file è l'archivio della versione italiana originale.
> La versione canonica e aggiornata è in inglese al path speculare nella root del progetto.
```

---

## Translation rules

### Preserve as-is (do not translate)
- All code blocks (` ``` `, inline `` ` `` )
- File paths and import paths: `lib/socket/server.ts`, `/api/webapps/...`
- Collection and field names: `webapp_instances`, `orgId`, `instanceId`, `sourceId`
- Environment variable names: `NODE_ENV`, `PORT`, `HOSTNAME`
- Component and class names: `GoogleCalendarApp`, `ContentRenderer`
- Status badge emoji and symbols: `✅`, `🟡`, `📋`
- Frontmatter / metadata values that are codes or identifiers

### Translate consistently

| Italian term | English equivalent |
|---|---|
| Stato | Status |
| Ultimo aggiornamento | Last updated |
| Panoramica | Overview |
| Indice | Table of contents |
| Autore | Author |
| Flusso | Flow / Workflow |
| Sorgente / Sorgenti | Source / Sources |
| Istanza | Instance |
| Catalogo | Catalog |
| Sandboxing / Isolamento | Sandboxing / Isolation |
| Tenant | Tenant (keep as-is) |
| Configuratore | Configurator |
| Proposta | Proposal |
| Obiettivo | Objective / Goal |
| Vincoli | Constraints |
| Nota di governance | Governance note |
| Modalità | Mode |
| Fase | Phase / Sprint |
| Backlog next wave | Backlog (keep as-is) |
| Piano operativo | Operational plan |
| Origini dati | Data sources |
| Persistenza | Persistence |
| Osservabilità | Observability |

### Status/label fields

Status values in frontmatter or table cells must be translated:

| Italian | English |
|---|---|
| Implementato | Implemented |
| Fase attiva di sviluppo | Active development |
| Proposta accettata, implementazione parziale | Accepted proposal, partial implementation |
| In attesa | Pending |
| Pronto per implementazione | Ready for implementation |
| In corso | In progress |

### Checklist items

Translate prose but keep `[x]` / `[ ]` markers unchanged.

---

## Files to translate

Work through them in order. Each entry includes: path, language assessment, and specific notes.

---

### 1. `docs/cms/LAYOUT-SYSTEM.md`

**Language**: 100% Italian
**Size**: Large (full technical doc with index, architecture sections, data model, API routes, user flows)
**Audience**: CMS contributors and frontend developers
**Notes**:
- Title translates to: `# Composite Layouts — Full Technical Documentation`
- The document has a numbered table of contents — translate all section titles.
- Preserve all component names (`LayoutCompositeEditor`, `ZoneCanvas`, `CompositeLayoutRenderer`).
- Preserve all TypeScript interface and field names in code blocks.
- `Zona` / `Zone` → `Zone` (already technical, keep consistent).
- `Canvas` → `Canvas` (keep as-is).

---

### 2. `docs/00-architecture/REALTIME-INFRASTRUCTURE-PROPOSAL.md`

**Language**: Mostly Italian, some English technical fragments
**Size**: Medium (implementation status table + architecture sections)
**Audience**: Platform engineers
**Notes**:
- Title translates to: `# Sandboxed Real-Time Infrastructure Proposal (system + Queue app)`
- The implementation status table already has English values in the `File/Path` column — keep those.
- `Proposta accettata` → `Accepted proposal`
- `Namespace Socket.IO` → keep as-is (technical term).
- `Fase A/B in corso` → `Phase A/B in progress`

---

### 3. `webapps/google-calendar/docs/README.md`

**Language**: 100% Italian
**Size**: Medium (operational README for the connector)
**Audience**: Webapp contributors and integrators
**Notes**:
- Title translates to: `# Google Calendar Connector — Quick README`
- `Modalità supportate oggi` → `Supported modes`
- `Punto critico sicurezza` → `Security critical point`
- `Note pratiche` → `Practical notes`
- `Documenti correlati` → `Related documents`
- The file paths in "Documenti correlati" are already in English — keep them.

---

### 4. `webapps/google-calendar/docs/BACKEND-CONFIG-ADVANCED.md`

**Language**: 100% Italian
**Size**: Medium (decision tree + backend configuration strategy)
**Audience**: Backend contributors configuring OAuth or ICS feeds
**Notes**:
- Title translates to: `# Google Calendar Connector — Advanced Backend Configurator Guide`
- `Decision tree rapido` → `Quick decision tree`
- Keep all numbered list structure intact.
- OAuth terms (`access token`, `refresh token`, `service account`) keep as-is (standard English terms already used in Italian text).

---

### 5. `webapps/google-calendar/docs/TODO.md`

**Language**: 100% Italian
**Size**: Large (functional decisions, data model, sandboxing checklist, OAuth flow, API TODO, UI TODO, test TODO, operational plan with sprint checklist)
**Audience**: Contributors implementing the Google Calendar connector
**Notes**:
- Title translates to: `# Google Calendar Webapp — Operational TODO`
- `Decisioni confermate (bloccate)` → `Confirmed decisions (locked)`
- `Obiettivo funzionale` → `Functional goal`
- `Modello dati target (tenant-scoped)` → `Target data model (tenant-scoped)`
- `Sandboxing organizzazione (hard requirement)` → `Organization sandboxing (hard requirement)`
- Checklist enforcement items: translate prose, keep field/variable names.
- Sprint labels (`Sprint A`, `Sprint B`, etc.) → keep as-is.
- `Nota di governance` → `Governance note`
- `Piano operativo (stato esecuzione)` → `Operational plan (execution status)`

---

### 6. `webapps/queue-plus/docs/SPEC-CORRECTIONS-EVOLUTION-20260319.md`

**Language**: 100% Italian
**Size**: Medium-large (UX corrections and functional evolution spec for QueuePLUS)
**Audience**: QueuePLUS contributors
**Notes**:
- Title translates to: `# QueuePLUS — Spec Corrections and Evolution`
- Frontmatter: `Data` → `Date`, `Versione` → `Version`, `Origine` → `Origin`, `Stato` → `Status`
- `Pronto per implementazione` → `Ready for implementation`
- `Riepilogo item/priorità` → `Summary items / priorities`
- `Gestione multi-coda e dataset` → `Multi-queue and dataset management`
- `Display — TTS e binding multi-coda` → `Display — TTS and multi-queue binding`
- Keep all UI label examples (e.g., button labels, form field names) translated to English.
- Keep any numeric values, percentages, and identifiers as-is.

---

### 7. `webapps/wordpress-link/docs/README.md`

**Language**: 100% Italian
**Size**: Large (full README: objectives, end-to-end flow, data sources, auth modes, config, UI templates, field mapping, player modes, API contract, security, persistence, observability, backlog)
**Audience**: WordpressLink webapp contributors and integrators
**Notes**:
- Title translates to: `# WordpressLink Webapp`
- Subtitle line translates to: `Kiosk/catalog webapp for importing and displaying content from WordPress REST and WooCommerce endpoints.`
- `Origini dati supportate` → `Supported data sources`
- `Modalità autenticazione` → `Authentication modes`
- `Configurazione principale` → `Main configuration`
- `Libreria template UI` → `UI template library`
- `Mapping campi (drag-and-drop visuale)` → `Field mapping (visual drag-and-drop)`
- `Modalità player` → `Player modes`
- `Contratto API interno` → `Internal API contract`
- `Persistenza e osservabilità` → `Persistence and observability`
- `Fase implementata in questa iterazione` → `Phase implemented in this iteration`
- `Dataset auto-creato e cache locale` → `Auto-created dataset and local cache`
- `Backlog next wave` → `Next wave backlog`
- Template names (`catalog-grid-rich`, `chip-stream`, etc.) → keep as-is (identifiers).
- Slot names (`title`, `subtitle`, `description`, etc.) → keep as-is (identifiers).
- Field binding examples → keep as-is (technical syntax).
- Italian prose in the "Dataset auto-creato" section includes a mixed Italian/English paragraph — translate the Italian parts only.

---

## Execution checklist

For each file, in order:

- [ ] Read the Italian source file completely before starting.
- [ ] Copy the Italian original to `docs/it/<mirrored-path>` and add the archive note at the top.
- [ ] Translate the source file in-place, applying all rules above.
- [ ] Verify: no Italian prose remains (spot-check headings, bullet prose, status labels).
- [ ] Verify: code blocks, paths, identifiers are unchanged.
- [ ] Verify: document structure (section count, heading levels) matches the original.

---

## Out of scope

The following Italian files are **excluded** because they are gitignored (private/internal):

| File | Reason |
|---|---|
| `PIANO-ATTIVITA.md` | gitignored — internal operational plan |
| `docs/DEPLOY-PRODUCTION.md` | gitignored — private infrastructure runbook |
| `build/DEPLOY-CYBERDUCK.md` | build artifact, gitignored |

These do not appear in the public repository and require no translation for the public release.
