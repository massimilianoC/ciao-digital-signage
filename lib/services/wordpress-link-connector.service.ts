import { createHash, randomUUID } from "node:crypto";

import { Types } from "mongoose";

import { ContentService } from "@/lib/services/content.service";
import { connectDB } from "@/lib/db/connection";
import {
    WebAppConfigModel,
    type IWebAppConfig,
    type WordpressLinkAuthMode,
    type WordpressLinkFieldBindings,
    type WordpressLinkSettings,
    type WordpressLinkSourceKind,
    type WordpressLinkTaxonomyFilter,
} from "@/lib/db/models/WebAppConfig";
import { WebAppDatasetModel } from "@/lib/db/models/WebAppDataset";
import { WebAppDatasetBindingModel } from "@/lib/db/models/WebAppDatasetBinding";
import { WebAppInstanceModel, type IWebAppInstance } from "@/lib/db/models/WebAppInstance";
import { WebAppSecretRefModel, type IWebAppSecretRef } from "@/lib/db/models/WebAppSecretRef";
import { WebAppStateModel, type IWebAppState } from "@/lib/db/models/WebAppState";

export interface WordpressLinkCredentials {
    username?: string;
    appPassword?: string;
    consumerKey?: string;
    consumerSecret?: string;
}

export interface CreateWordpressLinkConnectorInput {
    orgId: string;
    userId: string;
    name: string;
    settings: WordpressLinkSettings;
    credentials?: WordpressLinkCredentials;
    defaultDurationMs?: number;
}

export interface WordpressLinkAggregate {
    instance: IWebAppInstance;
    config: IWebAppConfig;
    state: IWebAppState;
    secretRef: IWebAppSecretRef | null;
}

export interface WordpressLinkTaxonomyTerm {
    id: number;
    slug: string;
    name: string;
    count?: number;
}

export interface WordpressLinkTaxonomyInfo {
    taxonomy: string;
    label: string;
    restBase: string;
    terms: WordpressLinkTaxonomyTerm[];
}

export interface WordpressLinkPrefetchResult {
    sourceKind: WordpressLinkSourceKind;
    taxonomies: WordpressLinkTaxonomyInfo[];
    fieldCandidates: string[];
    sampleItems: Array<Record<string, unknown>>;
    discovery: {
        siteName: string;
        namespaces: string[];
        routeSamples: string[];
        collections: Array<{
            label: string;
            sourceKind: WordpressLinkSourceKind;
            endpoint: string;
            postType?: string;
            requiresAuth?: boolean;
        }>;
    };
    warnings: string[];
    prefetchError?: string;
    attemptedEndpoint?: string;
    recommendation?: {
        sourceKind: WordpressLinkSourceKind;
        postType?: string;
        matchedEndpoint: string;
        confidence: number;
        matchedSlug?: string;
        matchedItemTitle?: string;
        matchedItemLink?: string;
        suggestedFilters: WordpressLinkTaxonomyFilter[];
        notes: string[];
    };
}

export interface WordpressLinkPublicCatalogItem {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    image: string | null;
    price: string | null;
    chips: string[];
    permalink: string | null;
    raw: Record<string, unknown>;
}

