"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type QueueMode = "display" | "queue" | "remote" | "waiting-list" | "kiosk";
type QueueType = "numeric" | "alpha";

interface QueueCatalogItem {
    datasetId: string;
    queueName: string;
    queueType: QueueType;
    currentServing?: string | null;
    waitingCount: number;
}

export default function NewQueuePlusConnectorPage() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [mode, setMode] = useState<QueueMode>("queue");
    const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([]);
    const [queueType, setQueueType] = useState<QueueType>("numeric");
    const [bookingEnabled, setBookingEnabled] = useState(true);
    const [prefix, setPrefix] = useState("A");
    const [maxWaiting, setMaxWaiting] = useState(99);
    const [roundRobinMaxNumber, setRoundRobinMaxNumber] = useState(99);
    const [waitingListLimit, setWaitingListLimit] = useState(8);
    const [waitingListLayout, setWaitingListLayout] = useState<"list" | "grid">("list");
    const [accentColor, setAccentColor] = useState("#2563EB");
    const [ticketDeliveryMode, setTicketDeliveryMode] = useState<"print" | "qr" | "both">("print");
    const [enableDigitalTicket, setEnableDigitalTicket] = useState(false);
    const [queueCatalog, setQueueCatalog] = useState<QueueCatalogItem[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ instanceId: string; playerUrl: string; contentId: string | null } | null>(null);

    const isKiosk = mode === "kiosk";
    const isRemote = mode === "remote";
    const isWaitingList = mode === "waiting-list";
    const isDisplay = mode === "queue";

    useEffect(() => {
        async function loadQueueCatalog() {
            try {
                const res = await fetch("/api/webapps/queue-plus/catalog", { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                setQueueCatalog(data.queues ?? []);
            } catch {
                setQueueCatalog([]);
            }
        }

        void loadQueueCatalog();
    }, []);

    function toggleSelection(current: string[], setter: (next: string[]) => void, value: string) {
        const normalized = value.trim();
        if (!normalized) return;
        setter(current.includes(normalized) ? current.filter((entry) => entry !== normalized) : [...current, normalized]);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError(null);

        try {
            // Map selectedDatasetIds to the appropriate settings field based on mode
            const baseSettings = {
                mode,
                queueType,
                serviceMode: "multigate" as const,
                displayBindingMode: "remote-controlled" as const,
                bookingEnabled,
                prefix: queueType === "alpha" ? prefix : undefined,
                maxWaiting,
                roundRobinMaxNumber,
                waitingListLimit,
                waitingListLayout,
                showWaitingCount: true,
                accentColor,
                audio: {
                    enabled: true,
                    speechMode: "number" as const,
                    languages: ["it-IT"],
                    preChime: false,
                    postChime: false,
                },
            };

            const settings = {
                ...baseSettings,
                ...(isDisplay && selectedDatasetIds.length > 0 ? { datasetId: selectedDatasetIds[0] } : {}),
                ...(isKiosk ? { kioskDatasetIds: selectedDatasetIds } : {}),
                ...(isRemote ? { allowedDatasetIds: selectedDatasetIds } : {}),
                ...(isWaitingList ? { waitingListDatasetIds: selectedDatasetIds } : {}),
                ...(isKiosk ? { ticketDeliveryMode, enableDigitalTicket } : {}),
            };

            const res = await fetch("/api/webapps/queue-plus", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, settings, defaultDurationMs: 30000 }),
            });

            if (!res.ok) {
                const data = await res.json();
                setError(JSON.stringify(data.error ?? "Errore nella creazione"));
                return;
            }

            const data = await res.json();
            setResult({ instanceId: data.instanceId, playerUrl: data.playerUrl, contentId: data.contentId });
        } finally {
            setSaving(false);
        }
    }

    if (result) {
        return (
            <div className="max-w-2xl space-y-6 p-6">
                <h1 className="text-xl font-bold text-green-600">✓ Istanza QueuePLUS creata!</h1>
                <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                    <div><p className="text-xs text-muted-foreground">Instance ID</p><p className="font-mono text-sm">{result.instanceId}</p></div>
                    <div><p className="text-xs text-muted-foreground">Player URL</p><a href={result.playerUrl} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-sm text-primary hover:underline">{result.playerUrl}</a></div>
                    {result.contentId && <div><p className="text-xs text-muted-foreground">Content ID</p><p className="font-mono text-sm">{result.contentId}</p></div>}
                </div>
                <div className="flex gap-3">
                    <Button onClick={() => router.push("/webapps/queue-plus")}>← Torna alle istanze</Button>
                    <Button variant="outline" onClick={() => router.push("/content")}>Vai a Content Library</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl space-y-6 p-6">
            <div>
                <h1 className="text-2xl font-bold">Nuova istanza QueuePLUS</h1>
                <p className="mt-1 text-sm text-muted-foreground">QueuePLUS testa SDK, sandboxing e coesistenza con Eliminacode legacy. Crea o riusa dataset dedicati senza toccare la queue storica.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                    <Label htmlFor="name">Nome istanza *</Label>
                    <Input id="name" value={name} onChange={(event) => setName(event.target.value)} required placeholder="QueuePLUS Remote Sportello 1" />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="mode">Modalita&apos; *</Label>
                    <select id="mode" value={mode} onChange={(event) => setMode(event.target.value as QueueMode)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <option value="queue">QueuePLUS Display</option>
                        <option value="remote">QueuePLUS Remote</option>
                        <option value="waiting-list">QueuePLUS Waiting List</option>
                        <option value="kiosk">QueuePLUS Kiosk</option>
                    </select>
                </div>

                {queueCatalog.length > 0 ? (
                    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Catalogo dataset QueuePLUS</p>
                        <div className="flex flex-wrap gap-2">
                            {queueCatalog.map((item) => {
                                const selected = selectedDatasetIds.includes(item.datasetId);
                                return (
                                    <button key={item.datasetId} type="button" onClick={() => toggleSelection(selectedDatasetIds, setSelectedDatasetIds, item.datasetId)} className={`rounded-full border px-3 py-1 text-xs transition ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"}`}>
                                        {item.queueName}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {selectedDatasetIds.length > 0
                                ? `${selectedDatasetIds.length} dataset selezionato${selectedDatasetIds.length === 1 ? "" : "i"} — mostra solo questi. Deseleziona tutti per mostrare l'intero catalogo.`
                                : "Nessun filtro — mostra tutti i dataset."}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3 rounded-lg border border-dashed border-border bg-muted/20 p-4">
                        <p className="text-xs font-medium text-muted-foreground">Nessun dataset disponibile</p>
                        <p className="text-xs text-muted-foreground">Crea un dataset dal pannello <strong>Dataset QueuePLUS</strong> prima di creare un&apos;istanza.</p>
                    </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="queueType">Tipo numerazione</Label>
                        <select id="queueType" value={queueType} onChange={(event) => setQueueType(event.target.value as QueueType)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                            <option value="numeric">Numerica</option>
                            <option value="alpha">Alfanumerica</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="serviceMode">Modalita&apos; servizio</Label>
                        <Input id="serviceMode" value="Multigate" readOnly className="h-10" />
                    </div>
                </div>

                {queueType === "alpha" && (
                    <div className="space-y-1.5">
                        <Label htmlFor="prefix">Prefisso letterale</Label>
                        <Input id="prefix" value={prefix} onChange={(event) => setPrefix(event.target.value.toUpperCase())} maxLength={3} placeholder="A" />
                    </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="maxWaiting">Max attesa</Label>
                        <Input id="maxWaiting" type="number" min={1} value={maxWaiting} onChange={(event) => setMaxWaiting(Number(event.target.value) || 99)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="roundRobinMaxNumber">Max round robin</Label>
                        <Input id="roundRobinMaxNumber" type="number" min={1} value={roundRobinMaxNumber} onChange={(event) => setRoundRobinMaxNumber(Number(event.target.value) || 99)} />
                    </div>
                </div>

                {mode === "waiting-list" && (
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="waitingListLayout">Layout waiting list</Label>
                            <select id="waitingListLayout" value={waitingListLayout} onChange={(event) => setWaitingListLayout(event.target.value as "list" | "grid")} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                <option value="list">List</option>
                                <option value="grid">Grid</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="waitingListLimit">Limite a schermo</Label>
                            <Input id="waitingListLimit" type="number" min={1} value={waitingListLimit} onChange={(event) => setWaitingListLimit(Number(event.target.value) || 8)} />
                        </div>
                    </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                    {isKiosk && (
                        <div className="space-y-1.5">
                            <Label htmlFor="ticketDeliveryMode">Delivery ticket</Label>
                            <select id="ticketDeliveryMode" value={ticketDeliveryMode} onChange={(event) => setTicketDeliveryMode(event.target.value as "print" | "qr" | "both")} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                <option value="print">Solo stampa</option>
                                <option value="qr">Solo QR</option>
                                <option value="both">Stampa + QR</option>
                            </select>
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <Label htmlFor="accentColor">Colore accento</Label>
                        <Input id="accentColor" type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} className="h-10" />
                    </div>
                </div>

                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
                    <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={bookingEnabled} onChange={(event) => setBookingEnabled(event.target.checked)} className="h-4 w-4" /><span className="text-sm font-medium">Prenotazione abilitata</span></label>
                    {isKiosk && (
                        <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={enableDigitalTicket} onChange={(event) => setEnableDigitalTicket(event.target.checked)} className="h-4 w-4" /><span className="text-sm font-medium">Abilita ticket digitale / QR</span></label>
                    )}
                </div>

                {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

                <div className="flex gap-3">
                    <Button type="submit" disabled={saving}>{saving ? "Creazione…" : "Crea QueuePLUS"}</Button>
                    <Button type="button" variant="outline" onClick={() => router.push("/webapps/queue-plus")}>Annulla</Button>
                </div>
            </form>
        </div>
    );
}
