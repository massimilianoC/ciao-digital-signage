"use client";

import { useCallback, useEffect, useState } from "react";

interface QueueState {
    currentServing?: string | null;
    waitingCount?: number;
    waitingQueue?: Array<{ displayNumber: string }>;
    queueName?: string;
    accentColor?: string;
}

interface Props {
    instanceId: string;
    token: string;
    datasetId: string;
    mode: "display" | "queue" | "remote" | "waiting-list" | "kiosk";
    settings?: Record<string, unknown>;
    onSettingsChange?: (partial: Record<string, unknown>) => void;
}

interface QueueCatalogItem {
    queueName: string;
    queueType: "numeric" | "alpha";
    serviceMode: "reservation" | "round-robin";
    bookingEnabled: boolean;
    waitingCount: number;
}

/**
 * Advanced (custom) configurator tab for the Queue app.
 * Shows a live preview of the queue state and quick-control actions.
 */
export function QueueCustomConfig({ instanceId, token, datasetId, mode, settings, onSettingsChange }: Props) {
    const queueName = (settings?.queueName as string | undefined) ?? datasetId;
    const [state, setState] = useState<QueueState | null>(null);
    const [actionMsg, setActionMsg] = useState<string>("");
    const [queueCatalog, setQueueCatalog] = useState<QueueCatalogItem[]>([]);
    const [selectedKioskQueues, setSelectedKioskQueues] = useState<string[]>([]);
    const [savingQueues, setSavingQueues] = useState(false);

    const fetch_ = useCallback(async () => {
        if (mode === "kiosk") return;
        try {
            const res = await fetch(
                `/api/public/webapps/queue/${instanceId}/state?token=${encodeURIComponent(token)}`,
                { cache: "no-store" },
            );
            if (res.ok) setState(await res.json());
        } catch {
            /* ignore */
        }
    }, [instanceId, mode, token]);

    useEffect(() => {
        const bootstrap = setTimeout(() => {
            void fetch_();
        }, 0);
        const t = setInterval(fetch_, 5000);
        return () => {
            clearTimeout(bootstrap);
            clearInterval(t);
        };
    }, [fetch_]);

    useEffect(() => {
        async function loadCatalog() {
            try {
                const res = await fetch("/api/webapps/queue/catalog", { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                setQueueCatalog(data.queues ?? []);
            } catch {
                setQueueCatalog([]);
            }
        }

        void loadCatalog();
    }, []);

    useEffect(() => {
        const initial = settings?.kioskQueueNames;
        if (!Array.isArray(initial)) return;

        setSelectedKioskQueues(
            initial
                .map((entry) => String(entry).trim().toLowerCase())
                .filter(Boolean),
        );
    }, [settings]);

    function toggleKioskQueue(queue: string) {
        const normalized = queue.trim().toLowerCase();
        if (!normalized) return;

        setSelectedKioskQueues((prev) =>
            prev.includes(normalized)
                ? prev.filter((entry) => entry !== normalized)
                : [...prev, normalized],
        );
    }

    async function saveKioskQueues() {
        setSavingQueues(true);
        try {
            const res = await fetch(`/api/webapps/instances/${instanceId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    settings: {
                        kioskQueueNames: selectedKioskQueues,
                    },
                }),
            });

            setActionMsg(res.ok ? "✓ Code kiosk aggiornate" : "✗ Errore salvataggio code kiosk");
        } finally {
            setSavingQueues(false);
            setTimeout(() => setActionMsg(""), 2500);
        }
    }

    const ctrl = useCallback(
        async (action: string, extra?: Record<string, unknown>) => {
            const res = await fetch(
                `/api/public/webapps/queue/${instanceId}/control?token=${encodeURIComponent(token)}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action, ...extra }),
                },
            );
            if (res.ok) {
                setActionMsg("✓ Operazione eseguita");
                await fetch_();
            } else {
                setActionMsg("✗ Errore");
            }
            setTimeout(() => setActionMsg(""), 2000);
        },
        [instanceId, token, fetch_],
    );

    return (
        <div className="space-y-6">
            <div className="rounded-lg border border-border p-4 bg-muted/30">
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
                    Stato live — coda: <span className="text-foreground">{queueName}</span>
                </h3>

                {state ? (
                    <div className="flex items-center gap-6">
                        <div className="text-center">
                            <p className="text-xs text-muted-foreground mb-1">Servito</p>
                            <p className="text-4xl font-black">
                                {state.currentServing ?? "—"}
                            </p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-muted-foreground mb-1">In attesa</p>
                            <p className="text-4xl font-bold">{state.waitingCount ?? 0}</p>
                        </div>
                        {(state.waitingQueue?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {state.waitingQueue!.slice(0, 8).map((e) => (
                                    <span
                                        key={e.displayNumber}
                                        className="rounded px-2 py-0.5 text-xs bg-muted font-mono"
                                    >
                                        {e.displayNumber}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Caricamento stato…</p>
                )}
            </div>

            {mode === "remote" && (
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Controlli rapidi
                    </h3>
                    <div className="flex gap-2 flex-wrap">
                        <button
                            onClick={() => ctrl("advance")}
                            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
                        >
                            Avanza →
                        </button>
                        <button
                            onClick={() => ctrl("retreat")}
                            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
                        >
                            ← Indietro
                        </button>
                        <button
                            onClick={() => ctrl("issue")}
                            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
                        >
                            + Nuovo numero
                        </button>
                        <button
                            onClick={() => {
                                if (confirm("Vuoi resettare la coda?")) ctrl("reset");
                            }}
                            className="rounded-md border border-destructive/40 text-destructive px-4 py-2 text-sm hover:bg-destructive/10"
                        >
                            Reset coda
                        </button>
                    </div>
                    {actionMsg && (
                        <p className="text-sm font-medium">{actionMsg}</p>
                    )}
                </div>
            )}

            {queueCatalog.length > 0 && mode === "kiosk" && (
                <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Catalogo code disponibili
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {queueCatalog.map((item) => (
                            <button
                                key={item.queueName}
                                type="button"
                                onClick={() => toggleKioskQueue(item.queueName)}
                                className={`rounded-full border px-3 py-1 text-xs transition ${selectedKioskQueues.includes(item.queueName) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"}`}
                            >
                                {item.queueName}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={saveKioskQueues}
                            disabled={savingQueues}
                            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-40"
                        >
                            {savingQueues ? "Salvataggio…" : "Salva selezione kiosk"}
                        </button>
                        <span className="text-xs text-muted-foreground">
                            {selectedKioskQueues.length} code selezionate
                        </span>
                    </div>
                </div>
            )}

            {["display", "queue"].includes(mode) && (
                <p className="text-sm text-muted-foreground italic">
                    Questa è un&apos;istanza di sola visualizzazione. Per i controlli, crea
                    un&apos;istanza in modalità <strong>Remote Control</strong> con lo stesso
                    queueName.
                </p>
            )}
        </div>
    );
}
