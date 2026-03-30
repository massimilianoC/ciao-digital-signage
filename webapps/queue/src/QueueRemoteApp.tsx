"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { initWebappRealtimeClient } from "@/lib/sdk/realtime-client";

interface QueueHistoryEntry {
    displayNumber: string;
    calledAt: string;
}

interface QueueState {
    mode: "queue" | "remote";
    currentServing: string | null;
    waitingCount: number;
    waitingQueue: Array<{ seq: number; displayNumber: string; issuedAt: string }>;
    history: QueueHistoryEntry[];
    accentColor: string;
    defaultAccentColor: string;
    queueName: string;
    queueType: "numeric" | "alpha";
    prefix: string;
    serviceMode: "reservation" | "round-robin";
    bookingEnabled: boolean;
    roundRobinMaxNumber: number;
    nextServingDisplayNumber: string | null;
    nextSeq: number;
    nextDisplayNumber: string;
    displayMessage: string | null;
    refreshSeconds: number;
    publicToken: string;
}

interface Props {
    instanceId: string;
    token: string;
    channelKeys: string[];
}

type ActionState = "idle" | "loading" | "success" | "error";

function buildCandidateNumber(
    seq: number,
    queueType: "numeric" | "alpha",
    prefix: string,
): string {
    if (queueType === "alpha") {
        const normalizedPrefix = (prefix || "A").toUpperCase();
        return `${normalizedPrefix}${String(seq).padStart(3, "0")}`;
    }

    return String(seq);
}

