# WordpressLink Webapp

Kiosk/catalog webapp for importing and displaying content from WordPress REST and WooCommerce endpoints.

## Objectives

- Connect external datasets (standard WordPress + WooCommerce products).
- Prefetch taxonomies and fields for guided visual configuration.
- Build configurable UI templates (card/chip/text/media) with field and metadata bindings.
- Render player using interactive list/grid/carousel modes + auto-scroll.
- Keep credentials server-side and expose player publicly only through token-gated endpoints.

## End-to-end flow

1. CMS creates WordpressLink instance.

2. Backend stores:

- `webapp_instances`
- `webapp_configs`
- `webapp_state`
- `webapp_secrets_refs` (if private auth)

3. CMS uses prefetch endpoints for:

- available taxonomies
- terms for selected taxonomies
- sample content (posts/products)
- candidate fields for mapping

4. Admin composes visual template using `fieldBindings` (logical drag-and-drop equivalent).

5. Player loads `/api/public/webapps/wordpress-link/[instanceId]/catalog?token=...`.

6. Backend fetch/proxy normalizes content into unified payload.

## Supported data sources

- `wordpress-posts`: `/wp-json/wp/v2/posts`
- `wordpress-custom`: `/wp-json/wp/v2/{postType}`
- `woocommerce-products`: `/wp-json/wc/v3/products`

## Authentication modes

- `none`: public endpoints.
- `basic`: username + application password (WordPress).
- `woo-consumer`: consumer key/secret through query for WooCommerce.

Credentials are never returned to player or CMS frontend after save.

## Main configuration

- `baseUrl`: WordPress/WooCommerce domain.
- `sourceKind`: source type (`wordpress-posts`, `wordpress-custom`, `woocommerce-products`).
- `postType`: used in `wordpress-custom`.
- `taxonomyFilters`: selected taxonomy + term list.
- `itemsPerPage`, `order`, `orderby`.
- `refreshSeconds`.
- `viewMode`: `grid`, `list`, `carousel`.
- `autoScroll`: `none`, `ticker`, `paged`, `carousel`.
- `theme`: palette + typography + radius + spacing.
- `cardTemplate`: predefined template library.
- `fieldBindings`: field-to-UI-slot mapping.

## UI template library

Preinstalled templates:

- `catalog-grid-rich`: rich card grid (image, title, price, category badge, CTA).
- `catalog-grid-compact`: compact high-density grid.
- `catalog-list-editorial`: list with excerpt and metadata.
- `chip-stream`: horizontal taxonomy chip strip + spotlight item.
- `carousel-hero`: full-width autoplay carousel.
- `kiosk-split`: split layout, filters on left and product card on right.

Each template exposes slots:

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

## Field mapping (visual drag-and-drop)

Configurator includes visual drag-and-drop canvas (field palette -> template slots) with manual input/list fallback.

Binding examples:

- `title <- title.rendered`
- `description <- excerpt.rendered`
- `image <- _embedded.wp:featuredmedia[0].source_url`
- `chips <- taxonomy.category.names[]`
- `price <- price_html`
- `ctaHref <- permalink`

For WooCommerce and WordPress custom fields:

- `meta_data.*` (Woo)
- `acf.*` (if endpoint exposes ACF)
- `meta.*` (standard meta)

## Player modes

- `interactive-list`: vertical navigation, selectable focus.
- `interactive-grid`: grid with pagination and touch hot-zone.
- `carousel-auto`: slide auto-advance.
- `ticker-scroll`: continuous card/chip scrolling.

## Internal API contract

### CMS

- `POST /api/webapps/wordpress-link`
- `POST /api/webapps/wordpress-link/prefetch`

### Public token-gated player

- `GET /api/public/webapps/wordpress-link/[instanceId]/catalog?token=...`

## Security

- No persistent client-side API key in query.
- Server-side proxy is mandatory for private auth.
- HTML sanitization (`title/excerpt/content`) at backend.
- Fetch timeout and `per_page` limits for runtime protection.

## Persistence and observability

`webapp_state` updates:

- `health`: `healthy` | `degraded` | `error`
- `lastSyncAt`
- `lastError`
- `lastPayloadSummary` (item/taxonomy counters)

## Phase implemented in this iteration

- Full WordPress/WooCommerce connector.
- Taxonomy and candidate field prefetch.
- Visual drag-and-drop template mapping + multi-view player (`grid`, `list`, `carousel`).
- App catalog integration and CMS-based creation.

## Auto-created dataset and local cache

Since March 18, 2026, creating a WordPress Link instance includes:

1. **Auto-created dataset** (`storageMode: "remote-mirror"`, `datasetKind: "wordpress-catalog"`):
   - Stored in `webapp_datasets` with source metadata (`baseUrl`, `sourceKind`, `postType`)
   - Automatic `primary` binding to instance in `webapp_dataset_bindings`
   - Visible in workspace CMS Dataset tab `/webapps/wordpress-link`

2. **Local cache fallback**:
   - Each successful remote fetch persists an items snapshot in dataset `config.cachedItems`
   - If remote fetch fails (network, timeout, WP error), cached snapshot is served
   - Fire-and-forget pattern: cache persistence does not slow down player rendering
   - `config.cachedAt` stores last cache update timestamp

### Persistence

```
webapp_datasets.config = {
  baseUrl: "https://example.com",
  sourceKind: "wordpress-posts",
  postType: null,
  cachedItems: [ ...normalized catalog items... ],
  cachedAt: "2026-03-18T12:00:00.000Z"
}
```

## Next wave backlog

- Better drag-and-drop builder UX (slot reordering, savable presets, undo/redo).
- Multi-source support in same instance.
- Backend proxy ETag/If-Modified-Since cache (incremental improvement over current snapshot approach).
- Advanced per-template typography customization.
- Advanced WordpressLink dataset editor (schema-driven and tree editor).
