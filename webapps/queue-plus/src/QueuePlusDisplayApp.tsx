"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { initWebappRealtimeClient } from "@/lib/sdk/realtime-client";

interface QueuePlusState {
    currentServing: string | null;
    waitingCount: number;
    accentColor: string;
    defaultAccentColor: string;
    showWaitingCount: boolean;
    queueName: string;
    displayMessage: string | null;
    audio?: {
        enabled: boolean;
        speechMode: "off" | "number" | "message" | "both";
        languages: string[];
        preChime: boolean;
        postChime: boolean;
    };
    refreshSeconds: number;
}

interface Props {
    instanceId: string;
    token: string;
    channelKeys: string[];
}

export default function QueuePlusDisplayApp({ instanceId, token, channelKeys }: Props) {
    const [state, setState] = useState<QueuePlusState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const previousServingRef = useRef<string | null>(null);
    const channelSignature = useMemo(() => channelKeys.join("|"), [channelKeys]);

    const fetchState = useCallback(async () => {
        try {
            const res = await fetch(
                `/api/public/webapps/queue-plus/${instanceId}/state?token=${encodeURIComponent(token)}`,
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
        void fetchState();
    }, [fetchState]);

    useEffect(() => {
        if (!state) return;
        const interval = Math.max((state.refreshSeconds ?? 5) * 1000, 3000);
        timerRef.current = setTimeout(() => {
            void fetchState();
        }, interval);
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

    useEffect(() => {
        if (!state || typeof window === "undefined") return;
        if (!state.currentServing || state.currentServing === previousServingRef.current) return;

        previousServingRef.current = state.currentServing;

        const audio = state.audio;
        if (!audio?.enabled || audio.speechMode === "off") return;

        const utteranceParts: string[] = [];
        if (audio.speechMode === "number" || audio.speechMode === "both") {
            utteranceParts.push(`Numero ${state.currentServing}`);
        }
        if ((audio.speechMode === "message" || audio.speechMode === "both") && state.displayMessage) {
            utteranceParts.push(state.displayMessage);
        }

        const utteranceText = utteranceParts.join(". ").trim();
        if (!utteranceText) return;

        const language = Array.isArray(audio.languages) && audio.languages.length > 0
            ? audio.languages[0]
            : "it-IT";

        const utterance = new SpeechSynthesisUtterance(utteranceText);
        utterance.lang = language;
        utterance.rate = 1;
        utterance.pitch = 1;

        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }, [state]);

    if (loading) {
        return <div className="flex h-screen items-center justify-center bg-gray-950"><div className="animate-pulse text-2xl font-light tracking-widest text-white">CARICAMENTO…</div></div>;
    }

    if (error || !state) {
        return <div className="flex h-screen items-center justify-center bg-gray-950"><p className="text-lg text-red-400">{error ?? "Stato non disponibile"}</p></div>;
    }

    const accent = state.accentColor ?? "#2563EB";

    return (
        <div className="flex h-screen select-none flex-col items-center justify-center bg-gray-950 text-white" data-testid="queue-plus-display-app">
            <p className="mb-3 text-xs uppercase tracking-[0.35em] text-white/40">{state.queueName}</p>
            <p className="mb-6 text-sm font-semibold uppercase tracking-[0.25em] opacity-60" style={{ color: accent }}>NUMERO SERVITO</p>
            <div className="text-[20vw] font-black leading-none tabular-nums" style={{ color: accent }} data-testid="queue-plus-current-number">{state.currentServing ?? "—"}</div>
            {state.showWaitingCount && (
                <div className="mt-10 flex items-center gap-3 opacity-70">
                    <span className="text-base font-medium uppercase tracking-widest">In attesa</span>
                    <span className="rounded-full px-4 py-1 text-2xl font-bold" style={{ backgroundColor: `${accent}22`, color: accent }}>{state.waitingCount}</span>
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