export default function QueueRemoteApp({ instanceId, token, channelKeys }: Props) {
    const [state, setState] = useState<QueueState | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [actionState, setActionState] = useState<ActionState>("idle");
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [customInput, setCustomInput] = useState("");
    const [jumpSelection, setJumpSelection] = useState("");
    const [messageInput, setMessageInput] = useState("");
    const [accentInput, setAccentInput] = useState("#2563EB");
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const channelSignature = useMemo(() => channelKeys.join("|"), [channelKeys]);
    const jumpOptions = state
        ? Array.from({ length: 12 }, (_, offset) => {
            const seq = state.nextSeq + offset;
            return buildCandidateNumber(seq, state.queueType, state.prefix);
        })
        : [];

    const fetchState = useCallback(async () => {
        try {
            const res = await fetch(
                `/api/public/webapps/queue/${instanceId}/state?token=${encodeURIComponent(token)}`,
                { cache: "no-store" },
            );
            if (!res.ok) {
                setFetchError("Impossibile caricare lo stato.");
                return;
            }
            const data = await res.json();
            setState(data);
            setMessageInput(data.displayMessage ?? "");
            setAccentInput(data.accentColor ?? data.defaultAccentColor ?? "#2563EB");
            setFetchError(null);
        } catch {
            setFetchError("Errore di rete.");
        }
    }, [instanceId, token]);

    useEffect(() => {
        fetchState();
    }, [fetchState]);

    useEffect(() => {
        if (!state) return;
        const interval = Math.max((state.refreshSeconds ?? 5) * 1000, 3000);
        timerRef.current = setTimeout(fetchState, interval);
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

    const sendControl = useCallback(
        async (body: Record<string, unknown>) => {
            setActionState("loading");
            setActionMessage(null);
            try {
                const res = await fetch(
                    `/api/public/webapps/queue/${instanceId}/control?token=${encodeURIComponent(token)}`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                    },
                );

                const data = await res.json().catch(() => null);

                if (!res.ok) {
                    setActionState("error");
                    setActionMessage(data?.error ?? "Operazione non riuscita");
                    return;
                }

                setActionState("success");
                setActionMessage("Aggiornamento applicato");
                await fetchState();
            } catch {
                setActionState("error");
                setActionMessage("Errore di rete");
            } finally {
                setTimeout(() => setActionState("idle"), 1200);
            }
        },
        [instanceId, token, fetchState],
    );

    if (!state && !fetchError) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-950">
                <div className="animate-pulse text-white text-xl font-light tracking-widest">
                    CARICAMENTO…
                </div>
            </div>
        );
    }

    if (fetchError) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-950">
                <p className="text-red-400 text-lg">{fetchError}</p>
            </div>
        );
    }

    const accent = state!.accentColor ?? "#2563EB";
    const isBusy = actionState === "loading";
    const issueDisabled = isBusy || !state!.bookingEnabled;

    return (
        <div
            className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2937,transparent_40%),linear-gradient(180deg,#030712,#111827)] px-4 py-8 text-white"
            data-testid="queue-remote-app"
        >
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 lg:grid lg:grid-cols-[1.2fr_0.8fr]">
                <section className="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-2xl backdrop-blur">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
                        <div>
                            <p className="text-xs uppercase tracking-[0.35em] text-white/40">Console operatore</p>
                            <h1 className="mt-2 text-3xl font-black uppercase tracking-[0.12em]">
                                {state!.queueName}
                            </h1>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.22em] text-white/45">
                                <span className="rounded-full border border-white/10 px-3 py-1">{state!.serviceMode}</span>
                                <span className="rounded-full border border-white/10 px-3 py-1">
                                    booking {state!.bookingEnabled ? "on" : "off"}
                                </span>
                                {state!.serviceMode === "round-robin" && (
                                    <span className="rounded-full border border-white/10 px-3 py-1">
                                        ciclo 1-{state!.roundRobinMaxNumber}
                                    </span>
                                )}
                            </div>
                            <p className="mt-3 text-sm text-white/50">
                                Prossimo da servire: <span className="font-semibold text-white">{state!.nextServingDisplayNumber ?? "—"}</span>
                                {state!.bookingEnabled && (
                                    <>
                                        {" · "}
                                        prossimo ticket: <span className="font-semibold text-white">{state!.nextDisplayNumber}</span>
                                    </>
                                )}
                            </p>
                        </div>

                        <div className="grid min-w-[220px] grid-cols-2 gap-3 text-right">
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                <p className="text-[11px] uppercase tracking-[0.28em] text-white/35">Servito</p>
                                <p className="mt-1 text-3xl font-black" style={{ color: accent }}>
                                    {state!.currentServing ?? "—"}
                                </p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                <p className="text-[11px] uppercase tracking-[0.28em] text-white/35">In attesa</p>
                                <p className="mt-1 text-3xl font-black">{state!.waitingCount}</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
                        <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
                            <p className="text-xs uppercase tracking-[0.32em] text-white/40">Numero al banco</p>
                            <div
                                className="mt-3 text-[min(16vw,9rem)] font-black leading-none tabular-nums"
                                style={{ color: accent }}
                                data-testid="queue-serving-number"
                            >
                                {state!.currentServing ?? "—"}
                            </div>
                            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <button
                                    onClick={() => sendControl({ action: "retreat" })}
                                    disabled={isBusy}
                                    aria-label="Indietro"
                                    className="rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-left transition hover:border-white/40 disabled:opacity-40"
                                >
                                    <span className="block text-xs uppercase tracking-[0.28em] text-white/40">Indietro</span>
                                    <span className="mt-3 block text-2xl font-black">←</span>
                                </button>

                                <button
                                    onClick={() => sendControl({ action: "advance" })}
                                    disabled={isBusy}
                                    aria-label="Avanza"
                                    style={{ backgroundColor: accent, color: "#020617" }}
                                    className="rounded-2xl px-4 py-4 text-left shadow-lg transition hover:brightness-110 disabled:opacity-40"
                                >
                                    <span className="block text-xs uppercase tracking-[0.28em] opacity-75">Avanza</span>
                                    <span className="mt-3 block text-2xl font-black">→</span>
                                </button>

                                <button
                                    onClick={() => sendControl({ action: "issue" })}
                                    disabled={issueDisabled}
                                    aria-label="Emetti nuovo numero"
                                    className="rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-left transition hover:border-white/40 disabled:opacity-40"
                                >
                                    <span className="block text-xs uppercase tracking-[0.28em] text-white/40">Nuovo ticket</span>
                                    <span className="mt-3 block text-2xl font-black">+1</span>
                                </button>

                                <button
                                    onClick={() => {
                                        if (window.confirm("Confermi il reset completo della coda?")) {
                                            void sendControl({ action: "reset", keepHistory: false });
                                        }
                                    }}
                                    disabled={isBusy}
                                    className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-4 text-left transition hover:border-rose-300/60 disabled:opacity-40"
                                >
                                    <span className="block text-xs uppercase tracking-[0.28em] text-rose-200/70">Reset</span>
                                    <span className="mt-3 block text-xl font-black text-rose-100">Azzera</span>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
                                <p className="text-xs uppercase tracking-[0.32em] text-white/40">Salta al numero</p>
                                <div className="mt-4 flex flex-col gap-3">
                                    <select
                                        value={jumpSelection}
                                        onChange={(e) => setJumpSelection(e.target.value)}
                                        className="w-full rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-sm text-white outline-none"
                                    >
                                        <option value="">Seleziona il prossimo target</option>
                                        {jumpOptions.map((option) => (
                                            <option key={option} value={option} className="bg-slate-900 text-white">
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="flex gap-3">
                                        <input
                                            type="text"
                                            value={customInput}
                                            onChange={(e) => setCustomInput(e.target.value.toUpperCase())}
                                            placeholder="Numero custom"
                                            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none"
                                        />
                                        <button
                                            onClick={() => {
                                                const displayNumber = jumpSelection || customInput.trim();
                                                if (!displayNumber) return;
                                                void sendControl({ action: "set", displayNumber });
                                                setCustomInput("");
                                                setJumpSelection("");
                                            }}
                                            disabled={isBusy || (!jumpSelection && !customInput.trim())}
                                            className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-950 transition disabled:opacity-40"
                                            style={{ backgroundColor: accent }}
                                        >
                                            Imposta
                                        </button>
                                    </div>
                                    <p className="text-xs text-white/40">
                                        La selezione riallinea il numero corrente. In round robin puoi saltare dentro il ciclo libero; in reservation promuovi un prenotato o imposti un override manuale.
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
                                <p className="text-xs uppercase tracking-[0.32em] text-white/40">Ultimi chiamati</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {state!.history.length > 0 ? state!.history.slice().reverse().map((entry) => (
                                        <span
                                            key={`${entry.displayNumber}-${entry.calledAt}`}
                                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold text-white/70"
                                        >
                                            {entry.displayNumber}
                                        </span>
                                    )) : (
                                        <span className="text-sm text-white/35">Nessuna chiamata registrata</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {!state!.bookingEnabled && (
                            <div className="rounded-[1.75rem] border border-amber-400/20 bg-amber-500/10 p-5 text-sm text-amber-100">
                                Prenotazione disabilitata: il banco puo&apos; continuare a servire solo con avanzamento manuale o round robin libero.
                            </div>
                        )}
                    </div>
                </section>

                <aside className="space-y-6">
                    <section className="rounded-[2rem] border border-white/10 bg-white/6 p-5 shadow-xl backdrop-blur">
                        <div className="flex items-center justify-between">
                            <p className="text-xs uppercase tracking-[0.32em] text-white/40">Display remoto</p>
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: accent }} />
                        </div>

                        <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-slate-950/90 p-5">
                            <p className="text-[11px] uppercase tracking-[0.3em] text-white/35">Anteprima tabellone</p>
                            <p className="mt-4 text-6xl font-black leading-none" style={{ color: accent }}>
                                {state!.currentServing ?? "—"}
                            </p>
                            <p className="mt-3 text-sm text-white/50">
                                Messaggio: {state!.displayMessage ?? "nessuno"}
                            </p>
                        </div>

                        <div className="mt-5 space-y-4">
                            <div>
                                <label className="text-xs uppercase tracking-[0.28em] text-white/40">Messaggio a video</label>
                                <textarea
                                    value={messageInput}
                                    onChange={(e) => setMessageInput(e.target.value)}
                                    rows={3}
                                    maxLength={120}
                                    placeholder="Esempio: dirigersi allo sportello 2"
                                    className="mt-2 w-full rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none"
                                />
                            </div>

                            <div>
                                <label className="text-xs uppercase tracking-[0.28em] text-white/40">Colore live</label>
                                <div className="mt-2 flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={accentInput}
                                        onChange={(e) => setAccentInput(e.target.value)}
                                        className="h-11 w-16 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                                    />
                                    <input
                                        type="text"
                                        value={accentInput}
                                        onChange={(e) => setAccentInput(e.target.value)}
                                        className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-sm text-white outline-none"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => sendControl({ action: "display", message: messageInput, accentColor: accentInput })}
                                    disabled={isBusy}
                                    className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-950 transition disabled:opacity-40"
                                    style={{ backgroundColor: accent }}
                                >
                                    Applica display
                                </button>
                                <button
                                    onClick={() => {
                                        setMessageInput("");
                                        setAccentInput(state!.defaultAccentColor);
                                        void sendControl({ action: "display", message: null, accentColor: state!.defaultAccentColor });
                                    }}
                                    disabled={isBusy}
                                    className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold transition hover:border-white/35 disabled:opacity-40"
                                >
                                    Ripristina
                                </button>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-[2rem] border border-white/10 bg-white/6 p-5 shadow-xl backdrop-blur">
                        <p className="text-xs uppercase tracking-[0.32em] text-white/40">Coda in attesa</p>
                        <div className="mt-4 flex max-h-[420px] flex-col gap-2 overflow-auto pr-1">
                            {state!.waitingQueue.length > 0 ? state!.waitingQueue.map((entry, index) => (
                                <button
                                    key={`${entry.seq}-${entry.displayNumber}`}
                                    onClick={() => {
                                        setJumpSelection(entry.displayNumber);
                                        setCustomInput("");
                                    }}
                                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left transition hover:border-white/30"
                                >
                                    <span>
                                        <span className="block text-[11px] uppercase tracking-[0.28em] text-white/30">Posizione {index + 1}</span>
                                        <span className="mt-1 block text-xl font-black" style={{ color: accent }}>
                                            {entry.displayNumber}
                                        </span>
                                    </span>
                                    <span className="text-xs text-white/35">Seleziona</span>
                                </button>
                            )) : (
                                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/35">
                                    Nessun numero in attesa.
                                </div>
                            )}
                        </div>
                    </section>
                </aside>
            </div>

            <div className="mx-auto mt-4 h-6 w-full max-w-7xl text-sm">
                {actionState === "success" && (
                    <span className="text-green-400">✓ {actionMessage ?? "Aggiornato"}</span>
                )}
                {actionState === "error" && (
                    <span className="text-red-400">{actionMessage ?? "Errore — riprova"}</span>
                )}
            </div>
        </div>
    );
}
