"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { initWebappRealtimeClient } from "@/lib/sdk/realtime-client";

interface KioskQueueSummary {
    datasetId: string;
    queueName: string;
    currentServing: string | null;
    waitingCount: number;
    queueType: "numeric" | "alpha";
    prefix: string;
    bookingEnabled: boolean;
    serviceMode: "reservation" | "round-robin";
    nextDisplayNumber: string | null;
}

interface KioskState {
    mode: "kiosk";
    kioskQueues: KioskQueueSummary[];
    refreshSeconds: number;
}

interface TicketPayload {
    queueName: string;
    displayNumber: string;
    issuedAt: string;
    printablePayloadVersion: number;
    kioskInstanceId?: string;
}

interface Props {
    instanceId: string;
    token: string;
    channelKeys: string[];
}

export default function QueueKioskApp({ instanceId, token, channelKeys }: Props) {
    const [state, setState] = useState<KioskState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busyQueue, setBusyQueue] = useState<string | null>(null);
    const [issuedTicket, setIssuedTicket] = useState<{ queueName: string; displayNumber: string } | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const channelSignature = useMemo(() => channelKeys.join("|"), [channelKeys]);

    const fetchState = useCallback(async () => {
        try {
            const res = await fetch(
                `/api/public/webapps/queue/${instanceId}/state?token=${encodeURIComponent(token)}`,
                { cache: "no-store" },
            );
            if (!res.ok) {
                setError("Impossibile caricare il kiosk.");
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

    async function issueForQueue(datasetId: string, queueName: string) {
        setBusyQueue(queueName);
        setError(null);
        try {
            const res = await fetch(
                `/api/public/webapps/queue/${instanceId}/control?token=${encodeURIComponent(token)}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "issueForQueue", datasetId }),
                },
            );

            const data = await res.json().catch(() => null);
            if (!res.ok) {
                const errMsg = typeof data?.error === "string" ? data.error : "Impossibile emettere il ticket";
                setError(errMsg);
                return;
            }

            if (data?.ticket?.displayNumber) {
                const ticket = data.ticket as TicketPayload;
                setIssuedTicket({ queueName: ticket.queueName, displayNumber: ticket.displayNumber });
            } else if (typeof data?.currentServing === "string") {
                setIssuedTicket({ queueName, displayNumber: data.currentServing });
            }
            await fetchState();
        } catch {
            setError("Errore di rete.");
        } finally {
            setBusyQueue(null);
        }
    }

    if (!state && !error) {
        return <div className="flex h-screen items-center justify-center bg-slate-950 text-white">Caricamento…</div>;
    }

    if (error || !state) {
        return <div className="flex h-screen items-center justify-center bg-slate-950 text-red-400">{error ?? "Stato non disponibile"}</div>;
    }

    return (
        <div className="min-h-screen bg-[linear-gradient(180deg,#fafaf9,#e7e5e4)] px-6 py-8 text-slate-950">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="rounded-[2rem] bg-white p-8 shadow-lg">
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Queue Kiosk</p>
                    <h1 className="mt-3 text-4xl font-black uppercase tracking-[0.12em]">Prenota il tuo ticket</h1>
                    <p className="mt-3 max-w-3xl text-slate-600">
                        Seleziona la coda desiderata. Il kiosk attinge dalle code configurate sull&apos;istanza e genera solo ticket consentiti.
                    </p>
                </header>

                {issuedTicket && (
                    <section className="rounded-[2rem] bg-slate-950 p-8 text-center text-white shadow-lg">
                        <p className="text-xs uppercase tracking-[0.35em] text-white/45">Ultimo ticket emesso</p>
                        <p className="mt-3 text-sm text-white/60">{issuedTicket.queueName}</p>
                        <p className="mt-4 text-7xl font-black">{issuedTicket.displayNumber}</p>
                    </section>
                )}

                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {state.kioskQueues.map((queue) => (
                        <div key={queue.queueName} className="rounded-[2rem] bg-white p-6 shadow-lg">
                            <p className="text-xs uppercase tracking-[0.32em] text-slate-500">{queue.serviceMode}</p>
                            <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.08em]">{queue.queueName}</h2>
                            <div className="mt-5 space-y-2 text-sm text-slate-600">
                                <p>In servizio: <span className="font-semibold text-slate-950">{queue.currentServing ?? "—"}</span></p>
                                <p>In attesa: <span className="font-semibold text-slate-950">{queue.waitingCount}</span></p>
                                <p>Prossimo ticket: <span className="font-semibold text-slate-950">{queue.nextDisplayNumber ?? "—"}</span></p>
                            </div>
                            <button
                                onClick={() => void issueForQueue(queue.datasetId, queue.queueName)}
                                disabled={!queue.bookingEnabled || busyQueue === queue.queueName}
                                className="mt-6 w-full rounded-2xl bg-slate-950 px-4 py-4 text-lg font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                            >
                                {!queue.bookingEnabled
                                    ? "Prenotazione disabilitata"
                                    : busyQueue === queue.queueName
                                        ? "Emissione…"
                                        : `Prenota ${queue.queueName}`}
                            </button>
                        </div>
                    ))}
                </section>
            </div>
        </div>
    );
}