"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

import { initWebappRealtimeClient } from "@/lib/sdk/realtime-client";

interface KioskQueueSummary {
    datasetId: string;
    queueName: string;
    currentServing: string | null;
    waitingCount: number;
    queueType: "numeric" | "alpha";
    prefix: string;
    bookingEnabled: boolean;
    serviceMode: "reservation" | "round-robin" | "multigate";
    nextDisplayNumber: string | null;
}

interface KioskState {
    mode: "kiosk";
    kioskQueues: KioskQueueSummary[];
    refreshSeconds: number;
    ticketDeliveryMode?: "print" | "qr" | "both";
    enableDigitalTicket?: boolean;
}

interface TicketPayload {
    queueName: string;
    displayNumber: string;
    issuedAt: string;
    printablePayloadVersion: number;
    kioskInstanceId?: string;
    ticketDeliveryMode?: string;
    enableDigitalTicket?: boolean;
    trackingCode?: string;
    trackingUrl?: string;
}

interface Props {
    instanceId: string;
    token: string;
    channelKeys: string[];
}

export default function QueuePlusKioskApp({ instanceId, token, channelKeys }: Props) {
    const [state, setState] = useState<KioskState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busyQueue, setBusyQueue] = useState<string | null>(null);
    const [issuedTicket, setIssuedTicket] = useState<{ queueName: string; displayNumber: string } | null>(null);
    const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
    const [trackingCode, setTrackingCode] = useState<string | null>(null);
    const [qrExpiresAtMs, setQrExpiresAtMs] = useState<number | null>(null);
    const [qrAvailable, setQrAvailable] = useState<boolean>(false);
    const [nowMs, setNowMs] = useState<number>(() => Date.now());
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const channelSignature = useMemo(() => channelKeys.join("|"), [channelKeys]);

    const fetchState = useCallback(async () => {
        try {
            const res = await fetch(
                `/api/public/webapps/queue-plus/${instanceId}/state?token=${encodeURIComponent(token)}`,
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

    useEffect(() => {
        if (!qrAvailable) return;

        const timer = setInterval(() => {
            setNowMs(Date.now());
        }, 1000);

        return () => {
            clearInterval(timer);
        };
    }, [qrAvailable]);

    const qrSecondsRemaining = qrExpiresAtMs ? Math.max(0, Math.ceil((qrExpiresAtMs - nowMs) / 1000)) : 0;

    useEffect(() => {
        if (!qrAvailable || !qrExpiresAtMs) return;
        if (qrSecondsRemaining > 0) return;

        setQrAvailable(false);
        setTrackingUrl(null);
    }, [qrAvailable, qrExpiresAtMs, qrSecondsRemaining]);

    useEffect(() => {
        if (!trackingCode || !qrAvailable) return;

        const timer = setInterval(async () => {
            try {
                const res = await fetch(`/api/public/webapps/queue-plus/tickets/${encodeURIComponent(trackingCode)}/qr-status`, {
                    cache: "no-store",
                });
                if (!res.ok) return;

                const status = await res.json() as { qrAvailable?: boolean };
                if (status.qrAvailable === false) {
                    setQrAvailable(false);
                    setTrackingUrl(null);
                }
            } catch {
                // ignore transient polling errors
            }
        }, 5000);

        return () => {
            clearInterval(timer);
        };
    }, [trackingCode, qrAvailable]);

    async function issueForQueue(datasetId: string, queueName: string) {
        setBusyQueue(queueName);
        setError(null);
        try {
            const res = await fetch(
                `/api/public/webapps/queue-plus/${instanceId}/control?token=${encodeURIComponent(token)}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "issueForQueue", datasetId }),
                },
            );
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                setError(typeof data?.error === "string" ? data.error : "Impossibile emettere il ticket");
                return;
            }
            if (data?.ticket?.displayNumber) {
                const ticket = data.ticket as TicketPayload;
                setIssuedTicket({ queueName: ticket.queueName, displayNumber: ticket.displayNumber });
                setTrackingUrl(ticket.trackingUrl ?? null);
                setTrackingCode(ticket.trackingCode ?? null);
                setQrExpiresAtMs(Date.now() + 60_000);
                setQrAvailable(Boolean(ticket.trackingUrl));
            }
            await fetchState();
        } catch {
            setError("Errore di rete.");
        } finally {
            setBusyQueue(null);
        }
    }

    if (!state && !error) return <div className="flex h-screen items-center justify-center bg-slate-950 text-white">Caricamento…</div>;
    if (error || !state) return <div className="flex h-screen items-center justify-center bg-slate-950 text-red-400">{error ?? "Stato non disponibile"}</div>;

    return (
        <div className="min-h-screen bg-[linear-gradient(180deg,#fafaf9,#e7e5e4)] px-6 py-8 text-slate-950">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="rounded-[2rem] bg-white p-8 shadow-lg">
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-500">QueuePLUS Kiosk</p>
                    <h1 className="mt-3 text-4xl font-black uppercase tracking-[0.12em]">Prenota il tuo ticket</h1>
                    <p className="mt-3 max-w-3xl text-slate-600">Seleziona la coda desiderata. QueuePLUS usa dataset sandboxed indipendenti e puo&apos; emettere ticket cartacei o digitali.</p>
                </header>
                {issuedTicket && (
                    <section className="rounded-[2rem] bg-slate-950 p-8 text-center text-white shadow-lg">
                        <p className="text-xs uppercase tracking-[0.35em] text-white/45">Ultimo ticket emesso</p>
                        <p className="mt-3 text-sm text-white/60">{issuedTicket.queueName}</p>
                        <p className="mt-4 text-7xl font-black">{issuedTicket.displayNumber}</p>
                        {state.enableDigitalTicket && <p className="mt-4 text-sm text-white/60">Ticket digitale abilitato in configurazione QueuePLUS</p>}
                        {trackingUrl && qrAvailable && (
                            <div className="mt-5 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
                                <p className="text-xs uppercase tracking-[0.25em] text-white/50">Tracking pubblico</p>
                                <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-cyan-300 underline">{trackingUrl}</a>
                                <p className="text-xs text-white/50">QR valido per {qrSecondsRemaining}s</p>
                                <Image
                                    alt="QR Ticket"
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(trackingUrl)}`}
                                    width={160}
                                    height={160}
                                    unoptimized
                                    className="mx-auto h-40 w-40 rounded-lg border border-white/10 bg-white"
                                />
                            </div>
                        )}
                        {!qrAvailable && state.enableDigitalTicket && (
                            <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/65">
                                QR non piu&apos; disponibile. Usa il nuovo ticket per generare un nuovo QR.
                            </div>
                        )}
                    </section>
                )}
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {state.kioskQueues.map((queue) => (
                        <div key={queue.datasetId} className="rounded-[2rem] bg-white p-6 shadow-lg">
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
                                {!queue.bookingEnabled ? "Prenotazione disabilitata" : busyQueue === queue.queueName ? "Emissione…" : `Prenota ${queue.queueName}`}
                            </button>
                        </div>
                    ))}
                </section>
            </div>
        </div>
    );
}
