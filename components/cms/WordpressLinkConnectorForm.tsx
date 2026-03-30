"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
    DndContext,
    type DragEndEvent,
    type DragStartEvent,
    useDraggable,
    useDroppable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SourceKind = "wordpress-posts" | "wordpress-custom" | "woocommerce-products";
type AuthMode = "none" | "basic" | "woo-consumer";
type ViewMode = "grid" | "list" | "carousel";
type AutoScrollMode = "none" | "ticker" | "paged" | "carousel";

type TaxonomyInfo = {
    taxonomy: string;
    label: string;
    restBase: string;
    terms: Array<{ id: number; slug: string; name: string; count?: number }>;
};

type PrefetchPayload = {
    taxonomies: TaxonomyInfo[];
    fieldCandidates: string[];
    sampleItems: Array<Record<string, unknown>>;
    discovery: {
        siteName: string;
        namespaces: string[];
        routeSamples: string[];
        collections: Array<{
            label: string;
            sourceKind: SourceKind;
            endpoint: string;
            postType?: string;
            requiresAuth?: boolean;
        }>;
    };
    warnings: string[];
    prefetchError?: string;
    attemptedEndpoint?: string;
    recommendation?: {
        sourceKind: SourceKind;
        postType?: string;
        matchedEndpoint: string;
        confidence: number;
        matchedSlug?: string;
        matchedItemTitle?: string;
        matchedItemLink?: string;
        suggestedFilters: Array<{ taxonomy: string; termIds: number[] }>;
        notes: string[];
    };
};

type BindingSlotKey =
    | "title"
    | "subtitle"
    | "description"
    | "image"
    | "price"
    | "chips"
    | "ctaLabel"
    | "ctaHref";

const BINDING_SLOTS: Array<{ key: BindingSlotKey; label: string; required?: boolean }> = [
    { key: "title", label: "Title", required: true },
    { key: "subtitle", label: "Subtitle" },
    { key: "description", label: "Description" },
    { key: "image", label: "Image" },
    { key: "price", label: "Price" },
    { key: "chips", label: "Chips" },
    { key: "ctaLabel", label: "CTA Label" },
    { key: "ctaHref", label: "CTA Href" },
];

function DraggableFieldCandidate({ value }: { value: string }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `candidate:${value}`,
        data: { candidate: value },
    });

    return (
        <button
            ref={setNodeRef}
            type="button"
            {...listeners}
            {...attributes}
            className="rounded-full border border-border bg-background px-2 py-1 text-xs text-foreground shadow-sm transition hover:border-primary"
            style={{
                transform: CSS.Transform.toString(transform),
                opacity: isDragging ? 0.55 : 1,
                cursor: "grab",
            }}
        >
            {value}
        </button>
    );
}

function DroppableBindingSlot(props: {
    slot: { key: BindingSlotKey; label: string; required?: boolean };
    value: string;
    onClear: () => void;
}) {
    const { slot, value, onClear } = props;
    const { setNodeRef, isOver } = useDroppable({ id: `slot:${slot.key}` });

    return (
        <div
            ref={setNodeRef}
            className={`space-y-2 rounded-md border p-3 transition ${isOver ? "border-primary bg-primary/5" : "border-border bg-background"}`}
        >
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {slot.label}
                    {slot.required ? " *" : ""}
                </p>
                {value ? (
                    <button
                        type="button"
                        onClick={onClear}
                        className="text-[10px] uppercase tracking-wide text-muted-foreground hover:text-destructive"
                    >
                        Clear
                    </button>
                ) : null}
            </div>
            <p className={`rounded border px-2 py-1 font-mono text-xs ${value ? "border-primary/40 bg-primary/10 text-foreground" : "border-dashed border-border text-muted-foreground"}`}>
                {value || "Drop field here"}
            </p>
        </div>
    );
}

