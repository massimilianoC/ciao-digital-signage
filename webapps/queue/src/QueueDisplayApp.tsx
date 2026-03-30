"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { initWebappRealtimeClient } from "@/lib/sdk/realtime-client";

interface QueueState {
    currentServing: string | null;
    waitingCount: number;
    accentColor: string;
    defaultAccentColor: string;
    showWaitingCount: boolean;
    queueName: string;
    displayMessage: string | null;
    refreshSeconds: number;
}

interface Props {
    instanceId: string;
    token: string;
    channelKeys: string[];
}

export default function QueueDisplayApp({ instanceId, token, channelKeys }: Props) {
    const [state, setState] = useState<QueueState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const channelSignature = useMemo(() => channelKeys.join("|"), [channelKeys]);

    const fetchState = useCallback(async () => {
        try {
            const res = await fetch(
                `/api/public/webapps/queue/${instanceId}/state?token=${encodeURIComponent(token)}`,
                { cache: "no-store" },
            );

            if (!res.ok) {
                setError("Impossibile caricare lo stato della coda.");
                return;
            }

            const data = await res.json();
            setState(data);
            setError(null);
        } catch {
            setError("Errore di rete.");
        } finally {
            setLoading(false);
        }
    }, [instanceId, token]);

    useEffect(() => {
        fetchState();
    }, [fetchState]);

    useEffect(() => {
        if (!state) return;
        const interval = Math.max((state.refreshSeconds ?? 5) * 1000, 3000);
        timerRef.current = setTimeout(() => {
            fetchState();
        }, interval);
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

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-950">
                <div className="animate-pulse text-white text-2xl font-light tracking-widest">
                    CARICAMENTO…
                </div>
            </div>
        );
    }

    if (error || !state) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-950">
                <p className="text-red-400 text-lg">{error ?? "Stato non disponibile"}</p>
            </div>
        );
    }

    const accent = state.accentColor ?? "#2563EB";

    return (
        <div
            className="flex h-screen flex-col items-center justify-center bg-gray-950 text-white select-none"
            data-testid="queue-display-app"
        >
            <p className="mb-3 text-xs uppercase tracking-[0.35em] text-white/40">
                {state.queueName}
            </p>

            {/* Header label */}
            <p
                className="text-sm font-semibold uppercase tracking-[0.25em] mb-6 opacity-60"
                style={{ color: accent }}
            >
                NUMERO SERVITO
            </p>

            {/* Big number */}
            <div
                className="text-[20vw] font-black leading-none tabular-nums"
                style={{ color: accent }}
                data-testid="queue-current-number"
            >
                {state.currentServing ?? "—"}
            </div>

            {/* Waiting count */}
            {state.showWaitingCount && (
                <div className="mt-10 flex items-center gap-3 opacity-70">
                    <span className="text-base font-medium uppercase tracking-widest">
                        In attesa
                    </span>
                    <span
                        className="rounded-full px-4 py-1 text-2xl font-bold"
                        style={{ backgroundColor: `${accent}22`, color: accent }}
                    >
                        {state.waitingCount}
                    </span>
                </div>
            )}

            {state.displayMessage && (
                <div className="mt-8 max-w-3xl rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-center">
                    <p className="text-sm uppercase tracking-[0.25em] text-white/45">Messaggio</p>
                    <p className="mt-2 text-2xl font-semibold text-white/90">{state.displayMessage}</p>
                </div>
            )}
        </div>
    );
}
