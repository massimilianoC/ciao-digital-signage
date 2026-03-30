"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { initWebappRealtimeClient } from "@/lib/sdk/realtime-client";

interface QueueHistoryEntry {
    displayNumber: string;
    calledAt: string;
}

interface RemoteQueueSummary {
    datasetId: string;
    queueName: string;
    currentServing: string | null;
    waitingCount: number;
    accentColor: string;
}

interface QueuePlusState {
    mode: "queue" | "remote";
    datasetId: string;
    currentServing: string | null;
    waitingCount: number;
    waitingQueue: Array<{ seq: number; displayNumber: string; issuedAt: string }>;
    history: QueueHistoryEntry[];
    accentColor: string;
    defaultAccentColor: string;
    queueName: string;
    queueType: "numeric" | "alpha";
    prefix: string;
    serviceMode: "reservation" | "round-robin" | "multigate";
    bookingEnabled: boolean;
    roundRobinMaxNumber: number;
    nextServingDisplayNumber: string | null;
    nextSeq: number;
    nextDisplayNumber: string;
    displayMessage: string | null;
    refreshSeconds: number;
    publicToken: string;
    remoteQueues: RemoteQueueSummary[];
    audio?: {
        enabled: boolean;
        speechMode: "off" | "number" | "message" | "both";
        languages: string[];
        preChime: boolean;
        postChime: boolean;
    };
    allowedDisplayIds?: string[];
    availableDisplays?: Array<{ displayId: string; displayName: string; queueName: string; datasetId: string }>;
    activeDisplayId?: string | null;
    displayBindingMode?: "follow-queue" | "remote-controlled";
}

interface Props {
    instanceId: string;
    token: string;
    channelKeys: string[];
}

type ActionState = "idle" | "loading" | "success" | "error";

interface DisplayLockState {
    locked: boolean;
    isOwnedByMe: boolean;
    leaseExpiresAt: string | null;
    ownerInstanceId: string | null;
    displayId: string | null;
}

function buildCandidateNumber(seq: number, queueType: "numeric" | "alpha", prefix: string): string {
    if (queueType === "alpha") {
        const normalizedPrefix = (prefix || "A").toUpperCase();
        return `${normalizedPrefix}${String(seq).padStart(3, "0")}`;
    }
    return String(seq);
}

