/**
 * dataset-templates/index.ts
 *
 * Static per-app seed templates for dataset creation.
 *
 * Rules:
 * - Templates are plain TS objects — no DB, safe to import client-side.
 * - Each app with `dataset.supportsCrud === true` SHOULD provide at least one template.
 * - If no templates exist for an app, the CMS "Nuovo dataset" button is disabled.
 * - `buildConfigFromTemplate` derives `queueName` from the slugified dataset name
 *   so queue apps never hit the "queueName required" validation error.
 */

export interface DatasetTemplate {
    /** Unique within the app */
    id: string;
    /** Display name shown in the template combo */
    name: string;
    /** Short description shown as combo tooltip / helper text */
    description: string;
    /** Stored as `dataset.datasetKind` */
    datasetKind: string;
    /** Stored as `dataset.storageMode` */
    storageMode: "inline" | "app-collection" | "remote-mirror" | "asset-ref";
    /** Stored as `dataset.editorMode`; the CMS dataset detail page uses this to pick the editor */
    editorMode: "json-schema" | "custom-react" | "raw-json";
    /** Seed config merged (and for queue apps: queueName replaced) at creation time */
    config: Record<string, unknown>;
    tags?: string[];
}

// ─── queue-plus ──────────────────────────────────────────────────────────────

const QUEUE_PLUS_TEMPLATES: DatasetTemplate[] = [
    {
        id: "queueplus-numeric-reservation",
        name: "Coda numerica (Reservation)",
        description: "Coda con numerazione progressiva e prenotazioni standard. Un operatore avanza la coda manualmente.",
        datasetKind: "queue-numeric",
        storageMode: "inline",
        editorMode: "custom-react",
        config: {
            queueName: "sportello",
            queueType: "numeric",
            serviceMode: "reservation",
            bookingEnabled: true,
            maxWaiting: 99,
            roundRobinMaxNumber: 99,
            prefix: "",
            audio: {
                enabled: true,
                speechMode: "number",
                languages: ["it-IT"],
                preChime: false,
                postChime: false,
            },
        },
        tags: ["numeric", "reservation"],
    },
    {
        id: "queueplus-numeric-roundrobin",
        name: "Coda numerica (Round Robin)",
        description: "Distribuzione automatica round-robin tra display. Ogni display avanza il proprio contatore.",
        datasetKind: "queue-numeric",
        storageMode: "inline",
        editorMode: "custom-react",
        config: {
            queueName: "sportello",
            queueType: "numeric",
            serviceMode: "round-robin",
            bookingEnabled: true,
            maxWaiting: 99,
            roundRobinMaxNumber: 99,
            prefix: "",
            audio: {
                enabled: true,
                speechMode: "number",
                languages: ["it-IT"],
                preChime: false,
                postChime: false,
            },
        },
        tags: ["numeric", "round-robin"],
    },
    {
        id: "queueplus-multigate",
        name: "Coda multigate",
        description: "Più sportelli condividono la stessa coda con lock distribuito. Ogni display acquisisce un lock per avanzare.",
        datasetKind: "queue-numeric",
        storageMode: "inline",
        editorMode: "custom-react",
        config: {
            queueName: "sportello",
            queueType: "numeric",
            serviceMode: "multigate",
            bookingEnabled: true,
            maxWaiting: 99,
            roundRobinMaxNumber: 99,
            prefix: "",
            audio: {
                enabled: true,
                speechMode: "number",
                languages: ["it-IT"],
                preChime: false,
                postChime: false,
            },
        },
        tags: ["numeric", "multigate"],
    },
    {
        id: "queueplus-alpha-reservation",
        name: "Coda alfanumerica",
        description: "Coda con codice alfanumerico (es. A01, B12). Utile per sistemi con più categorie di sportello.",
        datasetKind: "queue-alpha",
        storageMode: "inline",
        editorMode: "custom-react",
        config: {
            queueName: "sportello",
            queueType: "alpha",
            serviceMode: "reservation",
            bookingEnabled: true,
            maxWaiting: 99,
            roundRobinMaxNumber: 99,
            prefix: "A",
            audio: {
                enabled: true,
                speechMode: "both",
                languages: ["it-IT"],
                preChime: false,
                postChime: false,
            },
        },
        tags: ["alpha", "reservation"],
    },
];

