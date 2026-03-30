"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { initWebappRealtimeClient } from "@/lib/sdk/realtime-client";

interface QueuePlusState {
    currentServing: string | null;
    waitingCount: number;
    waitingQueue: Array<{ seq: number; displayNumber: string; issuedAt: string; datasetId?: string; queueName?: string; accentColor?: string }>;
    waitingQueues?: Array<{
        datasetId: string;
        queueName: string;
        currentServing: string | null;
        waitingCount: number;
        accentColor: string;
        waitingQueue: Array<{ seq: number; displayNumber: string; issuedAt: string; datasetId?: string; queueName?: string; accentColor?: string }>;
    }>;
    accentColor: string;
    displayMessage: string | null;
    queueName: string;
    waitingListLimit: number;
    waitingListLayout: "list" | "grid";
    waitingListMergeMode?: "split" | "merged-by-timestamp";
    refreshSeconds: number;
}

interface Props {
    instanceId: string;
    token: string;
    channelKeys: string[];
}

export default function QueuePlusWaitingListApp({ instanceId, token, channelKeys }: Props) {
    const [state, setState] = useState<QueuePlusState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const channelSignature = useMemo(() => channelKeys.join("|"), [channelKeys]);

    const fetchState = useCallback(async () => {
        try {
            const res = await fetch(
                `/api/public/webapps/queue-plus/${instanceId}/state?token=${encodeURIComponent(token)}`,
                { cache: "no-store" },
            );
            if (!res.ok) {
                setError("Impossibile caricare la waiting list.");
                return;
            }
            const data = await res.json();
            setState(data);
            setError(null);
        } catch {
            setError("Errore di rete.");
        }
    }, [instanceId, token]);

    useEffect(() => {
        const bootstrap = setTimeout(() => {
            void fetchState();
        }, 0);
        return () => {
            clearTimeout(bootstrap);
        };
    }, [fetchState]);

    useEffect(() => {
        if (!state) return;
        timerRef.current = setTimeout(() => void fetchState(), Math.max((state.refreshSeconds ?? 5) * 1000, 3000));
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [state, fetchState]);

    useEffect(() => {
        const socket = initWebappRealtimeClient({
            appId: "queue-plus",
            instanceId,
            token,
            channelKeys,
            onEvent: () => {
                void fetchState();
            },
        });

        return () => {
            socket.disconnect();
        };
    }, [channelSignature, channelKeys, fetchState, instanceId, token]);

    if (!state && !error) return <div className="flex h-screen items-center justify-center bg-slate-950 text-white">Caricamento…</div>;
    if (error || !state) return <div className="flex h-screen items-center justify-center bg-slate-950 text-red-400">{error ?? "Stato non disponibile"}</div>;

    const accent = state.accentColor ?? "#2563EB";
    const visibleItems = state.waitingQueue.slice(0, state.waitingListLimit || 8);
    const useGrid = state.waitingListLayout === "grid";
    const splitMode = state.waitingListMergeMode !== "merged-by-timestamp";
    const waitingQueues = Array.isArray(state.waitingQueues) ? state.waitingQueues : [];

    return (
        <div className="min-h-screen bg-[linear-gradient(180deg,#020617,#111827)] px-6 py-8 text-white">
            <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8">
                    <p className="text-xs uppercase tracking-[0.35em] text-white/40">Now Serving</p>
                    <h1 className="mt-3 text-2xl font-bold uppercase tracking-[0.12em]">{state.queueName}</h1>
                    <div className="mt-8 text-[min(24vw,14rem)] font-black leading-none" style={{ color: accent }}>{state.currentServing ?? "—"}</div>
                    <p className="mt-6 text-lg text-white/60">Ticket in attesa: <span className="font-bold text-white">{state.waitingCount}</span></p>
                    {state.displayMessage && <div className="mt-8 rounded-2xl border border-white/10 bg-white/6 p-4 text-lg text-white/85">{state.displayMessage}</div>}
                </section>
                <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8">
                    <p className="text-xs uppercase tracking-[0.35em] text-white/40">Waiting List</p>
                    {splitMode && waitingQueues.length > 0 ? (
                        <div className="mt-6 space-y-4">
                            {waitingQueues.map((queue) => {
                                const queueItems = queue.waitingQueue.slice(0, state.waitingListLimit || 8);
                                const queueAccent = queue.accentColor || accent;
                                return (
                                    <div key={queue.datasetId} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <p className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: queueAccent }}>{queue.queueName}</p>
                                            <span className="text-xs text-white/50">in attesa {queue.waitingCount}</span>
                                        </div>
                                        <div className={` ${useGrid ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-3"}`}>
                                            {queueItems.length > 0 ? queueItems.map((entry, index) => (
                                                <div key={`${queue.datasetId}-${entry.seq}-${entry.displayNumber}`} className="rounded-[1.2rem] border border-white/10 bg-slate-900/80 p-4">
                                                    <p className="text-[11px] uppercase tracking-[0.28em] text-white/35">Posizione {index + 1}</p>
                                                    <p className="mt-2 text-3xl font-black" style={{ color: queueAccent }}>{entry.displayNumber}</p>
                                                </div>
                                            )) : (
                                                <div className="rounded-[1.2rem] border border-dashed border-white/10 px-4 py-6 text-center text-white/35">Nessuna prenotazione.</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className={`mt-6 ${useGrid ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-3"}`}>
                            {visibleItems.length > 0 ? visibleItems.map((entry, index) => (
                                <div key={`${entry.datasetId ?? "primary"}-${entry.seq}-${entry.displayNumber}`} className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
                                    <p className="text-[11px] uppercase tracking-[0.28em] text-white/35">Posizione {index + 1}</p>
                                    {entry.queueName && <p className="mt-1 text-xs uppercase tracking-[0.22em] text-white/45">{entry.queueName}</p>}
                                    <p className="mt-3 text-4xl font-black" style={{ color: entry.accentColor || accent }}>{entry.displayNumber}</p>
                                </div>
                            )) : (
                                <div className="rounded-[1.5rem] border border-dashed border-white/10 px-6 py-10 text-center text-white/35">Nessuna prenotazione in attesa.</div>
                            )}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