const TEMPLATE_OPTIONS = [
    { value: "catalog-grid-rich", label: "Catalog Grid Rich" },
    { value: "grid-master-detail", label: "Grid Master Detail" },
    { value: "catalog-grid-compact", label: "Catalog Grid Compact" },
    { value: "catalog-list-editorial", label: "Catalog List Editorial" },
    { value: "chip-stream", label: "Chip Stream" },
    { value: "carousel-hero", label: "Carousel Hero" },
    { value: "kiosk-split", label: "Kiosk Split" },
];

const DEFAULT_BINDINGS_BY_SOURCE: Record<SourceKind, Record<string, string>> = {
    "wordpress-posts": {
        title: "title.rendered",
        subtitle: "date",
        description: "excerpt.rendered",
        image: "_embedded.wp:featuredmedia[].source_url",
        price: "",
        chips: "_embedded.wp:term[]",
        ctaLabel: "title.rendered",
        ctaHref: "link",
    },
    "wordpress-custom": {
        title: "title.rendered",
        subtitle: "date",
        description: "excerpt.rendered",
        image: "_embedded.wp:featuredmedia[].source_url",
        price: "meta.price",
        chips: "_embedded.wp:term[]",
        ctaLabel: "title.rendered",
        ctaHref: "link",
    },
    "woocommerce-products": {
        title: "name",
        subtitle: "short_description",
        description: "description",
        image: "images[].src",
        price: "price_html",
        chips: "categories",
        ctaLabel: "name",
        ctaHref: "permalink",
    },
};

interface WordpressLinkConnectorFormProps {
    mode?: "create" | "edit";
    instanceId?: string;
    initialName?: string;
    initialSettings?: Record<string, unknown>;
    onSaved?: () => void | Promise<void>;
}

function StepHeader({ step, title, hint }: { step: number; title: string; hint: string }) {
    return (
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step {step}</p>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
    );
}

