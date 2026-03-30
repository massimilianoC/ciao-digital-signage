"use client";

import { ChevronLeft, ChevronRight, RefreshCw, Tag } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type ViewMode = "grid" | "list" | "carousel";
type AutoScrollMode = "none" | "ticker" | "paged" | "carousel";

type CatalogItem = {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    image: string | null;
    price: string | null;
    chips: string[];
    permalink: string | null;
};

type Payload = {
    title: string;
    viewMode: ViewMode;
    autoScrollMode: AutoScrollMode;
    templatePreset: string;
    refreshSeconds: number;
    itemCount: number;
    theme?: {
        accentColor?: string;
        cardStyle?: "soft" | "outline" | "glass";
        detailPanelMode?: "popup" | "sidebar";
        galleryDescriptionMax?: number;
        galleryChipLimit?: number;
    };
    items: CatalogItem[];
    lastSyncAt: string;
};

function styleForCard(cardStyle: string | undefined): string {
    if (cardStyle === "outline") {
        return "bg-white/5 border border-white/40";
    }

    if (cardStyle === "glass") {
        return "bg-white/10 border border-white/30 backdrop-blur-md";
    }

    return "bg-slate-900/70 border border-slate-700";
}

function trimText(value: string, max = 180): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}...`;
}

export function WordpressLinkApp({ instanceId, token }: { instanceId: string; token: string }) {
    const [payload, setPayload] = useState<Payload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [detailItemId, setDetailItemId] = useState<string | null>(null);

    const listRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        let timer: number | null = null;

        const load = async () => {
            try {
                if (!cancelled) setLoading(true);

                const response = await fetch(`/api/public/webapps/wordpress-link/${instanceId}/catalog?token=${encodeURIComponent(token)}`, {
                    cache: "no-store",
                });

                if (!response.ok) {
                    const body = (await response.json().catch(() => null)) as { error?: string } | null;
                    throw new Error(body?.error ?? "Unable to load catalog");
                }

                const data = (await response.json()) as Payload;
                if (cancelled) return;

                setPayload(data);
                setError(null);
                setSelectedIndex((prev) => {
                    if (data.items.length === 0) return 0;
                    return Math.min(prev, data.items.length - 1);
                });

                timer = window.setTimeout(load, Math.max(data.refreshSeconds, 30) * 1000);
            } catch (loadError) {
                if (!cancelled) {
                    setError(loadError instanceof Error ? loadError.message : "Unable to load catalog");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();

        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
        };
    }, [instanceId, token]);

    useEffect(() => {
        if (!payload || payload.items.length === 0) return;
        if (payload.autoScrollMode !== "carousel") return;
        if (payload.viewMode !== "carousel") return;

        const timer = window.setInterval(() => {
            setSelectedIndex((previous) => (previous + 1) % payload.items.length);
        }, 5000);

        return () => window.clearInterval(timer);
    }, [payload]);

    useEffect(() => {
        if (!payload || payload.items.length === 0) return;
        if (payload.autoScrollMode !== "ticker" && payload.autoScrollMode !== "paged") return;

        const timer = window.setInterval(() => {
            if (!listRef.current) return;
            const amount = payload.autoScrollMode === "ticker" ? 80 : listRef.current.clientHeight * 0.7;
            listRef.current.scrollBy({ top: amount, behavior: "smooth" });
        }, payload.autoScrollMode === "ticker" ? 1800 : 4200);

        return () => window.clearInterval(timer);
    }, [payload]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!payload || payload.items.length === 0) return;

            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                setSelectedIndex((previous) => (previous + 1) % payload.items.length);
            }

            if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                setSelectedIndex((previous) => (previous - 1 + payload.items.length) % payload.items.length);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [payload]);

    const activeItem = useMemo(() => {
        if (!payload || payload.items.length === 0) return null;
        return payload.items[Math.max(0, Math.min(selectedIndex, payload.items.length - 1))] ?? null;
    }, [payload, selectedIndex]);

    const detailItem = useMemo(() => {
        if (!payload || !detailItemId) return null;
        return payload.items.find((item) => item.id === detailItemId) ?? null;
    }, [payload, detailItemId]);

    const accentColor = payload?.theme?.accentColor || "#0EA5E9";
    const cardClass = styleForCard(payload?.theme?.cardStyle);
    const detailPanelMode = payload?.theme?.detailPanelMode || "sidebar";
    const galleryDescriptionMax = Math.max(40, Math.min(payload?.theme?.galleryDescriptionMax ?? 96, 240));
    const galleryChipLimit = Math.max(1, Math.min(payload?.theme?.galleryChipLimit ?? 6, 12));
    const isMasterDetailTemplate = payload?.templatePreset === "grid-master-detail";

    const openDetail = (item: CatalogItem) => {
        setDetailItemId(item.id);
        const index = payload?.items.findIndex((entry) => entry.id === item.id) ?? -1;
        if (index >= 0) setSelectedIndex(index);
    };

    const closeDetail = () => {
        setDetailItemId(null);
    };

    return (
        <main
            data-testid="wordpress-link-app"
            className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,_#1e3a8a,_#0f172a_45%,_#020617)] text-white"
            style={{
                ["--wl-accent" as string]: accentColor,
            }}
        >
            <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-5 py-5 lg:px-8">
                <header className="rounded-3xl border border-white/15 bg-white/5 px-5 py-4 backdrop-blur">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">WordpressLink Kiosk</p>
                            <h1 className="text-2xl font-semibold md:text-3xl">{payload?.title ?? "Catalogo"}</h1>
                        </div>
                        <div className="rounded-2xl border border-white/20 bg-black/20 px-3 py-2 text-xs text-slate-200">
                            <div className="flex items-center gap-2">
                                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                                <span>{loading ? "Sync in corso" : "Aggiornato"}</span>
                            </div>
                            <div className="mt-1 opacity-85">{payload?.lastSyncAt ? new Date(payload.lastSyncAt).toLocaleTimeString("it-IT") : "--"}</div>
                        </div>
                    </div>
                </header>

                {error ? (
                    <section className="rounded-2xl border border-red-400/40 bg-red-500/10 p-6 text-sm text-red-100">
                        Errore catalogo: {error}
                    </section>
                ) : null}

                {!error && payload && payload.items.length === 0 ? (
                    <section className="rounded-2xl border border-white/15 bg-white/5 p-8 text-center text-slate-200">
                        Nessun elemento disponibile con i filtri correnti.
                    </section>
                ) : null}

                {!error && payload && payload.items.length > 0 && payload.viewMode === "carousel" && activeItem ? (
                    <section className={`relative flex flex-1 flex-col overflow-hidden rounded-3xl ${cardClass}`}>
                        {activeItem.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={activeItem.image} alt={activeItem.title} className="h-[52vh] w-full object-cover" />
                        ) : (
                            <div className="h-[52vh] w-full bg-slate-900/40" />
                        )}

                        <div className="space-y-3 p-6">
                            <h2 className="text-3xl font-bold" style={{ color: "var(--wl-accent)" }}>{activeItem.title}</h2>
                            {activeItem.subtitle ? <p className="text-sm text-slate-200">{trimText(activeItem.subtitle, 120)}</p> : null}
                            {activeItem.description ? <p className="text-sm text-slate-300">{trimText(activeItem.description, 280)}</p> : null}
                            <div className="flex flex-wrap gap-2">
                                {activeItem.chips.slice(0, 6).map((chip) => (
                                    <span key={chip} className="rounded-full bg-white/10 px-3 py-1 text-xs">
                                        <Tag className="mr-1 inline h-3 w-3" />
                                        {chip}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-4">
                            <button
                                type="button"
                                className="rounded-full border border-white/30 bg-black/30 p-2"
                                onClick={() => setSelectedIndex((previous) => (previous - 1 + payload.items.length) % payload.items.length)}
                            >
                                <ChevronLeft className="h-5 w-5" />
                            </button>
                            <button
                                type="button"
                                className="rounded-full border border-white/30 bg-black/30 p-2"
                                onClick={() => setSelectedIndex((previous) => (previous + 1) % payload.items.length)}
                            >
                                <ChevronRight className="h-5 w-5" />
                            </button>
                        </div>
                    </section>
                ) : null}

                {!error && payload && payload.items.length > 0 && payload.viewMode !== "carousel" ? (
                    <section ref={listRef} className="h-[72vh] overflow-auto rounded-3xl border border-white/15 bg-white/5 p-4">
                        <div className={payload.viewMode === "grid" ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
                            {payload.items.map((item, index) => (
                                <article
                                    key={item.id}
                                    className={`rounded-2xl p-4 transition ${cardClass} ${selectedIndex === index ? "ring-2 ring-cyan-300" : ""}`}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    onClick={() => isMasterDetailTemplate && openDetail(item)}
                                >
                                    <div className="flex gap-3">
                                        {item.image ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={item.image} alt={item.title} className="h-20 w-20 rounded-xl object-cover" />
                                        ) : null}
                                        <div className="min-w-0 flex-1">
                                            <h3 className="truncate text-base font-semibold" style={{ color: "var(--wl-accent)" }}>{item.title}</h3>
                                            {item.price ? <p className="text-sm font-medium text-emerald-300">{item.price}</p> : null}
                                            {item.subtitle ? <p className="text-xs text-slate-300">{trimText(item.subtitle, 80)}</p> : null}
                                        </div>
                                    </div>

                                    <p className="mt-3 text-sm text-slate-200">
                                        {trimText(item.description || item.subtitle || "Descrizione non disponibile", payload.viewMode === "grid" ? galleryDescriptionMax : 200)}
                                    </p>

                                    <div className="mt-3">
                                        <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">Tag / Categorie</p>
                                        {item.chips.length > 0 ? (
                                            <div className="flex flex-wrap gap-1.5">
                                                {item.chips.slice(0, galleryChipLimit).map((chip) => (
                                                    <span key={chip} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">
                                                        {chip}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-slate-400">Nessun tag/categoria</p>
                                        )}
                                    </div>

                                    {isMasterDetailTemplate ? (
                                        <div className="mt-3 flex items-center justify-between text-xs text-cyan-200">
                                            <span>Apri scheda prodotto</span>
                                            <ChevronRight className="h-4 w-4" />
                                        </div>
                                    ) : null}
                                </article>
                            ))}
                        </div>
                    </section>
                ) : null}

                {!error && payload && isMasterDetailTemplate && detailItem && detailPanelMode === "popup" ? (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                        <div className={`relative max-h-[88vh] w-full max-w-3xl overflow-auto rounded-2xl p-5 ${cardClass}`}>
                            <button
                                type="button"
                                onClick={closeDetail}
                                className="absolute right-3 top-3 rounded-full border border-white/30 bg-black/30 px-3 py-1 text-xs"
                            >
                                Chiudi
                            </button>
                            <div className="space-y-3">
                                <button type="button" onClick={closeDetail} className="inline-flex items-center gap-1 text-xs text-cyan-200">
                                    <ChevronLeft className="h-4 w-4" />
                                    Torna alla lista
                                </button>
                                <h2 className="text-2xl font-bold" style={{ color: "var(--wl-accent)" }}>{detailItem.title}</h2>
                                {detailItem.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={detailItem.image} alt={detailItem.title} className="h-72 w-full rounded-xl object-cover" />
                                ) : null}
                                {detailItem.price ? <p className="text-lg font-semibold text-emerald-300">{detailItem.price}</p> : null}
                                <p className="text-sm text-slate-200">{trimText(detailItem.description || detailItem.subtitle || "Descrizione non disponibile", 420)}</p>
                                <div className="flex flex-wrap gap-2">
                                    {detailItem.chips.map((chip) => (
                                        <span key={chip} className="rounded-full bg-white/10 px-3 py-1 text-xs">{chip}</span>
                                    ))}
                                </div>
                                {detailItem.permalink ? (
                                    <a href={detailItem.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-md border border-white/30 bg-white/10 px-3 py-1 text-xs hover:bg-white/20">
                                        Apri pagina prodotto
                                    </a>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : null}

                {!error && payload && isMasterDetailTemplate && detailItem && detailPanelMode === "sidebar" ? (
                    <aside className={`fixed right-0 top-0 z-40 h-screen w-full max-w-md overflow-auto border-l border-white/20 p-5 ${cardClass}`}>
                        <div className="space-y-3">
                            <button type="button" onClick={closeDetail} className="inline-flex items-center gap-1 text-xs text-cyan-200">
                                <ChevronLeft className="h-4 w-4" />
                                Torna alla lista
                            </button>
                            <h2 className="text-xl font-bold" style={{ color: "var(--wl-accent)" }}>{detailItem.title}</h2>
                            {detailItem.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={detailItem.image} alt={detailItem.title} className="h-56 w-full rounded-xl object-cover" />
                            ) : null}
                            {detailItem.price ? <p className="text-base font-semibold text-emerald-300">{detailItem.price}</p> : null}
                            <p className="text-sm text-slate-200">{trimText(detailItem.description || detailItem.subtitle || "Descrizione non disponibile", 360)}</p>
                            <div className="flex flex-wrap gap-2">
                                {detailItem.chips.map((chip) => (
                                    <span key={chip} className="rounded-full bg-white/10 px-2.5 py-1 text-xs">{chip}</span>
                                ))}
                            </div>
                            {detailItem.permalink ? (
                                <a href={detailItem.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-md border border-white/30 bg-white/10 px-3 py-1 text-xs hover:bg-white/20">
                                    Apri pagina prodotto
                                </a>
                            ) : null}
                        </div>
                    </aside>
                ) : null}
            </div>
        </main>
    );
}