export default function QueuePlusRemoteApp({ instanceId, token, channelKeys }: Props) {
    const [state, setState] = useState<QueuePlusState | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [actionState, setActionState] = useState<ActionState>("idle");
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [customInput, setCustomInput] = useState("");
    const [jumpSelection, setJumpSelection] = useState("");
    const [messageInput, setMessageInput] = useState("");
    const [accentInput, setAccentInput] = useState("#2563EB");
    const [selectedDatasetId, setSelectedDatasetId] = useState("");
    const [selectedDisplayId, setSelectedDisplayId] = useState("");
    const [lockState, setLockState] = useState<DisplayLockState>({
        locked: false,
        isOwnedByMe: false,
        leaseExpiresAt: null,
        ownerInstanceId: null,
        displayId: null,
    });
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const channelSignature = useMemo(() => channelKeys.join("|"), [channelKeys]);

    const jumpOptions = state
        ? Array.from({ length: 12 }, (_, offset) => buildCandidateNumber(state.nextSeq + offset, state.queueType, state.prefix))
        : [];

    const fetchState = useCallback(async () => {
        try {
            const datasetSuffix = selectedDatasetId ? `&datasetId=${encodeURIComponent(selectedDatasetId)}` : "";
            const res = await fetch(
                `/api/public/webapps/queue-plus/${instanceId}/state?token=${encodeURIComponent(token)}${datasetSuffix}`,
                { cache: "no-store" },
            );
            if (!res.ok) {
                setFetchError("Impossibile caricare lo stato.");
                return;
            }
            const data = await res.json();
            setState(data);
            setSelectedDatasetId((prev) => prev || data.datasetId || "");
            setSelectedDisplayId((prev) => {
                if (prev) return prev;
                if (data.activeDisplayId) return data.activeDisplayId;

                const firstAvailable = Array.isArray(data.availableDisplays) && data.availableDisplays.length > 0
                    ? data.availableDisplays[0].displayId
                    : Array.isArray(data.allowedDisplayIds) && data.allowedDisplayIds.length > 0
                        ? data.allowedDisplayIds[0]
                        : "";

                return firstAvailable;
            });
            setMessageInput(data.displayMessage ?? "");
            setAccentInput(data.accentColor ?? data.defaultAccentColor ?? "#2563EB");
            setFetchError(null);
        } catch {
            setFetchError("Errore di rete.");
        }
    }, [instanceId, selectedDatasetId, token]);

    useEffect(() => {
        void fetchState();
    }, [fetchState]);

    useEffect(() => {
        if (!state) return;
        const interval = Math.max((state.refreshSeconds ?? 5) * 1000, 3000);
        timerRef.current = setTimeout(() => void fetchState(), interval);
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

    const sendControl = useCallback(async (body: Record<string, unknown>) => {
        setActionState("loading");
        setActionMessage(null);
        try {
            const res = await fetch(
                `/api/public/webapps/queue-plus/${instanceId}/control?token=${encodeURIComponent(token)}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        datasetId: selectedDatasetId || undefined,
                        displayId: selectedDisplayId || undefined,
                        ...body,
                    }),
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
    }, [fetchState, instanceId, selectedDatasetId, selectedDisplayId, token]);

    const callLockApi = useCallback(async (action: "acquire" | "renew" | "release" | "status") => {
        if (!selectedDisplayId) return null;

        const res = await fetch(
            `/api/public/webapps/queue-plus/${instanceId}/lock?token=${encodeURIComponent(token)}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action,
                    datasetId: selectedDatasetId || undefined,
                    displayId: selectedDisplayId,
                }),
            },
        );

        const payload = await res.json().catch(() => null);
        if (!res.ok) {
            setActionMessage(payload?.error ?? "Operazione lock non riuscita");
            return null;
        }

        if (action === "status") {
            setLockState({
                locked: payload?.locked === true,
                isOwnedByMe: payload?.isOwnedByMe === true,
                leaseExpiresAt: payload?.leaseExpiresAt ?? null,
                ownerInstanceId: payload?.ownerInstanceId ?? null,
                displayId: payload?.displayId ?? selectedDisplayId,
            });
        } else {
            setLockState((prev) => ({
                ...prev,
                locked: action !== "release",
                isOwnedByMe: action !== "release",
                leaseExpiresAt: payload?.leaseExpiresAt ?? null,
                ownerInstanceId: action === "release" ? null : instanceId,
                displayId: payload?.displayId ?? selectedDisplayId,
            }));
        }

        return payload;
    }, [instanceId, selectedDatasetId, selectedDisplayId, token]);

    useEffect(() => {
        if (!state) return;
        if (state.serviceMode !== "multigate" || state.displayBindingMode !== "remote-controlled") return;
        if (!selectedDisplayId) return;

        void callLockApi("status");

        const timer = setInterval(() => {
            void callLockApi("status");
        }, 5000);

        return () => {
            clearInterval(timer);
        };
    }, [callLockApi, selectedDisplayId, state]);

    if (!state && !fetchError) return <div className="flex h-screen items-center justify-center bg-gray-950"><div className="animate-pulse text-xl font-light tracking-widest text-white">CARICAMENTO…</div></div>;
    if (fetchError || !state) return <div className="flex h-screen items-center justify-center bg-gray-950"><p className="text-lg text-red-400">{fetchError ?? "Stato non disponibile"}</p></div>;

    const accent = state.accentColor ?? "#2563EB";
    const isBusy = actionState === "loading";
    const requiresDisplayLock = state.serviceMode === "multigate";
    const hasLockControl = !requiresDisplayLock || lockState.isOwnedByMe;
    const issueDisabled = isBusy || !state.bookingEnabled || !hasLockControl;
    const displayOptions = Array.isArray(state.availableDisplays) && state.availableDisplays.length > 0
        ? state.availableDisplays
        : (state.allowedDisplayIds ?? []).map((displayId) => ({
            displayId,
            displayName: displayId,
            queueName: "",
            datasetId: state.datasetId,
        }));

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2937,transparent_40%),linear-gradient(180deg,#030712,#111827)] px-4 py-8 text-white" data-testid="queue-plus-remote-app">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 lg:grid lg:grid-cols-[1.2fr_0.8fr]">
                <section className="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-2xl backdrop-blur">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
                        <div>
                            <p className="text-xs uppercase tracking-[0.35em] text-white/40">Console operatore QueuePLUS</p>
                            <h1 className="mt-2 text-3xl font-black uppercase tracking-[0.12em]">{state.queueName}</h1>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.22em] text-white/45">
                                <span className="rounded-full border border-white/10 px-3 py-1">{state.serviceMode}</span>
                                <span className="rounded-full border border-white/10 px-3 py-1">booking {state.bookingEnabled ? "on" : "off"}</span>
                                <span className="rounded-full border border-white/10 px-3 py-1">sandbox sdk</span>
                            </div>
                            <p className="mt-3 text-sm text-white/50">Prossimo da servire: <span className="font-semibold text-white">{state.nextServingDisplayNumber ?? "—"}</span>{state.bookingEnabled && <> · prossimo ticket: <span className="font-semibold text-white">{state.nextDisplayNumber}</span></>}</p>
                        </div>
                        <div className="grid min-w-[220px] grid-cols-2 gap-3 text-right">
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[11px] uppercase tracking-[0.28em] text-white/35">Servito</p><p className="mt-1 text-3xl font-black" style={{ color: accent }}>{state.currentServing ?? "—"}</p></div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[11px] uppercase tracking-[0.28em] text-white/35">In attesa</p><p className="mt-1 text-3xl font-black">{state.waitingCount}</p></div>
                        </div>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        <div className="space-y-2">
                            <label className="text-xs uppercase tracking-[0.28em] text-white/45">Coda attiva</label>
                            <select
                                value={selectedDatasetId || state.datasetId}
                                onChange={(event) => setSelectedDatasetId(event.target.value)}
                                className="w-full rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-sm text-white outline-none"
                            >
                                {(state.remoteQueues ?? []).map((queue) => (
                                    <option key={queue.datasetId} value={queue.datasetId} className="bg-slate-900 text-white">{queue.queueName} ({queue.waitingCount})</option>
                                ))}
                            </select>
                        </div>
                        {state.serviceMode === "multigate" && (
                            <div className="space-y-2">
                                <label className="text-xs uppercase tracking-[0.28em] text-white/45">Display attivo</label>
                                <select
                                    value={selectedDisplayId}
                                    onChange={(event) => setSelectedDisplayId(event.target.value)}
                                    className="w-full rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-sm text-white outline-none"
                                >
                                    <option value="">Seleziona display</option>
                                    {displayOptions.map((display) => (
                                        <option key={display.displayId} value={display.displayId} className="bg-slate-900 text-white">
                                            {display.displayName}{display.queueName ? ` - ${display.queueName}` : ""}
                                        </option>
                                    ))}
                                </select>
                                {displayOptions.length === 0 && (
                                    <p className="text-xs text-amber-300">Nessun display disponibile per la coda selezionata.</p>
                                )}
                                {requiresDisplayLock && (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => void callLockApi("acquire")}
                                            disabled={!selectedDisplayId}
                                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold transition hover:border-white/35 disabled:opacity-40"
                                        >
                                            Acquisisci lock
                                        </button>
                                        <button
                                            onClick={() => void callLockApi("release")}
                                            disabled={!selectedDisplayId || !lockState.isOwnedByMe}
                                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold transition hover:border-white/35 disabled:opacity-40"
                                        >
                                            Rilascia
                                        </button>
                                        <button
                                            onClick={() => void callLockApi("status")}
                                            disabled={!selectedDisplayId}
                                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold transition hover:border-white/35 disabled:opacity-40"
                                        >
                                            Stato
                                        </button>
                                    </div>
                                )}
                                {requiresDisplayLock && (
                                    <p className={`text-xs ${lockState.isOwnedByMe ? "text-emerald-300" : "text-amber-300"}`}>
                                        {lockState.isOwnedByMe
                                            ? `Lock attivo su ${lockState.displayId ?? selectedDisplayId}`
                                            : "Lock non acquisito: i controlli remoti sono bloccati"}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
                        <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
                            <p className="text-xs uppercase tracking-[0.32em] text-white/40">Numero al banco</p>
                            <div className="mt-3 text-[min(16vw,9rem)] font-black leading-none tabular-nums" style={{ color: accent }}>{state.currentServing ?? "—"}</div>
                            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <button onClick={() => void sendControl({ action: "retreat" })} disabled={isBusy || !hasLockControl} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-left transition hover:border-white/40 disabled:opacity-40"><span className="block text-xs uppercase tracking-[0.28em] text-white/40">Indietro</span><span className="mt-3 block text-2xl font-black">←</span></button>
                                <button onClick={() => void sendControl({ action: "advance" })} disabled={isBusy || !hasLockControl} style={{ backgroundColor: accent, color: "#020617" }} className="rounded-2xl px-4 py-4 text-left shadow-lg transition hover:brightness-110 disabled:opacity-40"><span className="block text-xs uppercase tracking-[0.28em] opacity-75">Avanza</span><span className="mt-3 block text-2xl font-black">→</span></button>
                                <button onClick={() => void sendControl({ action: "issue" })} disabled={issueDisabled} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-left transition hover:border-white/40 disabled:opacity-40"><span className="block text-xs uppercase tracking-[0.28em] text-white/40">Nuovo ticket</span><span className="mt-3 block text-2xl font-black">+1</span></button>
                                <button onClick={() => { if (window.confirm("Confermi il reset completo della coda?")) { void sendControl({ action: "reset", keepHistory: false }); } }} disabled={isBusy || !hasLockControl} className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-4 text-left transition hover:border-rose-300/60 disabled:opacity-40"><span className="block text-xs uppercase tracking-[0.28em] text-rose-200/70">Reset</span><span className="mt-3 block text-xl font-black text-rose-100">Azzera</span></button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
                                <p className="text-xs uppercase tracking-[0.32em] text-white/40">Salta al numero</p>
                                <div className="mt-4 flex flex-col gap-3">
                                    <select value={jumpSelection} onChange={(event) => setJumpSelection(event.target.value)} className="w-full rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-sm text-white outline-none">
                                        <option value="">Seleziona il prossimo target</option>
                                        {jumpOptions.map((option) => <option key={option} value={option} className="bg-slate-900 text-white">{option}</option>)}
                                    </select>
                                    <div className="flex gap-3">
                                        <input type="text" value={customInput} onChange={(event) => setCustomInput(event.target.value.toUpperCase())} placeholder="Numero custom" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none" />
                                        <button onClick={() => { const displayNumber = jumpSelection || customInput.trim(); if (!displayNumber) return; void sendControl({ action: "set", displayNumber }); setCustomInput(""); setJumpSelection(""); }} disabled={isBusy || !hasLockControl || (!jumpSelection && !customInput.trim())} className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-950 transition disabled:opacity-40" style={{ backgroundColor: accent }}>Imposta</button>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
                                <p className="text-xs uppercase tracking-[0.32em] text-white/40">Audio e messaggio display</p>
                                <div className="mt-4 space-y-3">
                                    <input type="text" value={messageInput} onChange={(event) => setMessageInput(event.target.value)} placeholder="Messaggio per il display" className="w-full rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none" />
                                    <div className="flex gap-3">
                                        <input type="color" value={accentInput} onChange={(event) => setAccentInput(event.target.value)} className="h-12 w-16 rounded-xl border border-white/15 bg-white/8 p-1" />
                                        <button onClick={() => void sendControl({ action: "display", message: messageInput || null, accentColor: accentInput || null })} disabled={isBusy || !hasLockControl} className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold transition hover:border-white/35 disabled:opacity-40">Aggiorna preview display</button>
                                    </div>
                                    {state.audio?.enabled && <p className="text-xs text-white/45">Audio: {state.audio.speechMode} · lingue {state.audio.languages.join(", ")}</p>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {actionMessage && <p className={`mt-4 text-sm ${actionState === "error" ? "text-rose-300" : "text-emerald-300"}`}>{actionMessage}</p>}
                </section>

                <aside className="space-y-5">
                    <section className="rounded-[2rem] border border-white/10 bg-white/6 p-5 shadow-2xl backdrop-blur">
                        <p className="text-xs uppercase tracking-[0.32em] text-white/40">Attesa live</p>
                        <div className="mt-4 space-y-3">
                            {state.waitingQueue.length > 0 ? state.waitingQueue.slice(0, 8).map((entry) => (
                                <button key={`${entry.seq}-${entry.displayNumber}`} onClick={() => void sendControl({ action: "set", displayNumber: entry.displayNumber })} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left transition hover:border-white/30">
                                    <span className="text-sm uppercase tracking-[0.24em] text-white/40">#{entry.seq}</span>
                                    <span className="text-2xl font-black" style={{ color: accent }}>{entry.displayNumber}</span>
                                </button>
                            )) : <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/35">Nessun ticket in attesa.</div>}
                        </div>
                    </section>
                    <section className="rounded-[2rem] border border-white/10 bg-white/6 p-5 shadow-2xl backdrop-blur">
                        <p className="text-xs uppercase tracking-[0.32em] text-white/40">Ultimi chiamati</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {state.history.length > 0 ? state.history.slice().reverse().map((entry) => <span key={`${entry.displayNumber}-${entry.calledAt}`} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm font-semibold text-white/70">{entry.displayNumber}</span>) : <span className="text-sm text-white/35">Storico non disponibile.</span>}
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
