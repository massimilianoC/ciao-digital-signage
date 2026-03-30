import type { ConfigSchema } from "./config-schema.types";

export interface WebAppRegistryEntry {
    appId: string;
    name: string;
    description: string;
    category: "productivity" | "operations" | "communication" | "media";
    /** Lucide icon name */
    icon: string;
    configSchema: ConfigSchema;
    /** Whether a custom React configurator tab is available */
    hasCustomConfig: boolean;
    /** How this app can be exposed to the player */
    displayModes: ("player" | "direct")[];
    /** Build the player iframe URL for this app */
    playerPath(instanceId: string, token: string): string;
    /** App exposes reusable datasets in addition to instances */
    hasDatasets?: boolean;
    /** Dataset management ownership */
    datasetManagement?: "sdk" | "app";
    /** Optional custom path for dataset management */
    datasetManagerPath?: string;
    /** Whether dataset listing is read-only from the generic SDK workspace */
    datasetsReadOnly?: boolean;
}

export type PublicWebAppRegistryEntry = Omit<WebAppRegistryEntry, "playerPath">;

export const WEBAPP_REGISTRY: Record<string, WebAppRegistryEntry> = {
    "google-calendar": {
        appId: "google-calendar",
        name: "Google Calendar",
        description:
            "Mostra gli eventi imminenti di un Google Calendar in un display digitale.",
        category: "productivity",
        icon: "Calendar",
        hasCustomConfig: true,
        displayModes: ["player"],
        hasDatasets: true,
        datasetManagement: "app",
        datasetManagerPath: "/content/google-calendar/sources",
        configSchema: {
            schemaVersion: 1,
            fields: [
                {
                    key: "mode",
                    label: "Modalità dati",
                    type: "select",
                    required: true,
                    options: [
                        { value: "public-ics", label: "URL ICS pubblico" },
                        {
                            value: "api-key",
                            label: "API Key Google (privata, server-side)",
                        },
                    ],
                },
                {
                    key: "title",
                    label: "Titolo display",
                    type: "text",
                    placeholder: "Calendario eventi",
                },
                {
                    key: "publicIcsUrl",
                    label: "URL ICS pubblico",
                    type: "url",
                    required: true,
                    conditions: [{ field: "mode", value: "public-ics" }],
                    placeholder: "https://calendar.google.com/...ical/...",
                },
                {
                    key: "calendarId",
                    label: "Calendar ID",
                    type: "text",
                    required: true,
                    conditions: [{ field: "mode", value: "api-key" }],
                    placeholder: "example@group.calendar.google.com",
                },
                {
                    key: "timezone",
                    label: "Fuso orario",
                    type: "text",
                    required: true,
                    default: "Europe/Rome",
                    placeholder: "Europe/Rome",
                },
                {
                    key: "refreshSeconds",
                    label: "Aggiornamento (secondi)",
                    type: "number",
                    default: 300,
                },
                { key: "maxItems", label: "Max eventi", type: "number", default: 10 },
                {
                    key: "accentColor",
                    label: "Colore accento",
                    type: "color",
                    default: "#4285F4",
                },
            ],
        },
        playerPath: (instanceId, token) =>
            `/webapps/google-calendar/${instanceId}?token=${token}`,
    },

    queue: {
        appId: "queue",
        name: "Eliminacode",
        description:
            "Sistema eliminacode digitale. Display tabellone o Remote Control. Più istanze possono riusare lo stesso dataset coda.",
        category: "operations",
        icon: "Hash",
        hasCustomConfig: true,
        displayModes: ["player", "direct"],
        hasDatasets: true,
        datasetManagement: "sdk",
        datasetsReadOnly: false,
        configSchema: {
            schemaVersion: 1,
            fields: [
                {
                    key: "mode",
                    label: "Modalità istanza",
                    type: "select",
                    required: true,
                    options: [
                        { value: "queue", label: "Queue — numero corrente" },
                        {
                            value: "remote",
                            label: "Remote Control — gestione coda",
                        },
                        {
                            value: "waiting-list",
                            label: "Waiting List — prossimi prenotati",
                        },
                        {
                            value: "kiosk",
                            label: "Kiosk — prenotazione multicode",
                        },
                        { value: "display", label: "Display legacy" },
                    ],
                    hint: "Queue mostra il numero servito, Remote controlla la coda, Waiting List mostra i prossimi prenotati, Kiosk emette ticket su più code",
                },
                {
                    key: "queueName",
                    label: "Nome coda (chiave condivisa)",
                    type: "text",
                    required: true,
                    placeholder: "sportello-1",
                    hint: "Istanze queue/remote/waiting-list con lo stesso nome operano sulla stessa coda",
                    conditions: [
                        { field: "mode", value: "queue" },
                    ],
                },
                {
                    key: "queueName",
                    label: "Nome coda (chiave condivisa)",
                    type: "text",
                    required: true,
                    placeholder: "sportello-1",
                    hint: "Istanze queue/remote/waiting-list con lo stesso nome operano sulla stessa coda",
                    conditions: [
                        { field: "mode", value: "display" },
                    ],
                },
                {
                    key: "queueName",
                    label: "Nome coda (chiave condivisa)",
                    type: "text",
                    required: true,
                    placeholder: "sportello-1",
                    hint: "Istanze queue/remote/waiting-list con lo stesso nome operano sulla stessa coda",
                    conditions: [
                        { field: "mode", value: "remote" },
                    ],
                },
                {
                    key: "queueName",
                    label: "Nome coda (chiave condivisa)",
                    type: "text",
                    required: true,
                    placeholder: "sportello-1",
                    hint: "Istanze queue/remote/waiting-list con lo stesso nome operano sulla stessa coda",
                    conditions: [
                        { field: "mode", value: "waiting-list" },
                    ],
                },
                {
                    key: "queueType",
                    label: "Tipo numerazione",
                    type: "select",
                    required: true,
                    default: "numeric",
                    options: [
                        { value: "numeric", label: "Numerica (1, 2, 3…)" },
                        { value: "alpha", label: "Alfanumerica (A001, B002…)" },
                    ],
                    conditions: [{ field: "mode", value: "queue" }],
                },
                {
                    key: "queueType",
                    label: "Tipo numerazione",
                    type: "select",
                    required: true,
                    default: "numeric",
                    options: [
                        { value: "numeric", label: "Numerica (1, 2, 3…)" },
                        { value: "alpha", label: "Alfanumerica (A001, B002…)" },
                    ],
                    conditions: [{ field: "mode", value: "display" }],
                },
                {
                    key: "queueType",
                    label: "Tipo numerazione",
                    type: "select",
                    required: true,
                    default: "numeric",
                    options: [
                        { value: "numeric", label: "Numerica (1, 2, 3…)" },
                        { value: "alpha", label: "Alfanumerica (A001, B002…)" },
                    ],
                    conditions: [{ field: "mode", value: "remote" }],
                },
                {
                    key: "queueType",
                    label: "Tipo numerazione",
                    type: "select",
                    required: true,
                    default: "numeric",
                    options: [
                        { value: "numeric", label: "Numerica (1, 2, 3…)" },
                        { value: "alpha", label: "Alfanumerica (A001, B002…)" },
                    ],
                    conditions: [{ field: "mode", value: "waiting-list" }],
                },
                {
                    key: "prefix",
                    label: "Prefisso letterale",
                    type: "text",
                    placeholder: "A",
                    hint: "Lettera o codice anteposto al numero (es. 'A' → A001)",
                    conditions: [
                        { field: "queueType", value: "alpha" },
                        { field: "mode", value: "queue" },
                    ],
                },
                {
                    key: "serviceMode",
                    label: "Modalità servizio",
                    type: "select",
                    required: true,
                    default: "reservation",
                    options: [
                        { value: "reservation", label: "Reservation — servo solo prenotati" },
                        { value: "round-robin", label: "Round Robin — contatore libero ciclico" },
                    ],
                    conditions: [{ field: "mode", value: "queue" }],
                },
                {
                    key: "serviceMode",
                    label: "Modalità servizio",
                    type: "select",
                    required: true,
                    default: "reservation",
                    options: [
                        { value: "reservation", label: "Reservation — servo solo prenotati" },
                        { value: "round-robin", label: "Round Robin — contatore libero ciclico" },
                    ],
                    conditions: [{ field: "mode", value: "display" }],
                },
                {
                    key: "serviceMode",
                    label: "Modalità servizio",
                    type: "select",
                    required: true,
                    default: "reservation",
                    options: [
                        { value: "reservation", label: "Reservation — servo solo prenotati" },
                        { value: "round-robin", label: "Round Robin — contatore libero ciclico" },
                    ],
                    conditions: [{ field: "mode", value: "remote" }],
                },
                {
                    key: "serviceMode",
                    label: "Modalità servizio",
                    type: "select",
                    required: true,
                    default: "reservation",
                    options: [
                        { value: "reservation", label: "Reservation — servo solo prenotati" },
                        { value: "round-robin", label: "Round Robin — contatore libero ciclico" },
                    ],
                    conditions: [{ field: "mode", value: "waiting-list" }],
                },
                {
                    key: "bookingEnabled",
                    label: "Prenotazione abilitata",
                    type: "toggle",
                    default: true,
                },
                {
                    key: "roundRobinMaxNumber",
                    label: "Numero massimo ciclo round robin",
                    type: "number",
                    default: 99,
                    conditions: [{ field: "serviceMode", value: "round-robin" }],
                },
                {
                    key: "maxWaiting",
                    label: "Max numeri in attesa",
                    type: "number",
                    default: 99,
                },
                {
                    key: "waitingListLimit",
                    label: "Elementi waiting list a schermo",
                    type: "number",
                    default: 8,
                    conditions: [{ field: "mode", value: "waiting-list" }],
                },
                {
                    key: "showWaitingCount",
                    label: "Mostra conteggio attesa",
                    type: "toggle",
                    default: true,
                },
                {
                    key: "kioskQueueNames",
                    label: "Code abilitate sul kiosk",
                    type: "text",
                    placeholder: "Configurazione tramite tab avanzato",
                    hint: "Impostare tramite configuratore avanzato (multi-select strict array)",
                    conditions: [{ field: "mode", value: "kiosk" }],
                },
                {
                    key: "accentColor",
                    label: "Colore accento",
                    type: "color",
                    default: "#2563EB",
                },
            ],
        },
        playerPath: (instanceId, token) =>
            `/webapps/queue/${instanceId}?token=${token}`,
    },

    "queue-plus": {
        appId: "queue-plus",
        name: "QueuePLUS",
        description:
            "Nuova generazione eliminacode sandboxed su SDK: stessa UX base della queue, ma con dataset isolati, modelli piu' robusti e roadmap evolutiva multi-gate.",
        category: "operations",
        icon: "Hash",
        hasCustomConfig: true,
        displayModes: ["player", "direct"],
        hasDatasets: true,
        datasetManagement: "sdk",
        datasetsReadOnly: false,
        configSchema: {
            schemaVersion: 1,
            fields: [
                {
                    key: "mode",
                    label: "Modalita' istanza",
                    type: "select",
                    required: true,
                    options: [
                        { value: "queue", label: "QueuePLUS Display" },
                        { value: "remote", label: "QueuePLUS Remote" },
                        { value: "waiting-list", label: "QueuePLUS Waiting List" },
                        { value: "kiosk", label: "QueuePLUS Kiosk" },
                        { value: "display", label: "Display legacy alias" },
                    ],
                },
                {
                    key: "datasetId",
                    label: "Dataset principale",
                    type: "text",
                    required: true,
                    placeholder: "ObjectId dataset QueuePLUS",
                },
                {
                    key: "allowedDatasetIds",
                    label: "Dataset aggiuntivi gestibili dal remote",
                    type: "text",
                    placeholder: "Configurazione tramite tab avanzato",
                    conditions: [{ field: "mode", value: "remote" }],
                },
                {
                    key: "queueType",
                    label: "Tipo numerazione",
                    type: "select",
                    required: true,
                    default: "numeric",
                    options: [
                        { value: "numeric", label: "Numerica" },
                        { value: "alpha", label: "Alfanumerica" },
                    ],
                },
                {
                    key: "prefix",
                    label: "Prefisso letterale",
                    type: "text",
                    placeholder: "A",
                    conditions: [{ field: "queueType", value: "alpha" }],
                },
                {
                    key: "serviceMode",
                    label: "Modalita' servizio",
                    type: "select",
                    required: true,
                    default: "reservation",
                    options: [
                        { value: "reservation", label: "Reservation" },
                        { value: "round-robin", label: "Round Robin" },
                        { value: "multigate", label: "Multi-gate" },
                    ],
                },
                { key: "bookingEnabled", label: "Prenotazione abilitata", type: "toggle", default: true },
                { key: "maxWaiting", label: "Max numeri in attesa", type: "number", default: 99 },
                { key: "roundRobinMaxNumber", label: "Numero massimo ciclo round robin", type: "number", default: 99 },
                { key: "showWaitingCount", label: "Mostra conteggio attesa", type: "toggle", default: true },
                {
                    key: "waitingListLayout",
                    label: "Layout waiting list",
                    type: "select",
                    default: "list",
                    options: [
                        { value: "list", label: "List" },
                        { value: "grid", label: "Grid" },
                    ],
                    conditions: [{ field: "mode", value: "waiting-list" }],
                },
                {
                    key: "waitingListLimit",
                    label: "Elementi waiting list a schermo",
                    type: "number",
                    default: 8,
                    conditions: [{ field: "mode", value: "waiting-list" }],
                },
                {
                    key: "kioskDatasetIds",
                    label: "Dataset abilitati sul kiosk",
                    type: "text",
                    placeholder: "Configurazione tramite tab avanzato",
                    conditions: [{ field: "mode", value: "kiosk" }],
                },
                {
                    key: "allowedDisplayIds",
                    label: "Display pilotabili",
                    type: "text",
                    placeholder: "Configurazione tramite tab avanzato",
                    conditions: [{ field: "mode", value: "remote" }],
                },
                {
                    key: "ticketDeliveryMode", label: "Delivery ticket", type: "select", default: "print", options: [
                        { value: "print", label: "Solo stampa" },
                        { value: "qr", label: "Solo QR" },
                        { value: "both", label: "Stampa + QR" },
                    ],
                    conditions: [{ field: "mode", value: "kiosk" }],
                },
                {
                    key: "enableDigitalTicket",
                    label: "Abilita ticket digitale",
                    type: "toggle",
                    default: false,
                    conditions: [{ field: "mode", value: "kiosk" }],
                },
                {
                    key: "printerProfile",
                    label: "Profilo stampante",
                    type: "text",
                    placeholder: "thermal-default",
                    conditions: [{ field: "mode", value: "kiosk" }],
                },
                { key: "accentColor", label: "Colore accento", type: "color", default: "#2563EB" },
            ],
        },
        playerPath: (instanceId, token) =>
            `/webapps/queue-plus/${instanceId}?token=${token}`,
    },

    "wordpress-link": {
        appId: "wordpress-link",
        name: "WordpressLink",
        description:
            "Catalogo prodotti/contenuti da WordPress o WooCommerce con template visuali kiosk-ready.",
        category: "operations",
        icon: "Globe",
        hasCustomConfig: true,
        displayModes: ["player"],
        hasDatasets: true,
        datasetManagement: "sdk",
        configSchema: {
            schemaVersion: 1,
            fields: [
                {
                    key: "title",
                    label: "Titolo display",
                    type: "text",
                    required: true,
                    placeholder: "Catalogo prodotti",
                },
                {
                    key: "sourceKind",
                    label: "Sorgente",
                    type: "select",
                    required: true,
                    options: [
                        { value: "wordpress-posts", label: "WordPress Posts" },
                        { value: "wordpress-custom", label: "WordPress Custom Type" },
                        { value: "woocommerce-products", label: "WooCommerce Products" },
                    ],
                },
                {
                    key: "baseUrl",
                    label: "Base URL",
                    type: "url",
                    required: true,
                    placeholder: "https://example.com",
                },
                {
                    key: "postType",
                    label: "Custom Post Type",
                    type: "text",
                    placeholder: "portfolio",
                    conditions: [{ field: "sourceKind", value: "wordpress-custom" }],
                },
                {
                    key: "authMode",
                    label: "Autenticazione",
                    type: "select",
                    required: true,
                    options: [
                        { value: "none", label: "Pubblica (no auth)" },
                        { value: "basic", label: "WordPress Basic Auth" },
                        { value: "woo-consumer", label: "Woo Consumer Key/Secret" },
                    ],
                },
                {
                    key: "viewMode",
                    label: "Vista player",
                    type: "select",
                    required: true,
                    options: [
                        { value: "grid", label: "Grid" },
                        { value: "list", label: "List" },
                        { value: "carousel", label: "Carousel" },
                    ],
                },
                {
                    key: "autoScrollMode",
                    label: "Auto scroll",
                    type: "select",
                    required: true,
                    options: [
                        { value: "none", label: "Nessuno" },
                        { value: "ticker", label: "Ticker" },
                        { value: "paged", label: "Paged" },
                        { value: "carousel", label: "Carousel" },
                    ],
                },
                {
                    key: "templatePreset",
                    label: "Template",
                    type: "select",
                    required: true,
                    options: [
                        { value: "catalog-grid-rich", label: "Catalog Grid Rich" },
                        { value: "catalog-grid-compact", label: "Catalog Grid Compact" },
                        { value: "catalog-list-editorial", label: "Catalog List Editorial" },
                        { value: "chip-stream", label: "Chip Stream" },
                        { value: "carousel-hero", label: "Carousel Hero" },
                        { value: "kiosk-split", label: "Kiosk Split" },
                    ],
                },
                {
                    key: "itemsPerPage",
                    label: "Elementi max",
                    type: "number",
                    default: 24,
                },
                {
                    key: "refreshSeconds",
                    label: "Refresh (sec)",
                    type: "number",
                    default: 180,
                },
                {
                    key: "theme.accentColor",
                    label: "Colore accento",
                    type: "color",
                    default: "#0EA5E9",
                },
            ],
        },
        playerPath: (instanceId, token) =>
            `/webapps/wordpress-link/${instanceId}?token=${token}`,
    },
};

export function getRegistryEntry(appId: string): WebAppRegistryEntry | undefined {
    return WEBAPP_REGISTRY[appId];
}

export function listRegisteredApps(): WebAppRegistryEntry[] {
    return Object.values(WEBAPP_REGISTRY);
}

function toPublicRegistryEntry(entry: WebAppRegistryEntry): PublicWebAppRegistryEntry {
    return {
        appId: entry.appId,
        name: entry.name,
        description: entry.description,
        category: entry.category,
        icon: entry.icon,
        configSchema: entry.configSchema,
        hasCustomConfig: entry.hasCustomConfig,
        displayModes: entry.displayModes,
        hasDatasets: entry.hasDatasets,
        datasetManagement: entry.datasetManagement,
        datasetManagerPath: entry.datasetManagerPath,
        datasetsReadOnly: entry.datasetsReadOnly,
    };
}

export function getPublicRegistryEntry(
    appId: string,
): PublicWebAppRegistryEntry | undefined {
    const entry = getRegistryEntry(appId);
    return entry ? toPublicRegistryEntry(entry) : undefined;
}

export function listRegisteredPublicApps(): PublicWebAppRegistryEntry[] {
    return listRegisteredApps().map(toPublicRegistryEntry);
}
