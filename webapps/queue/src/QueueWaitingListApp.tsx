"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { initWebappRealtimeClient } from "@/lib/sdk/realtime-client";

interface QueueState {
    currentServing: string | null;
    waitingCount: number;
    waitingQueue: Array<{ seq: number; displayNumber: string; issuedAt: string }>;
    accentColor: string;
    displayMessage: string | null;
    queueName: string;
    waitingListLimit: number;
    refreshSeconds: number;
}

interface Props {
    instanceId: string;
    token: string;
    channelKeys: string[];
}

export default function QueueWaitingListApp({ instanceId, token, channelKeys }: Props) {
    const [state, setState] = useState<QueueState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const channelSignature = useMemo(() => channelKeys.join("|"), [channelKeys]);

    const fetchState = useCallback(async () => {
        try {
            const res = await fetch(
                `/api/public/webapps/queue/${instanceId}/state?token=${encodeURIComponent(token)}`,
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
        void fetchState();
    }, [fetchState]);

    useEffect(() => {
        if (!state) return;
        timerRef.current = setTimeout(fetchState, Math.max((state.refreshSeconds ?? 5) * 1000, 3000));
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [state, fetchState]);

    useEffect(() => {
        const socket = initWebappRealtimeClient({
            appId: "queue",
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

    if (!state && !error) {
        return <div className="flex h-screen items-center justify-center bg-slate-950 text-white">Caricamento…</div>;
    }

    if (error || !state) {
        return <div className="flex h-screen items-center justify-center bg-slate-950 text-red-400">{error ?? "Stato non disponibile"}</div>;
    }

    const accent = state.accentColor ?? "#2563EB";
    const visibleItems = state.waitingQueue.slice(0, state.waitingListLimit || 8);

    return (
        <div className="min-h-screen bg-[linear-gradient(180deg,#020617,#111827)] px-6 py-8 text-white">
            <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8">
                    <p className="text-xs uppercase tracking-[0.35em] text-white/40">Now Serving</p>
                    <h1 className="mt-3 text-2xl font-bold uppercase tracking-[0.12em]">{state.queueName}</h1>
                    <div className="mt-8 text-[min(24vw,14rem)] font-black leading-none" style={{ color: accent }}>
                        {state.currentServing ?? "—"}
                    </div>
                    <p className="mt-6 text-lg text-white/60">
                        Ticket in attesa: <span className="font-bold text-white">{state.waitingCount}</span>
                    </p>
                    {state.displayMessage && (
                        <div className="mt-8 rounded-2xl border border-white/10 bg-white/6 p-4 text-lg text-white/85">
                            {state.displayMessage}
                        </div>
                    )}
                </section>

                <section className="rounded-[2rem] border border-white/10 bg-white/5 p-8">
                    <p className="text-xs uppercase tracking-[0.35em] text-white/40">Waiting List</p>
                    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {visibleItems.length > 0 ? visibleItems.map((entry, index) => (
                            <div key={`${entry.seq}-${entry.displayNumber}`} className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
                                <p className="text-[11px] uppercase tracking-[0.28em] text-white/35">Posizione {index + 1}</p>
                                <p className="mt-3 text-4xl font-black" style={{ color: accent }}>{entry.displayNumber}</p>
                            </div>
                        )) : (
                            <div className="rounded-[1.5rem] border border-dashed border-white/10 px-6 py-10 text-center text-white/35 sm:col-span-2 xl:col-span-3">
                                Nessuna prenotazione in attesa.
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}