function stripHtml(input: unknown): string {
    if (typeof input !== "string") return "";
    return input
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeBaseUrl(url: string): string {
    return url.trim().replace(/\/+$/, "");
}

function createTimeoutSignal(ms: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
}

function encodeBasicSecret(username: string, appPassword: string): string {
    return Buffer.from(`${username}:${appPassword}`).toString("base64");
}

function decodeWooSecret(secretKey: string): { consumerKey: string; consumerSecret: string } | null {
    const parts = secretKey.split("|");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return { consumerKey: parts[0], consumerSecret: parts[1] };
}

function hasCredentialsForMode(mode: WordpressLinkAuthMode, credentials?: WordpressLinkCredentials): boolean {
    if (mode === "none") return true;
    if (mode === "basic") return Boolean(credentials?.username && credentials?.appPassword);
    if (mode === "woo-consumer") return Boolean(credentials?.consumerKey && credentials?.consumerSecret);
    return false;
}

function endpointPath(sourceKind: WordpressLinkSourceKind, postType?: string): string {
    if (sourceKind === "wordpress-posts") return "/wp-json/wp/v2/posts";
    if (sourceKind === "wordpress-custom") {
        const normalized = (postType || "").trim();
        if (!normalized) throw new Error("MISSING_POST_TYPE");
        return `/wp-json/wp/v2/${normalized}`;
    }
    return "/wp-json/wc/v3/products";
}

function buildAuthOptions(authMode: WordpressLinkAuthMode, secretRef: IWebAppSecretRef | null): {
    headers: HeadersInit;
    query: URLSearchParams;
} {
    const headers: HeadersInit = {};
    const query = new URLSearchParams();

    if (authMode === "basic") {
        if (!secretRef?.secretKey) {
            throw new Error("MISSING_BASIC_AUTH_SECRET");
        }
        headers.Authorization = `Basic ${secretRef.secretKey}`;
    }

    if (authMode === "woo-consumer") {
        const decoded = secretRef?.secretKey ? decodeWooSecret(secretRef.secretKey) : null;
        if (!decoded) {
            throw new Error("MISSING_WOO_CONSUMER_SECRET");
        }
        query.set("consumer_key", decoded.consumerKey);
        query.set("consumer_secret", decoded.consumerSecret);
    }

    return { headers, query };
}

async function fetchJson(url: URL, headers: HeadersInit): Promise<unknown> {
    const response = await fetch(url, {
        cache: "no-store",
        headers,
        signal: createTimeoutSignal(12_000),
    });

    if (!response.ok) {
        throw new Error(`REMOTE_FETCH_FAILED:${response.status}`);
    }

    return response.json();
}

async function tryFetchJson(url: URL, headers: HeadersInit): Promise<unknown | null> {
    try {
        return await fetchJson(url, headers);
    } catch {
        return null;
    }
}

async function discoverApiCollections(
    baseUrl: string,
    headers: HeadersInit,
    authQuery: URLSearchParams,
): Promise<WordpressLinkPrefetchResult["discovery"]> {
    const discovery: WordpressLinkPrefetchResult["discovery"] = {
        siteName: "",
        namespaces: [],
        routeSamples: [],
        collections: [
            {
                label: "WordPress Posts",
                sourceKind: "wordpress-posts",
                endpoint: "/wp-json/wp/v2/posts",
            },
            {
                label: "WooCommerce Products",
                sourceKind: "woocommerce-products",
                endpoint: "/wp-json/wc/v3/products",
                requiresAuth: true,
            },
        ],
    };

    try {
        const rootUrl = new URL(`${baseUrl}/wp-json`);
        authQuery.forEach((value, key) => rootUrl.searchParams.set(key, value));
        const rootPayload = await fetchJson(rootUrl, headers);

        if (rootPayload && typeof rootPayload === "object") {
            const root = rootPayload as Record<string, unknown>;
            discovery.siteName = toStringValue(root.name) || toStringValue(root.description) || "WordPress API";

            const namespaces = Array.isArray(root.namespaces)
                ? root.namespaces.map((entry) => toStringValue(entry)).filter(Boolean)
                : [];
            discovery.namespaces = namespaces;

            const routes = root.routes && typeof root.routes === "object"
                ? Object.keys(root.routes as Record<string, unknown>)
                : [];
            discovery.routeSamples = routes.slice(0, 40);
        }
    } catch {
        // Discovery is best-effort; prefetch still attempts direct endpoint.
    }

    try {
        const typesUrl = new URL(`${baseUrl}/wp-json/wp/v2/types`);
        authQuery.forEach((value, key) => typesUrl.searchParams.set(key, value));
        const typesPayload = await fetchJson(typesUrl, headers);

        if (typesPayload && typeof typesPayload === "object") {
            const rows = Object.entries(typesPayload as Record<string, unknown>);
            for (const [slug, entry] of rows) {
                if (!entry || typeof entry !== "object") continue;
                const row = entry as Record<string, unknown>;
                const restBase = toStringValue(row.rest_base) || slug;
                const name = toStringValue(row.name) || slug;

                if (["post", "page", "attachment"].includes(restBase)) continue;

                discovery.collections.push({
                    label: `Custom Type: ${name}`,
                    sourceKind: "wordpress-custom",
                    postType: restBase,
                    endpoint: `/wp-json/wp/v2/${restBase}`,
                });
            }
        }
    } catch {
        // Optional endpoint, ignore failures.
    }

    const unique = new Map<string, WordpressLinkPrefetchResult["discovery"]["collections"][number]>();
    for (const entry of discovery.collections) {
        unique.set(`${entry.sourceKind}:${entry.postType ?? ""}:${entry.endpoint}`, entry);
    }
    discovery.collections = Array.from(unique.values());

    return discovery;
}

function extractFieldPaths(value: unknown, prefix = "", depth = 0, maxDepth = 3): string[] {
    if (depth > maxDepth || value === null || value === undefined) return [];

    if (Array.isArray(value)) {
        if (value.length === 0) return prefix ? [prefix] : [];
        return extractFieldPaths(value[0], prefix ? `${prefix}[]` : "[]", depth + 1, maxDepth);
    }

    if (typeof value !== "object") {
        return prefix ? [prefix] : [];
    }

    const entries = Object.entries(value as Record<string, unknown>);
    const paths = prefix ? [prefix] : [];

    for (const [key, nextValue] of entries) {
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        paths.push(...extractFieldPaths(nextValue, nextPrefix, depth + 1, maxDepth));
    }

    return paths;
}

function getByPath(input: Record<string, unknown>, path: string | undefined): unknown {
    if (!path) return undefined;

    const parts = path.split(".").filter(Boolean);
    let current: unknown = input;

    for (const part of parts) {
        if (current === null || current === undefined) return undefined;

        const isArray = part.endsWith("[]");
        const key = isArray ? part.slice(0, -2) : part;

        if (typeof current !== "object") return undefined;
        const next = (current as Record<string, unknown>)[key];

        if (isArray) {
            if (!Array.isArray(next)) return undefined;
            current = next;
            continue;
        }

        current = next;
    }

    return current;
}

function toStringValue(input: unknown): string {
    if (typeof input === "string") return stripHtml(input);
    if (typeof input === "number") return String(input);
    if (typeof input === "boolean") return input ? "true" : "false";
    return "";
}

function toStringArray(input: unknown): string[] {
    if (Array.isArray(input)) {
        return input
            .map((entry) => {
                if (typeof entry === "string") return stripHtml(entry);
                if (entry && typeof entry === "object") {
                    const maybeName = (entry as Record<string, unknown>).name;
                    return toStringValue(maybeName);
                }
                return toStringValue(entry);
            })
            .filter(Boolean);
    }

    const scalar = toStringValue(input);
    return scalar ? [scalar] : [];
}

function extractWordpressImage(item: Record<string, unknown>): string | null {
    const embedded = item._embedded as Record<string, unknown> | undefined;
    if (!embedded) return null;

    const media = embedded["wp:featuredmedia"];
    if (!Array.isArray(media) || media.length === 0) return null;

    const first = media[0];
    if (!first || typeof first !== "object") return null;
    const src = (first as Record<string, unknown>).source_url;
    return typeof src === "string" ? src : null;
}

function normalizeCatalogItem(raw: Record<string, unknown>, settings: WordpressLinkSettings): WordpressLinkPublicCatalogItem {
    const b = settings.fieldBindings;

    const title = toStringValue(getByPath(raw, b.title)) || "Senza titolo";
    const subtitle = toStringValue(getByPath(raw, b.subtitle));
    const description = toStringValue(getByPath(raw, b.description));
    const image = toStringValue(getByPath(raw, b.image)) || extractWordpressImage(raw);
    const price = toStringValue(getByPath(raw, b.price)) || null;
    const chips = toStringArray(getByPath(raw, b.chips));
    const permalink = toStringValue(getByPath(raw, b.ctaHref)) || toStringValue(raw.permalink) || toStringValue(raw.link) || null;

    const rawId = raw.id;
    const id = typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : randomUUID();

    return {
        id,
        title,
        subtitle,
        description,
        image: image || null,
        price,
        chips,
        permalink,
        raw,
    };
}

function applyTaxonomyFilters(url: URL, sourceKind: WordpressLinkSourceKind, filters: WordpressLinkTaxonomyFilter[]): void {
    for (const filter of filters) {
        if (!filter.termIds || filter.termIds.length === 0) continue;

        const value = filter.termIds.join(",");

        if (sourceKind === "woocommerce-products") {
            if (filter.taxonomy === "product_cat") {
                url.searchParams.set("category", value);
                continue;
            }
            if (filter.taxonomy === "product_tag") {
                url.searchParams.set("tag", value);
                continue;
            }
        }

        url.searchParams.set(filter.taxonomy, value);
    }
}

async function loadTaxonomies(
    baseUrl: string,
    sourceKind: WordpressLinkSourceKind,
    postType: string | undefined,
    headers: HeadersInit,
    authQuery: URLSearchParams,
): Promise<WordpressLinkTaxonomyInfo[]> {
    if (sourceKind === "woocommerce-products") {
        const endpoints = [
            { taxonomy: "product_cat", label: "Product Categories", restBase: "products/categories" },
            { taxonomy: "product_tag", label: "Product Tags", restBase: "products/tags" },
        ];

        const termsByTaxonomy = await Promise.all(
            endpoints.map(async (entry) => {
                const url = new URL(`${baseUrl}/wp-json/wc/v3/${entry.restBase}`);
                authQuery.forEach((value, key) => url.searchParams.set(key, value));
                url.searchParams.set("per_page", "100");
                const payload = await fetchJson(url, headers);
                const terms = Array.isArray(payload)
                    ? payload
                        .map((term) => {
                            if (!term || typeof term !== "object") return null;
                            const id = Number((term as Record<string, unknown>).id);
                            const name = toStringValue((term as Record<string, unknown>).name);
                            const slug = toStringValue((term as Record<string, unknown>).slug);
                            const count = Number((term as Record<string, unknown>).count || 0);
                            if (!Number.isFinite(id) || !name || !slug) return null;
                            return { id, name, slug, count };
                        })
                        .filter(Boolean) as WordpressLinkTaxonomyTerm[]
                    : [];

                return {
                    taxonomy: entry.taxonomy,
                    label: entry.label,
                    restBase: entry.restBase,
                    terms,
                };
            }),
        );

        return termsByTaxonomy;
    }

    const taxonomyUrl = new URL(`${baseUrl}/wp-json/wp/v2/taxonomies`);
    authQuery.forEach((value, key) => taxonomyUrl.searchParams.set(key, value));
    taxonomyUrl.searchParams.set("type", postType || "post");
    const rawTaxonomies = await fetchJson(taxonomyUrl, headers);

    if (!rawTaxonomies || typeof rawTaxonomies !== "object") {
        return [];
    }

    const rows = Object.entries(rawTaxonomies as Record<string, unknown>);

    const resolved = await Promise.all(
        rows.map(async ([taxonomy, row]) => {
            if (!row || typeof row !== "object") return null;
            const record = row as Record<string, unknown>;
            const restBase = toStringValue(record.rest_base) || taxonomy;
            const label = toStringValue(record.name) || taxonomy;

            const termsUrl = new URL(`${baseUrl}/wp-json/wp/v2/${restBase}`);
            authQuery.forEach((value, key) => termsUrl.searchParams.set(key, value));
            termsUrl.searchParams.set("per_page", "100");
            const rawTerms = await fetchJson(termsUrl, headers);

            const terms = Array.isArray(rawTerms)
                ? rawTerms
                    .map((term) => {
                        if (!term || typeof term !== "object") return null;
                        const item = term as Record<string, unknown>;
                        const id = Number(item.id);
                        const name = toStringValue(item.name);
                        const slug = toStringValue(item.slug);
                        const count = Number(item.count || 0);
                        if (!Number.isFinite(id) || !name || !slug) return null;
                        return { id, name, slug, count };
                    })
                    .filter(Boolean) as WordpressLinkTaxonomyTerm[]
                : [];

            return {
                taxonomy,
                label,
                restBase,
                terms,
            };
        }),
    );

    return resolved.filter(Boolean) as WordpressLinkTaxonomyInfo[];
}

async function loadItems(
    settings: WordpressLinkSettings,
    secretRef: IWebAppSecretRef | null,
): Promise<Array<Record<string, unknown>>> {
    const baseUrl = normalizeBaseUrl(settings.baseUrl);
    const endpoint = endpointPath(settings.sourceKind, settings.postType);

    const { headers, query } = buildAuthOptions(settings.authMode, secretRef);
    const url = new URL(`${baseUrl}${endpoint}`);

    query.forEach((value, key) => url.searchParams.set(key, value));
    url.searchParams.set("per_page", String(Math.min(Math.max(settings.itemsPerPage, 1), 50)));
    url.searchParams.set("order", settings.order);
    url.searchParams.set("orderby", settings.orderby || "date");

    if (settings.sourceKind !== "woocommerce-products") {
        url.searchParams.set("_embed", "1");
        url.searchParams.set("status", "publish");
    }

    applyTaxonomyFilters(url, settings.sourceKind, settings.taxonomyFilters ?? []);

    const payload = await fetchJson(url, headers);
    if (!Array.isArray(payload)) return [];

    return payload.filter((entry) => entry && typeof entry === "object") as Array<Record<string, unknown>>;
}

function defaultBindings(sourceKind: WordpressLinkSourceKind): WordpressLinkFieldBindings {
    if (sourceKind === "woocommerce-products") {
        return {
            title: "name",
            subtitle: "short_description",
            description: "description",
            image: "images[].src",
            price: "price_html",
            chips: "categories",
            ctaLabel: "name",
            ctaHref: "permalink",
        };
    }

    return {
        title: "title.rendered",
        subtitle: "date",
        description: "excerpt.rendered",
        image: "_embedded.wp:featuredmedia[].source_url",
        chips: "_embedded.wp:term[]",
        ctaLabel: "title.rendered",
        ctaHref: "link",
    };
}

export async function createWordpressLinkConnector(input: CreateWordpressLinkConnectorInput): Promise<WordpressLinkAggregate> {
    await connectDB();
    const orgObjectId = new Types.ObjectId(input.orgId);

    const config = await WebAppConfigModel.create({
        orgId: orgObjectId,
        appId: "wordpress-link",
        schemaVersion: 1,
        settings: {
            ...input.settings,
            baseUrl: normalizeBaseUrl(input.settings.baseUrl),
            fieldBindings: {
                ...defaultBindings(input.settings.sourceKind),
                ...input.settings.fieldBindings,
            },
        },
        dataAccessMode: input.settings.authMode,
    });

    const state = await WebAppStateModel.create({
        orgId: orgObjectId,
        instanceId: new Types.ObjectId(),
        health: "unknown",
    });

    const instance = await WebAppInstanceModel.create({
        orgId: orgObjectId,
        appId: "wordpress-link",
        name: input.name,
        status: "active",
        version: "v0.1.0",
        configId: config._id,
        stateId: state._id,
        publicToken: randomUUID(),
        createdBy: input.userId,
        updatedBy: input.userId,
    });

    await WebAppStateModel.updateOne({ _id: state._id }, { $set: { instanceId: instance._id } });

    let secretRef: IWebAppSecretRef | null = null;
    if (input.settings.authMode !== "none") {
        if (!hasCredentialsForMode(input.settings.authMode, input.credentials)) {
            throw new Error("MISSING_REQUIRED_CREDENTIALS");
        }

        const secretKey = input.settings.authMode === "basic"
            ? encodeBasicSecret(input.credentials!.username!, input.credentials!.appPassword!)
            : `${input.credentials!.consumerKey}|${input.credentials!.consumerSecret}`;

        const provider = input.settings.authMode === "basic"
            ? "wordpress-basic-auth"
            : "woocommerce-consumer";

        secretRef = await WebAppSecretRefModel.create({
            orgId: orgObjectId,
            instanceId: instance._id,
            provider,
            secretKey,
        });
    }

    const contentService = new ContentService(input.orgId);
    const content = await contentService.createContent({
        name: `[WordpressLink] ${input.name}`,
        type: "url",
        folder: "/connectors/wordpress-link",
        tags: ["webapp", "connector", "wordpress", "woocommerce", "catalog"],
        internalWebappAsset: true,
        defaultDurationMs: input.defaultDurationMs ?? 45_000,
        config: {
            url: `/webapps/wordpress-link/${instance._id.toString()}?token=${encodeURIComponent(instance.publicToken)}`,
            urlSubtype: "webpage",
        },
    });

    await WebAppInstanceModel.updateOne({ _id: instance._id }, { $set: { contentId: content._id } });

    // Auto-create dataset (remote-mirror) + primary binding
    const datasetSlug = `wp-${instance._id.toString().slice(-8)}`;
    const dataset = await WebAppDatasetModel.create({
        orgId: orgObjectId,
        appId: "wordpress-link",
        name: `Catalogo — ${input.name}`,
        slug: datasetSlug,
        status: "active",
        schemaVersion: 1,
        datasetKind: "wordpress-catalog",
        editorMode: "raw-json",
        storageMode: "remote-mirror",
        config: {
            baseUrl: normalizeBaseUrl(input.settings.baseUrl),
            sourceKind: input.settings.sourceKind,
            postType: input.settings.postType ?? null,
            cachedItems: null,
            cachedAt: null,
        },
        summary: {},
        tags: ["wordpress", "catalog", "auto"],
        createdBy: input.userId,
        updatedBy: input.userId,
    });

    await WebAppDatasetBindingModel.create({
        orgId: orgObjectId,
        appId: "wordpress-link",
        instanceId: instance._id,
        datasetId: dataset._id,
        role: "primary",
        order: 0,
        required: true,
    });

    const [updatedInstance, updatedState] = await Promise.all([
        WebAppInstanceModel.findById(instance._id).lean<IWebAppInstance | null>(),
        WebAppStateModel.findById(state._id).lean<IWebAppState | null>(),
    ]);

    if (!updatedInstance || !updatedState) {
        throw new Error("FAILED_TO_CREATE_WEBAPP_INSTANCE");
    }

    return {
        instance: updatedInstance,
        config: config.toObject() as IWebAppConfig,
        state: updatedState,
        secretRef,
    };
}

export async function getWordpressLinkAggregateForPublicAccess(
    instanceId: string,
    token: string,
): Promise<WordpressLinkAggregate | null> {
    await connectDB();
    if (!Types.ObjectId.isValid(instanceId)) return null;

    const instance = await WebAppInstanceModel.findOne({
        _id: new Types.ObjectId(instanceId),
        appId: "wordpress-link",
        status: "active",
        publicToken: token,
    }).lean<IWebAppInstance | null>();

    if (!instance) return null;

    const [config, state, secretRef] = await Promise.all([
        WebAppConfigModel.findById(instance.configId).lean<IWebAppConfig | null>(),
        WebAppStateModel.findById(instance.stateId).lean<IWebAppState | null>(),
        WebAppSecretRefModel.findOne({ instanceId: instance._id }).lean<IWebAppSecretRef | null>(),
    ]);

    if (!config || !state) return null;

    return { instance, config, state, secretRef };
}

export async function prefetchWordpressLinkDataset(input: {
    sourceKind: WordpressLinkSourceKind;
    authMode: WordpressLinkAuthMode;
    baseUrl: string;
    postType?: string;
    credentials?: WordpressLinkCredentials;
    itemsPerPage?: number;
    taxonomyFilters?: WordpressLinkTaxonomyFilter[];
    sampleUrl?: string;
}): Promise<WordpressLinkPrefetchResult> {
    const baseUrl = normalizeBaseUrl(input.baseUrl);

    const pseudoSecret = input.authMode === "none"
        ? null
        : {
            secretKey: input.authMode === "basic"
                ? encodeBasicSecret(input.credentials?.username || "", input.credentials?.appPassword || "")
                : `${input.credentials?.consumerKey || ""}|${input.credentials?.consumerSecret || ""}`,
        } as IWebAppSecretRef;

    const { headers, query } = buildAuthOptions(input.authMode, pseudoSecret);

    const discovery = await discoverApiCollections(baseUrl, headers, query);
    const warnings: string[] = [];

    let endpoint = "";
    try {
        endpoint = endpointPath(input.sourceKind, input.postType);
    } catch {
        warnings.push("Seleziona un postType custom tra le collezioni scoperte prima di eseguire il prefetch completo.");
    }

    let sampleItems: Array<Record<string, unknown>> = [];
    let prefetchError: string | undefined;
    let attemptedEndpoint: string | undefined;

    if (endpoint) {
        const dataUrl = new URL(`${baseUrl}${endpoint}`);
        query.forEach((value, key) => dataUrl.searchParams.set(key, value));
        dataUrl.searchParams.set("per_page", String(Math.min(Math.max(input.itemsPerPage ?? 12, 1), 30)));

        if (input.sourceKind !== "woocommerce-products") {
            dataUrl.searchParams.set("_embed", "1");
            dataUrl.searchParams.set("status", "publish");
        }

        applyTaxonomyFilters(dataUrl, input.sourceKind, input.taxonomyFilters ?? []);
        attemptedEndpoint = `${dataUrl.pathname}${dataUrl.search}`;

        try {
            const samplePayload = await fetchJson(dataUrl, headers);
            sampleItems = Array.isArray(samplePayload)
                ? samplePayload.filter((entry) => entry && typeof entry === "object") as Array<Record<string, unknown>>
                : [];
        } catch (error) {
            prefetchError = error instanceof Error ? error.message : "PREFETCH_FETCH_FAILED";
            warnings.push("Endpoint principale non raggiungibile. Usa la sezione collezioni suggerite per cambiare source/post type.");
        }
    }

    let taxonomies: WordpressLinkTaxonomyInfo[] = [];
    try {
        taxonomies = await loadTaxonomies(baseUrl, input.sourceKind, input.postType, headers, query);
    } catch {
        warnings.push("Tassonomie non disponibili per questa sorgente o endpoint.");
    }

    const fieldCandidates = Array.from(
        new Set(sampleItems.flatMap((item) => extractFieldPaths(item)).filter((entry) => entry && entry.length < 120)),
    ).sort();

    let recommendation: WordpressLinkPrefetchResult["recommendation"];
    if (input.sampleUrl) {
        try {
            const sample = new URL(input.sampleUrl);
            const slug = sample.pathname.split("/").filter(Boolean).at(-1) ?? "";
            const notes: string[] = [];

            const queryBasedFilters: WordpressLinkTaxonomyFilter[] = [];
            for (const [key, value] of sample.searchParams.entries()) {
                const numericIds = value
                    .split(",")
                    .map((entry) => Number(entry))
                    .filter((entry) => Number.isInteger(entry) && entry > 0);
                if (numericIds.length > 0) {
                    queryBasedFilters.push({ taxonomy: key, termIds: numericIds });
                }
            }

            const candidates = [
                ...discovery.collections,
                {
                    label: "WordPress Posts",
                    sourceKind: "wordpress-posts" as const,
                    endpoint: "/wp-json/wp/v2/posts",
                },
            ];

            let best: WordpressLinkPrefetchResult["recommendation"] | undefined;

            for (const candidate of candidates) {
                const endpointUrl = new URL(`${baseUrl}${candidate.endpoint}`);
                query.forEach((qv, qk) => endpointUrl.searchParams.set(qk, qv));
                endpointUrl.searchParams.set("slug", slug);
                endpointUrl.searchParams.set("per_page", "5");
                endpointUrl.searchParams.set("_embed", "1");

                const payload = await tryFetchJson(endpointUrl, headers);
                if (!Array.isArray(payload) || payload.length === 0) continue;

                const first = payload[0] as Record<string, unknown>;
                const firstLink = toStringValue(first.link);
                const firstTitle = toStringValue(getByPath(first, "title.rendered")) || toStringValue(first.name);

                let confidence = 0.72;
                if (firstLink && sample.pathname && firstLink.includes(sample.pathname)) confidence = 0.95;
                else if (slug) confidence = 0.84;

                const thisRecommendation: WordpressLinkPrefetchResult["recommendation"] = {
                    sourceKind: candidate.sourceKind,
                    postType: candidate.sourceKind === "wordpress-custom" ? candidate.postType : undefined,
                    matchedEndpoint: candidate.endpoint,
                    confidence,
                    matchedSlug: slug || undefined,
                    matchedItemTitle: firstTitle || undefined,
                    matchedItemLink: firstLink || undefined,
                    suggestedFilters: queryBasedFilters,
                    notes,
                };

                if (!best || thisRecommendation.confidence > best.confidence) {
                    best = thisRecommendation;
                }
            }

            if (best) {
                if (queryBasedFilters.length > 0) {
                    best.notes.push("Sono stati rilevati parametri query numerici e proposti come filtri tassonomia.");
                }
                recommendation = best;
            } else {
                recommendation = {
                    sourceKind: input.sourceKind,
                    postType: input.postType,
                    matchedEndpoint: endpoint || "",
                    confidence: 0.3,
                    matchedSlug: slug || undefined,
                    suggestedFilters: queryBasedFilters,
                    notes: ["Nessuna corrispondenza diretta trovata: prova una collection diversa dalla discovery."],
                };
            }
        } catch {
            warnings.push("sampleUrl non valida: impossibile eseguire reverse engineering.");
        }
    }

    return {
        sourceKind: input.sourceKind,
        taxonomies,
        fieldCandidates,
        sampleItems: sampleItems.slice(0, 6),
        discovery,
        warnings,
        prefetchError,
        attemptedEndpoint,
        recommendation,
    };
}

export async function fetchWordpressLinkCatalog(
    aggregate: WordpressLinkAggregate,
): Promise<WordpressLinkPublicCatalogItem[]> {
    const settings = aggregate.config.settings as WordpressLinkSettings;

    try {
        const rawItems = await loadItems(settings, aggregate.secretRef);
        const items = rawItems.map((item) => normalizeCatalogItem(item, settings));

        // Persist snapshot for fallback (fire-and-forget)
        persistCatalogSnapshot(aggregate.instance._id, items).catch(() => { });

        return items;
    } catch (fetchError) {
        // Attempt fallback from cached snapshot
        const cached = await loadCatalogSnapshot(aggregate.instance._id);
        if (cached && cached.length > 0) return cached;
        throw fetchError;
    }
}

async function persistCatalogSnapshot(
    instanceId: Types.ObjectId,
    items: WordpressLinkPublicCatalogItem[],
): Promise<void> {
    await connectDB();
    const binding = await WebAppDatasetBindingModel.findOne({
        appId: "wordpress-link",
        instanceId,
        role: "primary",
    }).lean();
    if (!binding) return;

    await WebAppDatasetModel.updateOne(
        { _id: binding.datasetId },
        {
            $set: {
                "config.cachedItems": items,
                "config.cachedAt": new Date().toISOString(),
            },
        },
    );
}

async function loadCatalogSnapshot(
    instanceId: Types.ObjectId,
): Promise<WordpressLinkPublicCatalogItem[] | null> {
    await connectDB();
    const binding = await WebAppDatasetBindingModel.findOne({
        appId: "wordpress-link",
        instanceId,
        role: "primary",
    }).lean();
    if (!binding) return null;

    const dataset = await WebAppDatasetModel.findById(binding.datasetId).lean();
    if (!dataset) return null;

    const config = dataset.config as Record<string, unknown> | undefined;
    const cached = config?.cachedItems;
    if (!Array.isArray(cached) || cached.length === 0) return null;

    return cached as WordpressLinkPublicCatalogItem[];
}

export async function updateWordpressLinkState(input: {
    stateId: Types.ObjectId;
    health: IWebAppState["health"];
    itemCount?: number;
    error?: Error;
}): Promise<void> {
    const metrics = input.itemCount !== undefined ? { itemCount: input.itemCount } : undefined;
    const payloadHash = input.itemCount !== undefined
        ? createHash("sha1").update(String(input.itemCount)).digest("hex")
        : null;

    await WebAppStateModel.updateOne(
        { _id: input.stateId },
        {
            $set: {
                health: input.health,
                lastSyncAt: new Date(),
                lastSuccessAt: input.health === "healthy" ? new Date() : null,
                payloadHash,
                metrics,
                lastError: input.error
                    ? {
                        code: "WORDPRESSLINK_FETCH_ERROR",
                        message: input.error.message,
                        at: new Date(),
                    }
                    : null,
            },
        },
    );
}
