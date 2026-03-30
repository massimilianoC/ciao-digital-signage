"use client";

import { useCallback, useEffect, useState } from "react";

interface QueueState {
    currentServing?: string | null;
    waitingCount?: number;
    waitingQueue?: Array<{ displayNumber: string }>;
    queueName?: string;
    accentColor?: string;
    remoteQueues?: Array<{ datasetId: string; queueName: string; waitingCount: number }>;
}

interface Props {
    instanceId: string;
    token: string;
    mode: "display" | "queue" | "remote" | "waiting-list" | "kiosk";
    settings?: Record<string, unknown>;
    onSettingsChange?: (partial: Record<string, unknown>) => void;
}

interface QueueCatalogItem {
    datasetId: string;
    queueName: string;
    queueType: "numeric" | "alpha";
    currentServing?: string | null;
    waitingCount: number;
}

interface DisplayTargetItem {
    displayId: string;
    displayName: string;
    datasetId: string;
    queueName: string;
}

function parseStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((entry) => String(entry).trim()).filter(Boolean);
}

export function QueuePlusCustomConfig({ instanceId, token, mode, settings, onSettingsChange }: Props) {
    const [state, setState] = useState<QueueState | null>(null);
    const [queueCatalog, setQueueCatalog] = useState<QueueCatalogItem[]>([]);
    const [displayTargets, setDisplayTargets] = useState<DisplayTargetItem[]>([]);

    const fetchState = useCallback(async () => {
        if (mode === "kiosk") return;
        try {
            const res = await fetch(`/api/public/webapps/queue-plus/${instanceId}/state?token=${encodeURIComponent(token)}`, { cache: "no-store" });
            if (res.ok) setState(await res.json());
        } catch {
            // ignore
        }
    }, [instanceId, mode, token]);

    useEffect(() => {
        const bootstrap = setTimeout(() => void fetchState(), 0);
        const interval = setInterval(() => void fetchState(), 5000);
        return () => {
            clearTimeout(bootstrap);
            clearInterval(interval);
        };
    }, [fetchState]);

    useEffect(() => {
        async function loadCatalog() {
            try {
                const res = await fetch("/api/webapps/queue-plus/catalog", { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                setQueueCatalog(Array.isArray(data.queues) ? data.queues : []);
            } catch {
                setQueueCatalog([]);
            }
        }

        void loadCatalog();
    }, []);

    useEffect(() => {
        async function loadDisplayTargets() {
            try {
                const res = await fetch("/api/webapps/queue-plus/display-targets", { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                setDisplayTargets(Array.isArray(data.displays) ? data.displays : []);
            } catch {
                setDisplayTargets([]);
            }
        }

        void loadDisplayTargets();
    }, []);

    const selectedDatasetIds = mode === "kiosk"
        ? parseStringList(settings?.kioskDatasetIds)
        : mode === "remote"
            ? parseStringList(settings?.allowedDatasetIds)
            : mode === "waiting-list"
                ? parseStringList(settings?.waitingListDatasetIds)
                : (mode === "queue" || mode === "display") && typeof settings?.datasetId === "string"
                    ? [settings.datasetId]
                    : [];

    const displayIdChips = parseStringList(settings?.allowedDisplayIds);

    function toggleDatasetSelection(datasetId: string) {
        const next = selectedDatasetIds.includes(datasetId)
            ? selectedDatasetIds.filter((id) => id !== datasetId)
            : [...selectedDatasetIds, datasetId];

        if (mode === "kiosk") {
            onSettingsChange?.({ kioskDatasetIds: next });
        } else if (mode === "remote") {
            onSettingsChange?.({ allowedDatasetIds: next });
        } else if (mode === "waiting-list") {
            onSettingsChange?.({ waitingListDatasetIds: next });
        } else if (mode === "queue" || mode === "display") {
            onSettingsChange?.({ datasetId: next[0] ?? undefined });
        }
    }

    function addDisplayChip(rawValue: string) {
        const value = rawValue.trim();
        if (!value) return;
        if (displayIdChips.includes(value)) return;

        onSettingsChange?.({ allowedDisplayIds: [...displayIdChips, value] });
    }

    function removeDisplayChip(value: string) {
        onSettingsChange?.({ allowedDisplayIds: displayIdChips.filter((entry) => entry !== value) });
    }

    function clearDatasetFilter() {
        if (mode === "kiosk") {
            onSettingsChange?.({ kioskDatasetIds: [] });
            return;
        }
        if (mode === "remote") {
            onSettingsChange?.({ allowedDatasetIds: [] });
            return;
        }
        if (mode === "waiting-list") {
            onSettingsChange?.({ waitingListDatasetIds: [] });
            return;
        }

        onSettingsChange?.({ datasetId: undefined });
    }

    function clearDisplayFilter() {
        onSettingsChange?.({ allowedDisplayIds: [] });
    }

    return (
        <div className="space-y-6">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Stato live QueuePLUS</h3>
                {state ? (
                    <div className="flex flex-wrap items-center gap-6">
                        <div className="text-center">
                            <p className="mb-1 text-xs text-muted-foreground">Servito</p>
                            <p className="text-4xl font-black">{state.currentServing ?? "—"}</p>
                        </div>
                        <div className="text-center">
                            <p className="mb-1 text-xs text-muted-foreground">In attesa</p>
                            <p className="text-4xl font-bold">{state.waitingCount ?? 0}</p>
                        </div>
                        {(state.waitingQueue?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {state.waitingQueue?.slice(0, 8).map((entry) => (
                                    <span key={entry.displayNumber} className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{entry.displayNumber}</span>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Caricamento stato…</p>
                )}
            </div>

            {/* Dataset Selection - Unified for all modes */}
            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {mode === "queue" || mode === "display" ? "Dataset principale" : "Dataset abilitati"}
                </h3>
                <p className="text-xs text-muted-foreground">
                    {mode === "queue" || mode === "display"
                        ? "Se non selezioni dataset, la visualizzazione usa tutti i dataset disponibili. Se selezioni, usa solo il dataset selezionato."
                        : "Se non selezioni dataset, usa tutto il catalogo. Se selezioni, usa solo il set selezionato."}
                </p>
                <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                        {selectedDatasetIds.length > 0
                            ? `${selectedDatasetIds.length} dataset selezionati`
                            : "Nessun filtro dataset attivo"}
                    </p>
                    <button
                        type="button"
                        onClick={clearDatasetFilter}
                        className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent"
                    >
                        Nessun filtro (tutto)
                    </button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {queueCatalog.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">Nessun dataset disponibile. Creane uno dal pannello Dataset QueuePLUS.</p>
                    ) : (
                        queueCatalog.map((item) => {
                            const isSelected = selectedDatasetIds.includes(item.datasetId);
                            return (
                                <button
                                    key={item.datasetId}
                                    type="button"
                                    onClick={() => toggleDatasetSelection(item.datasetId)}
                                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                        isSelected
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-border bg-background text-foreground hover:border-primary hover:bg-muted"
                                    }`}
                                >
                                    {item.queueName}
                                </button>
                            );
                        })
                    )}
                </div>
                {selectedDatasetIds.length === 0 && mode !== "display" && (
                    <p className="text-xs text-amber-600">Nessun dataset selezionato — nessun filtro.</p>
                )}
            </div>

            {mode === "remote" && (
                <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Display pilotabili (istanze)</h3>
                    <p className="text-xs text-muted-foreground">Se non selezioni display, il remote puo&apos; usare tutti i display disponibili. Se selezioni, usa solo il set scelto.</p>
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                            {displayIdChips.length > 0
                                ? `${displayIdChips.length} display selezionati`
                                : "Nessun filtro display attivo"}
                        </p>
                        <button
                            type="button"
                            onClick={clearDisplayFilter}
                            className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent"
                        >
                            Nessun filtro (tutto)
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {displayTargets.map((target) => {
                            const selected = displayIdChips.includes(target.displayId);
                            return (
                                <button
                                    key={target.displayId}
                                    type="button"
                                    onClick={() => (selected ? removeDisplayChip(target.displayId) : addDisplayChip(target.displayId))}
                                    className={`rounded-full border px-3 py-1 text-xs transition ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"}`}
                                >
                                    {target.displayName} - {target.queueName}
                                </button>
                            );
                        })}
                    </div>
                    {displayTargets.length === 0 && (
                        <p className="text-xs text-muted-foreground italic">Nessuna istanza display disponibile. Crea prima una istanza QueuePLUS Display.</p>
                    )}
                </div>
            )}
        </div>
    );
}
