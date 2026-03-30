"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { WordpressDatasetEditor } from "@/components/cms/webapps/editors/WordpressDatasetEditor";
import { Button } from "@/components/ui/button";

type DatasetDetail = {
    datasetId: string;
    appId: string;
    name: string;
    status: "active" | "disabled" | "draft" | "managed";
    datasetKind: string;
    storageMode: "inline" | "asset-ref" | "app-collection" | "remote-mirror";
    readOnly: boolean;
    config: Record<string, unknown>;
    summary?: Record<string, unknown>;
};

function asString(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

interface Props {
    appId: string;
    datasetId: string;
}

export function WebappDatasetDetailPanel({ appId, datasetId }: Props) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dataset, setDataset] = useState<DatasetDetail | null>(null);
    const [name, setName] = useState("");
    const [status, setStatus] = useState<"active" | "disabled" | "draft">("active");
    const [configJson, setConfigJson] = useState("{}");
    const [message, setMessage] = useState("");
    const [showRawJson, setShowRawJson] = useState(false);

    const [queueQueueName, setQueueQueueName] = useState("");
    const [queueQueueType, setQueueQueueType] = useState<"numeric" | "alpha">("numeric");
    const [queuePrefix, setQueuePrefix] = useState("");
    const [queueServiceMode, setQueueServiceMode] = useState<"reservation" | "round-robin" | "multigate">("multigate");
    const [queueBookingEnabled, setQueueBookingEnabled] = useState(true);
    const [queueMaxWaiting, setQueueMaxWaiting] = useState(99);
    const [queueRoundRobinMax, setQueueRoundRobinMax] = useState(99);

    const [calendarTimezone, setCalendarTimezone] = useState("Europe/Rome");
    const [calendarRefreshSeconds, setCalendarRefreshSeconds] = useState(300);
    const [calendarIcsUrl, setCalendarIcsUrl] = useState("");
    const [calendarAssetContentId, setCalendarAssetContentId] = useState("");

    const [wordpressConfig, setWordpressConfig] = useState<Record<string, unknown>>({});

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(
                `/api/webapps/datasets/${encodeURIComponent(datasetId)}?appId=${encodeURIComponent(appId)}`,
                { cache: "no-store" },
            );
            if (!res.ok) throw new Error("Dataset non trovato");

            const payload = (await res.json()) as { dataset: DatasetDetail };
            setDataset(payload.dataset);
            setName(payload.dataset.name);
            if (payload.dataset.status !== "managed") {
                setStatus(payload.dataset.status as "active" | "disabled" | "draft");
            }
            setConfigJson(JSON.stringify(payload.dataset.config ?? {}, null, 2));

            const cfg = payload.dataset.config ?? {};
            if (payload.dataset.appId === "queue" || payload.dataset.appId === "queue-plus") {
                setQueueQueueName(asString(cfg.queueName));
                setQueueQueueType(asString(cfg.queueType) === "alpha" ? "alpha" : "numeric");
                setQueuePrefix(asString(cfg.prefix));
                if (payload.dataset.appId === "queue-plus") {
                    setQueueServiceMode("multigate");
                } else {
                    setQueueServiceMode(
                        asString(cfg.serviceMode) === "round-robin"
                            ? "round-robin"
                            : "reservation",
                    );
                }
                setQueueBookingEnabled(asBoolean(cfg.bookingEnabled, true));
                setQueueMaxWaiting(asNumber(cfg.maxWaiting, 99));
                setQueueRoundRobinMax(asNumber(cfg.roundRobinMaxNumber, 99));
            }

            if (payload.dataset.appId === "google-calendar") {
                setCalendarTimezone(asString(cfg.timezone, "Europe/Rome"));
                setCalendarRefreshSeconds(asNumber(cfg.refreshSeconds, 300));
                setCalendarIcsUrl(asString(cfg.icsUrl));
                setCalendarAssetContentId(asString(cfg.assetContentId));
            }

            if (payload.dataset.appId === "wordpress-link") {
                setWordpressConfig(cfg);
            }

            setMessage("");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Errore caricamento dataset");
            setDataset(null);
        } finally {
            setLoading(false);
        }
    }, [appId, datasetId]);

    useEffect(() => {
        void load();
    }, [load]);

    async function handleValidate() {
        try {
            const res = await fetch(
                `/api/webapps/datasets/${encodeURIComponent(datasetId)}/validate?appId=${encodeURIComponent(appId)}`,
                { method: "POST" },
            );
            const body = (await res.json().catch(() => null)) as { valid?: boolean; issues?: Array<{ message: string }>; error?: string } | null;
            if (!res.ok) throw new Error(body?.error || "Validazione fallita");

            if (body?.valid) {
                setMessage("Validazione completata senza errori");
            } else {
                setMessage(body?.issues?.map((issue) => issue.message).join(" | ") || "Validazione con warning/errori");
            }
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Validazione fallita");
        }
    }

    async function handleSave() {
        if (!dataset || dataset.readOnly) return;
        setSaving(true);
        try {
            let parsedConfig: Record<string, unknown> = {};
            if (dataset.appId === "queue" || dataset.appId === "queue-plus") {
                parsedConfig = {
                    queueName: queueQueueName.trim().toLowerCase(),
                    queueType: queueQueueType,
                    prefix: queuePrefix,
                    serviceMode: dataset.appId === "queue-plus" ? "multigate" : queueServiceMode,
                    bookingEnabled: queueBookingEnabled,
                    maxWaiting: Math.max(1, Math.floor(queueMaxWaiting)),
                    roundRobinMaxNumber: Math.max(1, Math.floor(queueRoundRobinMax)),
                };
            } else if (dataset.appId === "google-calendar") {
                parsedConfig = {
                    timezone: calendarTimezone,
                    refreshSeconds: Math.max(60, Math.floor(calendarRefreshSeconds)),
                    icsUrl: calendarIcsUrl || undefined,
                    assetContentId: calendarAssetContentId || undefined,
                };
            } else if (dataset.appId === "wordpress-link") {
                if (showRawJson) {
                    try {
                        parsedConfig = JSON.parse(configJson) as Record<string, unknown>;
                    } catch {
                        throw new Error("JSON config non valido");
                    }
                } else {
                    parsedConfig = wordpressConfig;
                }
            } else {
                try {
                    parsedConfig = JSON.parse(configJson) as Record<string, unknown>;
                } catch {
                    throw new Error("JSON config non valido");
                }
            }

            const res = await fetch(
                `/api/webapps/datasets/${encodeURIComponent(datasetId)}?appId=${encodeURIComponent(appId)}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name,
                        status,
                        config: parsedConfig,
                    }),
                },
            );

            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error || "Salvataggio fallito");
            }

            setMessage("Dataset aggiornato");
            await load();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Salvataggio fallito");
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!dataset || dataset.readOnly) return;
        const confirmed = window.confirm(`Eliminare il dataset \"${dataset.name}\"?`);
        if (!confirmed) return;

        try {
            const res = await fetch(
                `/api/webapps/datasets/${encodeURIComponent(datasetId)}?appId=${encodeURIComponent(appId)}`,
                { method: "DELETE" },
            );
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error || "Delete fallito");
            }
            router.push(`/webapps/${encodeURIComponent(appId)}/datasets`);
            router.refresh();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Delete fallito");
        }
    }

    if (loading) return <p className="text-sm text-muted-foreground">Caricamento dataset...</p>;
    if (!dataset) return <p className="text-sm text-muted-foreground">Dataset non disponibile</p>;

    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <p className="text-xs text-muted-foreground">Dataset ID</p>
                        <p className="text-sm font-mono break-all">{dataset.datasetId}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Tipo</p>
                        <p className="text-sm">{dataset.datasetKind}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Nome</label>
                        <input
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            disabled={dataset.readOnly}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Status</label>
                        <select
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full"
                            value={dataset.status === "managed" ? "active" : status}
                            onChange={(event) => setStatus(event.target.value as "active" | "disabled" | "draft")}
                            disabled={dataset.readOnly || dataset.status === "managed"}
                        >
                            <option value="active">active</option>
                            <option value="disabled">disabled</option>
                            <option value="draft">draft</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Editor configurazione dataset</label>

                    {dataset.appId === "queue" || dataset.appId === "queue-plus" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-md border border-border p-3">
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Queue Name</label>
                                <input className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full" value={queueQueueName} onChange={(event) => setQueueQueueName(event.target.value)} disabled={dataset.readOnly} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Queue Type</label>
                                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full" value={queueQueueType} onChange={(event) => setQueueQueueType(event.target.value as "numeric" | "alpha")} disabled={dataset.readOnly}>
                                    <option value="numeric">numeric</option>
                                    <option value="alpha">alpha</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Prefix</label>
                                <input className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full" value={queuePrefix} onChange={(event) => setQueuePrefix(event.target.value)} disabled={dataset.readOnly} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Service Mode</label>
                                <select
                                    className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full"
                                    value={dataset.appId === "queue-plus" ? "multigate" : queueServiceMode}
                                    onChange={(event) => setQueueServiceMode(event.target.value as "reservation" | "round-robin" | "multigate")}
                                    disabled={dataset.readOnly || dataset.appId === "queue-plus"}
                                >
                                    {dataset.appId === "queue-plus" ? (
                                        <option value="multigate">multigate</option>
                                    ) : (
                                        <>
                                            <option value="reservation">reservation</option>
                                            <option value="round-robin">round-robin</option>
                                        </>
                                    )}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Max Waiting</label>
                                <input type="number" min={1} className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full" value={queueMaxWaiting} onChange={(event) => setQueueMaxWaiting(Number(event.target.value) || 99)} disabled={dataset.readOnly} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Round Robin Max</label>
                                <input type="number" min={1} className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full" value={queueRoundRobinMax} onChange={(event) => setQueueRoundRobinMax(Number(event.target.value) || 99)} disabled={dataset.readOnly} />
                            </div>
                            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground md:col-span-2">
                                <input type="checkbox" checked={queueBookingEnabled} onChange={(event) => setQueueBookingEnabled(event.target.checked)} disabled={dataset.readOnly} />
                                Booking Enabled
                            </label>
                        </div>
                    ) : null}

                    {dataset.appId === "google-calendar" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-md border border-border p-3">
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Timezone</label>
                                <input className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full" value={calendarTimezone} onChange={(event) => setCalendarTimezone(event.target.value)} disabled={dataset.readOnly} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Refresh (sec)</label>
                                <input type="number" min={60} className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full" value={calendarRefreshSeconds} onChange={(event) => setCalendarRefreshSeconds(Number(event.target.value) || 300)} disabled={dataset.readOnly} />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                                <label className="text-xs text-muted-foreground">ICS URL</label>
                                <input className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full" value={calendarIcsUrl} onChange={(event) => setCalendarIcsUrl(event.target.value)} disabled={dataset.readOnly} />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                                <label className="text-xs text-muted-foreground">Asset Content ID</label>
                                <input className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full" value={calendarAssetContentId} onChange={(event) => setCalendarAssetContentId(event.target.value)} disabled={dataset.readOnly} />
                            </div>
                            <p className="text-xs text-muted-foreground md:col-span-2">
                                Per gestione bulk sorgenti resta disponibile il manager dedicato in /content/google-calendar/sources.
                            </p>
                        </div>
                    ) : null}

                    {dataset.appId === "wordpress-link" ? (
                        <WordpressDatasetEditor
                            value={wordpressConfig}
                            readOnly={dataset.readOnly}
                            onChange={(nextValue) => {
                                setWordpressConfig(nextValue);
                                setConfigJson(JSON.stringify(nextValue, null, 2));
                            }}
                        />
                    ) : null}

                    <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setShowRawJson((prev) => !prev)}>
                        {showRawJson ? "Nascondi raw JSON" : "Mostra raw JSON"}
                    </button>
                    {showRawJson ? (
                        <textarea
                            className="w-full min-h-56 rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                            value={configJson}
                            onChange={(event) => setConfigJson(event.target.value)}
                            disabled={dataset.readOnly}
                        />
                    ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={handleValidate}>
                        Valida dataset
                    </Button>
                    {!dataset.readOnly ? (
                        <Button type="button" onClick={handleSave} disabled={saving}>
                            {saving ? "Salvataggio..." : "Salva"}
                        </Button>
                    ) : null}
                    {!dataset.readOnly ? (
                        <Button type="button" variant="outline" onClick={handleDelete}>
                            Elimina
                        </Button>
                    ) : null}
                </div>
            </div>

            {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
        </div>
    );
}