// ─── queue (basic) ────────────────────────────────────────────────────────────

const QUEUE_TEMPLATES: DatasetTemplate[] = [
    {
        id: "queue-numeric-reservation",
        name: "Coda numerica",
        description: "Coda numerica con prenotazioni standard.",
        datasetKind: "queue-numeric",
        storageMode: "inline",
        editorMode: "custom-react",
        config: {
            queueName: "principale",
            queueType: "numeric",
            serviceMode: "reservation",
            bookingEnabled: true,
            maxWaiting: 99,
            roundRobinMaxNumber: 99,
            prefix: "",
        },
        tags: ["numeric"],
    },
    {
        id: "queue-numeric-roundrobin",
        name: "Coda Round Robin",
        description: "Distribuzione equa con numerazione progressiva tra display.",
        datasetKind: "queue-numeric",
        storageMode: "inline",
        editorMode: "custom-react",
        config: {
            queueName: "principale",
            queueType: "numeric",
            serviceMode: "round-robin",
            bookingEnabled: true,
            maxWaiting: 99,
            roundRobinMaxNumber: 99,
            prefix: "",
        },
        tags: ["numeric", "round-robin"],
    },
    {
        id: "queue-alpha",
        name: "Coda alfanumerica",
        description: "Coda con prefisso alfanumerico personalizzabile.",
        datasetKind: "queue-alpha",
        storageMode: "inline",
        editorMode: "custom-react",
        config: {
            queueName: "principale",
            queueType: "alpha",
            serviceMode: "reservation",
            bookingEnabled: true,
            maxWaiting: 99,
            roundRobinMaxNumber: 99,
            prefix: "A",
        },
        tags: ["alpha"],
    },
];

// ─── wordpress-link ───────────────────────────────────────────────────────────

const WORDPRESS_LINK_TEMPLATES: DatasetTemplate[] = [
    {
        id: "wplink-catalog-public",
        name: "Catalogo WordPress (pubblico)",
        description: "Connette un sito WordPress pubblico senza autenticazione. Serve un endpoint REST API accessibile.",
        datasetKind: "wordpress-catalog",
        storageMode: "remote-mirror",
        editorMode: "custom-react",
        config: {
            sourceUrl: "",
            authMode: "none",
            maxItems: 20,
            paginationEnabled: true,
            contentTypes: ["post"],
        },
        tags: ["wordpress", "public"],
    },
    {
        id: "wplink-catalog-basic",
        name: "Catalogo WordPress (autenticato)",
        description: "Connette un sito WordPress con autenticazione Basic o Application Password.",
        datasetKind: "wordpress-catalog",
        storageMode: "remote-mirror",
        editorMode: "custom-react",
        config: {
            sourceUrl: "",
            authMode: "basic",
            maxItems: 20,
            paginationEnabled: true,
            contentTypes: ["post"],
        },
        tags: ["wordpress", "authenticated"],
    },
];

// ─── registry ─────────────────────────────────────────────────────────────────

const TEMPLATES_BY_APP: Record<string, DatasetTemplate[]> = {
    queue: QUEUE_TEMPLATES,
    "queue-plus": QUEUE_PLUS_TEMPLATES,
    "wordpress-link": WORDPRESS_LINK_TEMPLATES,
};

/**
 * Returns the available seed templates for a given appId.
 * Returns an empty array for apps without templates (e.g., google-calendar,
 * which manages datasets via its own app route).
 */
export function getDatasetTemplatesForApp(appId: string): DatasetTemplate[] {
    return TEMPLATES_BY_APP[appId] ?? [];
}

/**
 * Build the seed config from a template for a given dataset name.
 *
 * Queue apps require `config.queueName` — we derive it from the slugified
 * dataset name so the user never needs to type it separately and there are
 * no collisions (same slug uniqueness guarantee as `dataset.slug`).
 */
export function buildConfigFromTemplate(
    template: DatasetTemplate,
    datasetName: string,
): Record<string, unknown> {
    const slug =
        datasetName
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 200) || "dataset";

    if (typeof template.config.queueName !== "undefined") {
        return { ...template.config, queueName: slug };
    }
    return { ...template.config };
}