export function WordpressLinkConnectorForm({
    mode = "create",
    instanceId,
    initialName,
    initialSettings,
    onSaved,
}: WordpressLinkConnectorFormProps) {
    const [name, setName] = useState(initialName || "WordpressLink Catalog");
    const [title, setTitle] = useState("Catalogo prodotti");
    const [baseUrl, setBaseUrl] = useState("");
    const [sourceKind, setSourceKind] = useState<SourceKind>("woocommerce-products");
    const [postType, setPostType] = useState("product");
    const [sampleUrl, setSampleUrl] = useState("");
    const [authMode, setAuthMode] = useState<AuthMode>("none");

    const [username, setUsername] = useState("");
    const [appPassword, setAppPassword] = useState("");
    const [consumerKey, setConsumerKey] = useState("");
    const [consumerSecret, setConsumerSecret] = useState("");

    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [autoScrollMode, setAutoScrollMode] = useState<AutoScrollMode>("none");
    const [templatePreset, setTemplatePreset] = useState("catalog-grid-rich");
    const [itemsPerPage, setItemsPerPage] = useState(24);
    const [refreshSeconds, setRefreshSeconds] = useState(180);
    const [accentColor, setAccentColor] = useState("#0EA5E9");
    const [cardStyle, setCardStyle] = useState<"soft" | "outline" | "glass">("soft");
    const [detailPanelMode, setDetailPanelMode] = useState<"popup" | "sidebar">("sidebar");
    const [galleryDescriptionMax, setGalleryDescriptionMax] = useState(96);
    const [galleryChipLimit, setGalleryChipLimit] = useState(6);

    const [fieldBindings, setFieldBindings] = useState<Record<string, string>>(DEFAULT_BINDINGS_BY_SOURCE["woocommerce-products"]);
    const [prefetch, setPrefetch] = useState<PrefetchPayload | null>(null);
    const [selectedTerms, setSelectedTerms] = useState<Record<string, number[]>>({});

    const [prefetching, setPrefetching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [activeDrag, setActiveDrag] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ instanceId: string; contentId: string | null; contentUrl: string } | null>(null);
    const [savedMessage, setSavedMessage] = useState<string>("");

    const hasPrivateAuth = authMode !== "none";
    const fieldCandidates = prefetch?.fieldCandidates ?? [];

    const taxonomyFilters = useMemo(
        () =>
            Object.entries(selectedTerms)
                .filter(([, termIds]) => Array.isArray(termIds) && termIds.length > 0)
                .map(([taxonomy, termIds]) => ({ taxonomy, termIds })),
        [selectedTerms],
    );

    useEffect(() => {
        if (mode !== "edit" || !initialSettings) return;

        const settings = initialSettings;
        const nextSource = (settings.sourceKind as SourceKind) || "woocommerce-products";
        setSourceKind(nextSource);
        setName(initialName || name);
        setTitle(typeof settings.title === "string" ? settings.title : title);
        setBaseUrl(typeof settings.baseUrl === "string" ? settings.baseUrl : baseUrl);
        setPostType(typeof settings.postType === "string" ? settings.postType : postType);
        setAuthMode((settings.authMode as AuthMode) || "none");
        setViewMode((settings.viewMode as ViewMode) || "grid");
        setAutoScrollMode((settings.autoScrollMode as AutoScrollMode) || "none");
        setTemplatePreset(typeof settings.templatePreset === "string" ? settings.templatePreset : "catalog-grid-rich");
        setItemsPerPage(typeof settings.itemsPerPage === "number" ? settings.itemsPerPage : 24);
        setRefreshSeconds(typeof settings.refreshSeconds === "number" ? settings.refreshSeconds : 180);

        const theme = settings.theme as Record<string, unknown> | undefined;
        setAccentColor(typeof theme?.accentColor === "string" ? theme.accentColor : "#0EA5E9");
        setCardStyle((theme?.cardStyle as "soft" | "outline" | "glass") || "soft");
        setDetailPanelMode((theme?.detailPanelMode as "popup" | "sidebar") || "sidebar");
        setGalleryDescriptionMax(typeof theme?.galleryDescriptionMax === "number" ? theme.galleryDescriptionMax : 96);
        setGalleryChipLimit(typeof theme?.galleryChipLimit === "number" ? theme.galleryChipLimit : 6);

        const savedBindings = settings.fieldBindings as Record<string, string> | undefined;
        setFieldBindings({
            ...DEFAULT_BINDINGS_BY_SOURCE[nextSource],
            ...(savedBindings || {}),
        });

        const savedFilters = Array.isArray(settings.taxonomyFilters) ? settings.taxonomyFilters as Array<{ taxonomy: string; termIds: number[] }> : [];
        const nextSelected: Record<string, number[]> = {};
        for (const filter of savedFilters) {
            if (filter?.taxonomy && Array.isArray(filter.termIds)) {
                nextSelected[filter.taxonomy] = filter.termIds;
            }
        }
        setSelectedTerms(nextSelected);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, initialSettings, initialName]);

    function resetBindingsFromSource(nextSource: SourceKind) {
        setFieldBindings(DEFAULT_BINDINGS_BY_SOURCE[nextSource]);
    }

    function applyDiscoveredCollection(entry: {
        sourceKind: SourceKind;
        postType?: string;
    }) {
        setSourceKind(entry.sourceKind);
        if (entry.sourceKind === "wordpress-custom" && entry.postType) {
            setPostType(entry.postType);
        }
        resetBindingsFromSource(entry.sourceKind);
    }

    function toggleTerm(taxonomy: string, termId: number) {
        setSelectedTerms((previous) => {
            const prev = previous[taxonomy] ?? [];
            const next = prev.includes(termId)
                ? prev.filter((id) => id !== termId)
                : [...prev, termId];
            return { ...previous, [taxonomy]: next };
        });
    }

    function handleDragStart(event: DragStartEvent) {
        const activeId = String(event.active.id);
        if (activeId.startsWith("candidate:")) {
            setActiveDrag(activeId.slice("candidate:".length));
        }
    }

    function handleDragEnd(event: DragEndEvent) {
        const activeId = String(event.active.id);
        const overId = event.over ? String(event.over.id) : "";
        setActiveDrag(null);

        if (!activeId.startsWith("candidate:")) return;
        if (!overId.startsWith("slot:")) return;

        const fieldPath = activeId.slice("candidate:".length);
        const slotKey = overId.slice("slot:".length) as BindingSlotKey;

        setFieldBindings((previous) => ({ ...previous, [slotKey]: fieldPath }));
    }

    async function handlePrefetch() {
        setError(null);
        setPrefetching(true);
        try {
            const response = await fetch("/api/webapps/wordpress-link/prefetch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sourceKind,
                    authMode,
                    baseUrl,
                    sampleUrl: sampleUrl.trim() || undefined,
                    postType: sourceKind === "wordpress-custom" ? postType : undefined,
                    itemsPerPage: Math.min(itemsPerPage, 20),
                    taxonomyFilters,
                    credentials: hasPrivateAuth
                        ? {
                            username: authMode === "basic" ? username : undefined,
                            appPassword: authMode === "basic" ? appPassword : undefined,
                            consumerKey: authMode === "woo-consumer" ? consumerKey : undefined,
                            consumerSecret: authMode === "woo-consumer" ? consumerSecret : undefined,
                        }
                        : undefined,
                }),
            });

            if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as { error?: string | { fieldErrors?: Record<string, string[]> } } | null;
                if (typeof payload?.error === "string") throw new Error(payload.error);
                if (payload?.error && typeof payload.error === "object" && payload.error.fieldErrors) {
                    throw new Error(Object.values(payload.error.fieldErrors).flat().join(" "));
                }
                throw new Error("Prefetch non riuscito");
            }

            const payload = (await response.json()) as PrefetchPayload;
            setPrefetch(payload);

            if (payload.recommendation?.suggestedFilters?.length) {
                const nextSelected: Record<string, number[]> = {};
                for (const filter of payload.recommendation.suggestedFilters) {
                    nextSelected[filter.taxonomy] = filter.termIds;
                }
                setSelectedTerms((previous) => ({ ...previous, ...nextSelected }));
            }

            if (!payload.fieldCandidates.includes(fieldBindings.title)) {
                resetBindingsFromSource(sourceKind);
            }
        } catch (prefetchError) {
            setError(prefetchError instanceof Error ? prefetchError.message : "Prefetch non riuscito");
        } finally {
            setPrefetching(false);
        }
    }

    async function handleSave() {
        setError(null);
        setSuccess(null);
        setSavedMessage("");
        setSaving(true);

        try {
            const requestBody = {
                name,
                defaultDurationMs: 45000,
                settings: {
                    sourceKind,
                    authMode,
                    baseUrl,
                    title,
                    postType: sourceKind === "wordpress-custom" ? postType : undefined,
                    itemsPerPage,
                    order: "desc",
                    orderby: sourceKind === "woocommerce-products" ? "date" : "date",
                    refreshSeconds,
                    viewMode,
                    autoScrollMode,
                    templatePreset,
                    taxonomyFilters,
                    fieldBindings,
                    theme: {
                        accentColor,
                        cardStyle,
                        detailPanelMode,
                        galleryDescriptionMax,
                        galleryChipLimit,
                    },
                },
                credentials: hasPrivateAuth
                    ? {
                        username: authMode === "basic" ? username : undefined,
                        appPassword: authMode === "basic" ? appPassword : undefined,
                        consumerKey: authMode === "woo-consumer" ? consumerKey : undefined,
                        consumerSecret: authMode === "woo-consumer" ? consumerSecret : undefined,
                    }
                    : undefined,
            };

            const endpoint = mode === "edit" && instanceId
                ? `/api/webapps/instances/${instanceId}`
                : "/api/webapps/wordpress-link";

            const method = mode === "edit" ? "PATCH" : "POST";

            const response = await fetch(endpoint, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(mode === "edit" ? { name, settings: requestBody.settings } : requestBody),
            });

            if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as { error?: string | { fieldErrors?: Record<string, string[]> } } | null;
                if (typeof payload?.error === "string") throw new Error(payload.error);
                if (payload?.error && typeof payload.error === "object" && payload.error.fieldErrors) {
                    throw new Error(Object.values(payload.error.fieldErrors).flat().join(" "));
                }
                throw new Error(mode === "edit" ? "Aggiornamento configurazione non riuscito" : "Creazione connector non riuscita");
            }

            if (mode === "edit") {
                setSavedMessage("✓ Configurazione aggiornata");
                await onSaved?.();
            } else {
                const payload = (await response.json()) as { instanceId: string; contentId: string | null; contentUrl: string };
                setSuccess(payload);
            }
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : "Operazione non riuscita");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <StepHeader
                step={1}
                title="Identità istanza"
                hint="Imposta nome istanza e titolo visibile nel player."
            />

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                    <Label htmlFor="connector-name">Nome istanza</Label>
                    <Input id="connector-name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="connector-title">Titolo player</Label>
                    <Input id="connector-title" value={title} onChange={(event) => setTitle(event.target.value)} />
                </div>
            </div>

            <StepHeader
                step={2}
                title="Sorgente dati e accesso"
                hint="Scegli endpoint WordPress/WooCommerce e modalità di autenticazione."
            />

            <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                    <Label htmlFor="base-url">Base URL</Label>
                    <Input id="base-url" placeholder="https://example.com" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                    <Label htmlFor="sample-url">URL esempio prodotto/articolo (reverse engineering)</Label>
                    <Input
                        id="sample-url"
                        placeholder="https://utensiltre.it/portfolio-items/frese-a-finire/?portfolioCats=43"
                        value={sampleUrl}
                        onChange={(event) => setSampleUrl(event.target.value)}
                    />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                    <Label htmlFor="source-kind">Sorgente</Label>
                    <select
                        id="source-kind"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={sourceKind}
                        onChange={(event) => {
                            const next = event.target.value as SourceKind;
                            setSourceKind(next);
                            resetBindingsFromSource(next);
                        }}
                    >
                        <option value="wordpress-posts">WordPress Posts</option>
                        <option value="wordpress-custom">WordPress Custom Type</option>
                        <option value="woocommerce-products">WooCommerce Products</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="post-type">Post type custom</Label>
                    <Input
                        id="post-type"
                        placeholder="portfolio"
                        value={postType}
                        onChange={(event) => setPostType(event.target.value)}
                        disabled={sourceKind !== "wordpress-custom"}
                    />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                    <Label htmlFor="auth-mode">Auth mode</Label>
                    <select
                        id="auth-mode"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={authMode}
                        onChange={(event) => setAuthMode(event.target.value as AuthMode)}
                    >
                        <option value="none">None (public endpoint)</option>
                        <option value="basic">WordPress Basic Auth</option>
                        <option value="woo-consumer">Woo Consumer Key/Secret</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="view-mode">View mode</Label>
                    <select
                        id="view-mode"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={viewMode}
                        onChange={(event) => setViewMode(event.target.value as ViewMode)}
                    >
                        <option value="grid">Grid</option>
                        <option value="list">List</option>
                        <option value="carousel">Carousel</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="auto-scroll">Auto scroll</Label>
                    <select
                        id="auto-scroll"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={autoScrollMode}
                        onChange={(event) => setAutoScrollMode(event.target.value as AutoScrollMode)}
                    >
                        <option value="none">None</option>
                        <option value="ticker">Ticker</option>
                        <option value="paged">Paged</option>
                        <option value="carousel">Carousel</option>
                    </select>
                </div>
            </div>

            {authMode === "basic" ? (
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                        <Label htmlFor="wp-user">Username</Label>
                        <Input id="wp-user" value={username} onChange={(event) => setUsername(event.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="wp-pass">Application Password</Label>
                        <Input id="wp-pass" type="password" value={appPassword} onChange={(event) => setAppPassword(event.target.value)} />
                    </div>
                </div>
            ) : null}

            {authMode === "woo-consumer" ? (
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                        <Label htmlFor="woo-key">Consumer Key</Label>
                        <Input id="woo-key" value={consumerKey} onChange={(event) => setConsumerKey(event.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="woo-secret">Consumer Secret</Label>
                        <Input id="woo-secret" type="password" value={consumerSecret} onChange={(event) => setConsumerSecret(event.target.value)} />
                    </div>
                </div>
            ) : null}

            <StepHeader
                step={3}
                title="Template e presentazione"
                hint="Definisci layout catalogo, stile card e comportamento master-detail."
            />

            <div className="grid gap-4 md:grid-cols-5">
                <div className="space-y-1">
                    <Label htmlFor="template">Template preset</Label>
                    <select
                        id="template"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={templatePreset}
                        onChange={(event) => setTemplatePreset(event.target.value)}
                    >
                        {TEMPLATE_OPTIONS.map((entry) => (
                            <option key={entry.value} value={entry.value}>
                                {entry.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="items">Items max</Label>
                    <Input id="items" type="number" min={1} max={50} value={itemsPerPage} onChange={(event) => setItemsPerPage(Number(event.target.value) || 24)} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="refresh">Refresh sec</Label>
                    <Input id="refresh" type="number" min={30} max={3600} value={refreshSeconds} onChange={(event) => setRefreshSeconds(Number(event.target.value) || 180)} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="accent">Accent color</Label>
                    <Input id="accent" type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="card-style">Card style</Label>
                    <select
                        id="card-style"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={cardStyle}
                        onChange={(event) => setCardStyle(event.target.value as "soft" | "outline" | "glass")}
                    >
                        <option value="soft">Soft</option>
                        <option value="outline">Outline</option>
                        <option value="glass">Glass</option>
                    </select>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                    <Label htmlFor="detail-panel-mode">Master detail panel</Label>
                    <select
                        id="detail-panel-mode"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={detailPanelMode}
                        onChange={(event) => setDetailPanelMode(event.target.value as "popup" | "sidebar")}
                    >
                        <option value="sidebar">Sidebar</option>
                        <option value="popup">Popup</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="gallery-description-max">Descrizione breve (max chars)</Label>
                    <Input
                        id="gallery-description-max"
                        type="number"
                        min={40}
                        max={240}
                        value={galleryDescriptionMax}
                        onChange={(event) => setGalleryDescriptionMax(Number(event.target.value) || 96)}
                    />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="gallery-chip-limit">Tag/Categorie visibili</Label>
                    <Input
                        id="gallery-chip-limit"
                        type="number"
                        min={1}
                        max={12}
                        value={galleryChipLimit}
                        onChange={(event) => setGalleryChipLimit(Number(event.target.value) || 6)}
                    />
                </div>
            </div>

            <StepHeader
                step={4}
                title="Discovery e prefetch API"
                hint="Analizza endpoint e struttura JSON per guidare mapping e filtri."
            />

            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Prefetch dataset esterno</h3>
                    <Button type="button" variant="outline" onClick={handlePrefetch} disabled={prefetching}>
                        {prefetching ? "Prefetch..." : "Esegui prefetch"}
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    Recupera tassonomie e campione campi dal dataset remoto per configurare mapping e filtri senza esporre segreti al player.
                </p>

                {prefetch ? (
                    <div className="space-y-4 pt-2">
                        <div className="rounded-md border border-border bg-background p-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">API discovery</p>
                            <p className="mt-1 text-xs text-foreground/90">
                                {prefetch.discovery.siteName || "WordPress API"}
                                {prefetch.attemptedEndpoint ? ` · endpoint: ${prefetch.attemptedEndpoint}` : ""}
                            </p>

                            {prefetch.prefetchError ? (
                                <p className="mt-2 text-xs text-destructive">
                                    Endpoint fetch error: {prefetch.prefetchError}
                                </p>
                            ) : null}

                            {prefetch.recommendation ? (
                                <div className="mt-3 rounded border border-primary/25 bg-primary/5 p-3">
                                    <p className="text-xs font-medium uppercase tracking-wide text-primary">Suggerimento automatico da URL esempio</p>
                                    <p className="mt-1 text-xs text-foreground/90">
                                        Source: {prefetch.recommendation.sourceKind}
                                        {prefetch.recommendation.postType ? ` · postType: ${prefetch.recommendation.postType}` : ""}
                                        {` · confidence ${(prefetch.recommendation.confidence * 100).toFixed(0)}%`}
                                    </p>
                                    {prefetch.recommendation.matchedItemTitle ? (
                                        <p className="mt-1 text-xs text-muted-foreground">Match: {prefetch.recommendation.matchedItemTitle}</p>
                                    ) : null}
                                    {prefetch.recommendation.suggestedFilters.length > 0 ? (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Filtri suggeriti: {prefetch.recommendation.suggestedFilters.map((f) => `${f.taxonomy}=${f.termIds.join(",")}`).join(" · ")}
                                        </p>
                                    ) : null}
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => {
                                                applyDiscoveredCollection({
                                                    sourceKind: prefetch.recommendation!.sourceKind,
                                                    postType: prefetch.recommendation!.postType,
                                                });
                                            }}
                                        >
                                            Applica suggerimento
                                        </Button>
                                    </div>
                                </div>
                            ) : null}

                            {prefetch.warnings.length > 0 ? (
                                <ul className="mt-2 list-disc pl-4 text-xs text-amber-700">
                                    {prefetch.warnings.map((warning, index) => (
                                        <li key={`${warning}-${index}`}>{warning}</li>
                                    ))}
                                </ul>
                            ) : null}

                            <div className="mt-3 space-y-2">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Collezioni disponibili</p>
                                <div className="flex flex-wrap gap-2">
                                    {prefetch.discovery.collections.map((collection) => (
                                        <button
                                            key={`${collection.sourceKind}:${collection.postType ?? ""}:${collection.endpoint}`}
                                            type="button"
                                            onClick={() => applyDiscoveredCollection(collection)}
                                            className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs hover:border-primary hover:bg-primary/10"
                                        >
                                            {collection.label}
                                            {collection.postType ? ` (${collection.postType})` : ""}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {prefetch.discovery.routeSamples.length > 0 ? (
                                <details className="mt-3">
                                    <summary className="cursor-pointer text-xs text-muted-foreground">Route sample (abbreviate)</summary>
                                    <pre className="mt-2 max-h-48 overflow-auto text-[11px] text-muted-foreground">
                                        {JSON.stringify(prefetch.discovery.routeSamples.slice(0, 25), null, 2)}
                                    </pre>
                                </details>
                            ) : null}
                        </div>

                        <div className="grid gap-2 md:grid-cols-2">
                            {prefetch.taxonomies.map((taxonomy) => (
                                <div key={taxonomy.taxonomy} className="rounded-md border border-border bg-background p-3">
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{taxonomy.label}</p>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {taxonomy.terms.slice(0, 30).map((term) => {
                                            const active = (selectedTerms[taxonomy.taxonomy] ?? []).includes(term.id);
                                            return (
                                                <button
                                                    key={term.id}
                                                    type="button"
                                                    onClick={() => toggleTerm(taxonomy.taxonomy, term.id)}
                                                    className={`rounded-full border px-2 py-0.5 text-xs ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted hover:bg-accent"}`}
                                                >
                                                    {term.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Field mapping canvas (drag-and-drop)</p>
                            <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                                <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                                    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fields palette</p>
                                        <div className="flex flex-wrap gap-2">
                                            {fieldCandidates.length > 0 ? (
                                                fieldCandidates.map((candidate) => (
                                                    <DraggableFieldCandidate key={candidate} value={candidate} />
                                                ))
                                            ) : (
                                                <p className="text-xs text-muted-foreground">Esegui prefetch per popolare i campi trascinabili.</p>
                                            )}
                                        </div>
                                        {activeDrag ? (
                                            <p className="text-xs text-primary">Dragging: {activeDrag}</p>
                                        ) : null}
                                    </div>

                                    <div className="space-y-3 rounded-md border border-border bg-background p-3">
                                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Template slots</p>
                                        <div className="grid gap-2 md:grid-cols-2">
                                            {BINDING_SLOTS.map((slot) => (
                                                <DroppableBindingSlot
                                                    key={slot.key}
                                                    slot={slot}
                                                    value={fieldBindings[slot.key] ?? ""}
                                                    onClear={() => setFieldBindings((previous) => ({ ...previous, [slot.key]: "" }))}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </DndContext>

                            <div className="grid gap-3 md:grid-cols-2">
                                {BINDING_SLOTS.map((slot) => (
                                    <div key={slot.key} className="space-y-1">
                                        <Label htmlFor={`binding-${slot.key}`}>{slot.label} ({slot.key})</Label>
                                        <Input
                                            id={`binding-${slot.key}`}
                                            list={`fields-${slot.key}`}
                                            value={fieldBindings[slot.key] ?? ""}
                                            onChange={(event) => setFieldBindings((previous) => ({ ...previous, [slot.key]: event.target.value }))}
                                        />
                                        <datalist id={`fields-${slot.key}`}>
                                            {fieldCandidates.map((candidate) => (
                                                <option key={candidate} value={candidate} />
                                            ))}
                                        </datalist>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-md border border-border bg-background p-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sample payload</p>
                            <pre className="mt-2 max-h-64 overflow-auto text-xs text-muted-foreground">
                                {JSON.stringify(prefetch.sampleItems.slice(0, 2), null, 2)}
                            </pre>
                        </div>
                    </div>
                ) : null}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {savedMessage ? <p className="text-sm text-emerald-600">{savedMessage}</p> : null}

            {success ? (
                <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                    <p className="font-medium text-emerald-50">WordpressLink creato correttamente.</p>
                    <p className="mt-1 text-emerald-100">Content ID: {success.contentId ?? "n/a"}</p>
                    <p className="mt-1 break-all text-emerald-100">URL player: {success.contentUrl}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Link href="/content">
                            <Button type="button" variant="outline">Vai alla libreria</Button>
                        </Link>
                        <Link href={success.contentId ? `/content?media=${success.contentId}` : "/content"}>
                            <Button type="button">Apri contenuto creato</Button>
                        </Link>
                    </div>
                </div>
            ) : null}

            <StepHeader
                step={5}
                title={mode === "edit" ? "Salva aggiornamenti" : "Crea istanza"}
                hint={mode === "edit" ? "Conferma tutte le impostazioni nel tab Avanzate." : "Genera istanza, content URL e attiva il player."}
            />

            <div className="flex gap-2">
                <Button type="button" onClick={handleSave} disabled={saving}>
                    {saving ? (mode === "edit" ? "Salvataggio..." : "Creazione...") : (mode === "edit" ? "Salva configurazione" : "Crea connector")}
                </Button>
                <Button type="button" variant="outline" onClick={() => resetBindingsFromSource(sourceKind)}>
                    Ripristina binding consigliati
                </Button>
            </div>
        </div>
    );
}
