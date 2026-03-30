"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface TicketState {
    ticketCode: string;
    queueName: string;
    displayNumber: string;
    status: "waiting" | "serving" | "served" | "expired";
    issuedAt: string;
    servedAt: string | null;
    ticketFirstAccessedAt?: string | null;
    qrAvailable?: boolean;
    position: number | null;
    currentlyServing: string | null;
    waitingCount?: number;
    trackingUrl: string;
}

interface Props {
    ticketCode: string;
}

export default function QueuePlusTicketTrackingApp({ ticketCode }: Props) {
    const [state, setState] = useState<TicketState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const previousStatusRef = useRef<TicketState["status"] | null>(null);

    const fetchState = useCallback(async () => {
        try {
            const res = await fetch(`/api/public/webapps/queue-plus/tickets/${encodeURIComponent(ticketCode)}`, {
                cache: "no-store",
            });
            if (!res.ok) {
                setError("Ticket non trovato o non disponibile");
                return;
            }

            const payload = await res.json();
            setState(payload);
            setError(null);
        } catch {
            setError("Errore di rete");
        }
    }, [ticketCode]);

    useEffect(() => {
        const bootstrap = setTimeout(() => {
            void fetchState();
        }, 0);
        const interval = setInterval(() => {
            void fetchState();
        }, 5000);

        return () => {
            clearTimeout(bootstrap);
            clearInterval(interval);
        };
    }, [fetchState]);

    useEffect(() => {
        if (!state) return;

        const previous = previousStatusRef.current;
        const isTransitionToServing = previous === "waiting" && state.status === "serving";
        previousStatusRef.current = state.status;

        if (!isTransitionToServing || typeof window === "undefined") return;

        // Soft alert tone on first serving transition.
        const audioContext = new window.AudioContext();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        gain.gain.setValueAtTime(0.001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.2, audioContext.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.35);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.36);

        oscillator.onended = () => {
            void audioContext.close();
        };
    }, [state]);

    if (!state && !error) {
        return <div className="flex h-screen items-center justify-center bg-slate-950 text-white">Caricamento ticket…</div>;
    }

    if (error || !state) {
        return <div className="flex h-screen items-center justify-center bg-slate-950 text-red-300">{error ?? "Ticket non disponibile"}</div>;
    }

    const statusText = state.status === "waiting"
        ? "In attesa"
        : state.status === "serving"
            ? "In chiamata"
            : state.status === "served"
                ? "Servito"
                : "Scaduto";

    const isNextInLine = state.status === "waiting" && state.position === 1;
    const isServing = state.status === "serving";
    const isServed = state.status === "served";
    const isExpired = state.status === "expired";

    const accentClass = isServing
        ? "text-emerald-300"
        : isNextInLine
            ? "text-amber-300"
            : isServed
                ? "text-slate-300"
                : isExpired
                    ? "text-rose-300"
                    : "text-cyan-300";

    const panelClass = isServing
        ? "border-emerald-400/40 bg-emerald-500/10"
        : isNextInLine
            ? "border-amber-400/40 bg-amber-500/10"
            : isServed
                ? "border-slate-400/35 bg-slate-500/10"
                : isExpired
                    ? "border-rose-400/35 bg-rose-500/10"
                    : "border-white/10 bg-black/20";

    return (
        <div className="min-h-screen bg-[linear-gradient(180deg,#020617,#111827)] px-5 py-8 text-white">
            <div className="mx-auto max-w-xl rounded-[2rem] border border-white/10 bg-white/5 p-7">
                <p className="text-xs uppercase tracking-[0.35em] text-white/45">QueuePLUS Ticket</p>
                <h1 className="mt-2 text-3xl font-black uppercase tracking-[0.12em]">{state.queueName}</h1>
                <p className="mt-6 text-sm text-white/55">Ticket</p>
                <p className={`text-7xl font-black ${accentClass} ${isServing ? "animate-pulse" : ""}`}>{state.displayNumber}</p>

                <div className={`mt-6 grid gap-3 rounded-2xl border p-4 text-sm ${panelClass}`}>
                    <p>Stato: <span className="font-semibold">{statusText}</span></p>
                    {state.currentlyServing && <p>Numero servito ora: <span className="font-semibold">{state.currentlyServing}</span></p>}
                    {state.position !== null && <p>Posizione in attesa: <span className="font-semibold">{state.position}</span></p>}
                    {typeof state.waitingCount === "number" && <p>Persone in coda: <span className="font-semibold">{state.waitingCount}</span></p>}
                    <p>Codice ticket: <span className="font-mono">{state.ticketCode}</span></p>
                    {isNextInLine && <p className="font-semibold text-amber-200">Sei il prossimo in lista.</p>}
                    {isServing && <p className="font-semibold text-emerald-200">E&apos; il tuo turno, recati allo sportello.</p>}
                    {isServed && <p className="font-semibold text-slate-200">Grazie, servizio completato.</p>}
                </div>

                <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/60">
                    Aggiornamento automatico ogni 5 secondi.
                </div>
            </div>
        </div>
    );
}
