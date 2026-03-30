> **Nota**: Questo file è l'archivio della versione italiana originale.
> La versione canonica e aggiornata è in inglese al path speculare nella root del progetto.

# WordpressLink Webapp

Webapp kiosk/catalogo per importare e visualizzare contenuti da endpoint REST WordPress e WooCommerce.

## Obiettivi

- Connettere dataset esterni (WordPress standard + WooCommerce products).
- Prefetch tassonomie e campi per configurazione visuale guidata.
- Costruire template UI configurabili (card/chip/text/media) con binding su campi e metadati.
- Eseguire rendering player con modalita interactive list/grid/carousel + auto-scroll.
- Mantenere credenziali server-side e player pubblico solo token-gated.

## Flusso end-to-end

1. CMS crea istanza WordpressLink.

1. Backend salva:

- `webapp_instances`
- `webapp_configs`
- `webapp_state`
- `webapp_secrets_refs` (se auth privata)

1. CMS usa endpoint prefetch per:

- tassonomie disponibili
- termini per tassonomie selezionate
- campione contenuti (post/prodotti)
- campi candidati a mapping

1. Admin compone template visuale tramite `fieldBindings` (equivalente drag-and-drop logico).

1. Player carica `/api/public/webapps/wordpress-link/[instanceId]/catalog?token=...`.

1. Backend fetch/proxy normalizza i contenuti in payload unificato.

## Origini dati supportate

- `wordpress-posts`: `/wp-json/wp/v2/posts`
- `wordpress-custom`: `/wp-json/wp/v2/{postType}`
- `woocommerce-products`: `/wp-json/wc/v3/products`

## Modalita autenticazione

- `none`: endpoint pubblici.
- `basic`: username + application password (WordPress).
- `woo-consumer`: consumer key/secret via query per WooCommerce.

Le credenziali non vengono restituite al player o al frontend CMS dopo il salvataggio.

## Configurazione principale

- `baseUrl`: dominio WordPress/WooCommerce.
- `sourceKind`: tipo sorgente (`wordpress-posts`, `wordpress-custom`, `woocommerce-products`).
- `postType`: usato in `wordpress-custom`.
- `taxonomyFilters`: lista tassonomie + termini selezionati.
- `itemsPerPage`, `order`, `orderby`.
- `refreshSeconds`.
- `viewMode`: `grid`, `list`, `carousel`.
- `autoScroll`: `none`, `ticker`, `paged`, `carousel`.
- `theme`: palette + tipografia + radius + spacing.
- `cardTemplate`: libreria template predefiniti.
- `fieldBindings`: mapping campo->slot UI.

## Libreria template UI

Template preinstallati:

- `catalog-grid-rich`: griglia card ricca (immagine, titolo, prezzo, badge categoria, CTA).
- `catalog-grid-compact`: griglia compatta ad alta densita.
- `catalog-list-editorial`: lista con estratto e metadati.
- `chip-stream`: strip orizzontale chip tassonomie + item spotlight.
- `carousel-hero`: carosello full-width autoplay.
- `kiosk-split`: layout split, filtri a sinistra e card prodotto a destra.

Ogni template espone slot:

- `title`
- `subtitle`
- `description`
- `price`
- `image`
- `chips[]`
- `metaTop[]`
- `metaBottom[]`
- `ctaLabel`
- `ctaHref`

## Mapping campi (drag-and-drop visuale)

Il configuratore include un canvas visuale drag-and-drop (palette campi -> slot template) con fallback manuale input/lista.

Esempi binding:

- `title <- title.rendered`
- `description <- excerpt.rendered`
- `image <- _embedded.wp:featuredmedia[0].source_url`
- `chips <- taxonomy.category.names[]`
- `price <- price_html`
- `ctaHref <- permalink`

Per campi WooCommerce e WordPress custom fields:

- `meta_data.*` (Woo)
- `acf.*` (se endpoint espone ACF)
- `meta.*` (meta standard)

## Modalita player

- `interactive-list`: navigazione verticale, focus selezionabile.
- `interactive-grid`: griglia con paginazione e hot-zone touch.
- `carousel-auto`: avanzamento automatico per slide.
- `ticker-scroll`: scorrimento continuo di card/chip.

## Contratto API interno

### CMS

- `POST /api/webapps/wordpress-link`
- `POST /api/webapps/wordpress-link/prefetch`

### Player pubblico token-gated

- `GET /api/public/webapps/wordpress-link/[instanceId]/catalog?token=...`

## Sicurezza

- Nessuna API key in query client-side persistente.
- Proxy server-side obbligatorio per auth privata.
- Sanitizzazione HTML (`title/excerpt/content`) lato backend.
- Timeout fetch e limiti `per_page` per protezione runtime.

## Persistenza e osservabilita

`webapp_state` aggiorna:

- `health`: `healthy` | `degraded` | `error`
- `lastSyncAt`
- `lastError`
- `lastPayloadSummary` (conteggio item/tassonomie)

## Fase implementata in questa iterazione

- Connector completo WordPress/WooCommerce.
- Prefetch tassonomie e campi candidati.
- Mapping template visuale drag-and-drop + player multivista (`grid`, `list`, `carousel`).
- Integrazione catalogo app e creazione da CMS.

## Dataset auto-creato e cache locale

A partire dal 18 Marzo 2026, la creazione di un'istanza WordPress Link include:

1. **Auto-creazione dataset** (`storageMode: "remote-mirror"`, `datasetKind: "wordpress-catalog"`):
   - Salvato in `webapp_datasets` con metadata sorgente (`baseUrl`, `sourceKind`, `postType`)
   - Binding automatico `primary` verso l'istanza in `webapp_dataset_bindings`
   - Visibile nel tab Dataset del workspace CMS `/webapps/wordpress-link`

2. **Cache fallback locale**:
   - Ogni fetch remoto riuscito persiste una snapshot degli items nel campo `config.cachedItems` del dataset
   - Se il fetch remoto fallisce (rete, timeout, errore WP), viene servita la snapshot cached
   - Pattern fire-and-forget: la persistenza cache non rallenta il rendering player
   - Il campo `config.cachedAt` registra il timestamp dell'ultimo aggiornamento cache

### Persistenza

```
webapp_datasets.config = {
  baseUrl: "https://example.com",
  sourceKind: "wordpress-posts",
  postType: null,
  cachedItems: [ ...normalized catalog items... ],
  cachedAt: "2026-03-18T12:00:00.000Z"
}
```

## Backlog next wave

- Miglioria UX builder drag-and-drop (riordino slot, preset salvabili, undo/redo).
- Gestione multi-source nella stessa istanza.
- Cache ETag/If-Modified-Since lato backend proxy (miglioramento incrementale rispetto al snapshot attuale).
- Personalizzazione avanzata tipografia per-template.
- Editor dataset avanzato WordpressLink (schema-driven e tree editor).

