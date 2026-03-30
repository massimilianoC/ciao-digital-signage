"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type QueueMode = "display" | "queue" | "remote" | "waiting-list" | "kiosk";
type QueueType = "numeric" | "alpha";
type QueueServiceMode = "reservation" | "round-robin";

interface QueueCatalogItem {
    queueName: string;
    queueType: QueueType;
    serviceMode: QueueServiceMode;
    bookingEnabled: boolean;
    waitingCount: number;
}

function normalizeQueueName(value: string): string {
    return value.trim().toLowerCase();
}

export default function NewQueueConnectorPage() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [mode, setMode] = useState<QueueMode>("queue");
    const [queueName, setQueueName] = useState("main");
    const [queueType, setQueueType] = useState<QueueType>("numeric");
    const [serviceMode, setServiceMode] = useState<QueueServiceMode>("reservation");
    const [bookingEnabled, setBookingEnabled] = useState(true);
    const [prefix, setPrefix] = useState("A");
    const [maxWaiting, setMaxWaiting] = useState(99);
    const [roundRobinMaxNumber, setRoundRobinMaxNumber] = useState(99);
    const [waitingListLimit, setWaitingListLimit] = useState(8);
    const [selectedKioskQueues, setSelectedKioskQueues] = useState<string[]>([]);
    const [accentColor, setAccentColor] = useState("#2563EB");
    const [queueCatalog, setQueueCatalog] = useState<QueueCatalogItem[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{
        instanceId: string;
        playerUrl: string;
        contentId: string | null;
    } | null>(null);

    const isKiosk = mode === "kiosk";
    const usesSharedQueue = ["display", "queue", "remote", "waiting-list"].includes(mode);
    const parsedKioskQueues = useMemo(() => selectedKioskQueues, [selectedKioskQueues]);

    useEffect(() => {
        async function loadQueueCatalog() {
            try {
                const res = await fetch("/api/webapps/queue/catalog", { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                setQueueCatalog(data.queues ?? []);
            } catch {
                setQueueCatalog([]);
            }
        }

        void loadQueueCatalog();
    }, []);

    function toggleKioskQueue(value: string) {
        const normalized = normalizeQueueName(value);
        if (!normalized) return;

        const next = parsedKioskQueues.includes(normalized)
            ? parsedKioskQueues.filter((entry) => entry !== normalized)
            : [...parsedKioskQueues, normalized];

        setSelectedKioskQueues(next);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError(null);

        try {
            const res = await fetch("/api/webapps/queue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    settings: {
                        mode,
                        queueName: usesSharedQueue
                            ? queueName
                            : name.trim().toLowerCase().replace(/\s+/g, "-") || "kiosk",
                        queueType,
                        serviceMode,
                        bookingEnabled,
                        prefix: queueType === "alpha" ? prefix : undefined,
                        maxWaiting,
                        roundRobinMaxNumber,
                        waitingListLimit,
                        kioskQueueNames: isKiosk ? selectedKioskQueues : undefined,
                        showWaitingCount: true,
                        accentColor,
                    },
                    defaultDurationMs: 30000,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                setError(JSON.stringify(data.error ?? "Errore nella creazione"));
                return;
            }

            const data = await res.json();
            setResult({
                instanceId: data.instanceId,
                playerUrl: data.playerUrl,
                contentId: data.contentId,
            });
        } finally {
            setSaving(false);
        }
    }

    if (result) {
        return (
            <div className="p-6 space-y-6 max-w-2xl">
                <h1 className="text-xl font-bold text-green-600">✓ Istanza creata!</h1>

                <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/30">
                    <div>
                        <p className="text-xs text-muted-foreground">Instance ID</p>
                        <p className="font-mono text-sm">{result.instanceId}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Player URL</p>
                        <a
                            href={result.playerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-sm text-primary hover:underline break-all"
                        >
                            {result.playerUrl}
                        </a>
                    </div>
                    {result.contentId && (
                        <div>
                            <p className="text-xs text-muted-foreground">Content ID</p>
                            <p className="font-mono text-sm">{result.contentId}</p>
                        </div>
                    )}
                </div>

                <div className="flex gap-3">
                    <Button onClick={() => router.push("/webapps/queue")}>
                        ← Torna alle istanze
                    </Button>
                    <Button variant="outline" onClick={() => router.push("/content")}>
                        Vai a Content Library
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 max-w-2xl">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link href="/webapps/queue" className="hover:text-foreground flex items-center gap-1">
                    <ChevronLeft className="h-4 w-4" />
                    Eliminacode — Istanze
                </Link>
            </div>

            <div>
                <h1 className="text-2xl font-bold">Nuova istanza Eliminacode</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Crea un&apos;istanza queue, remote, waiting-list o kiosk. Le istanze con
                    lo stesso queueName condividono la stessa coda; il kiosk puo&apos; emettere
                    ticket su piu&apos; code gia&apos; presenti a database.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                    <Label htmlFor="name">Nome istanza *</Label>
                    <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        placeholder="Display Sportello 1"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="mode">Modalità *</Label>
                    <select
                        id="mode"
                        value={mode}
                        onChange={(e) => setMode(e.target.value as QueueMode)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                        <option value="queue">Queue — numero corrente</option>
                        <option value="remote">Remote Control — gestione coda</option>
                        <option value="waiting-list">Waiting List — prossimi prenotati</option>
                        <option value="kiosk">Kiosk — prenotazione multicode</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                        Queue mostra il numero servito, Remote controlla la coda, Waiting List
                        mostra i prossimi prenotati e Kiosk emette ticket sulle code abilitate.
                    </p>
                </div>

                {usesSharedQueue && (
                    <div className="space-y-1.5">
                    <Label htmlFor="queueName">Nome coda (chiave condivisa) *</Label>
                    <Input
                        id="queueName"
                        value={queueName}
                        onChange={(e) => setQueueName(e.target.value)}
                        required
                        placeholder="sportello-1"
                    />
                    <p className="text-xs text-muted-foreground">
                        Istanze con lo stesso nome lavorano sulla stessa coda.
                    </p>
                    </div>
                )}

                {isKiosk && (
                    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                        <p className="text-xs text-muted-foreground">
                            Seleziona una o piu' code dal catalogo (configurazione strict array).
                        </p>

                        {queueCatalog.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Code disponibili a database
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {queueCatalog.map((item) => {
                                        const selected = parsedKioskQueues.includes(item.queueName);
                                        return (
                                            <button
                                                key={item.queueName}
                                                type="button"
                                                onClick={() => toggleKioskQueue(item.queueName)}
                                                className={`rounded-full border px-3 py-1 text-xs transition ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"}`}
                                            >
                                                {item.queueName}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <p className="text-xs text-muted-foreground">
                            {selectedKioskQueues.length} code selezionate
                        </p>
                    </div>
                )}

                <div className="space-y-1.5">
                    <Label htmlFor="queueType">Tipo numerazione</Label>
                    <select
                        id="queueType"
                        value={queueType}
                        onChange={(e) => setQueueType(e.target.value as QueueType)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                        <option value="numeric">Numerica (1, 2, 3…)</option>
                        <option value="alpha">Alfanumerica (A001, B002…)</option>
                    </select>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="serviceMode">Modalità servizio</Label>
                    <select
                        id="serviceMode"
                        value={serviceMode}
                        onChange={(e) => setServiceMode(e.target.value as QueueServiceMode)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                        <option value="reservation">Reservation — servo solo prenotati</option>
                        <option value="round-robin">Round Robin — contatore libero ciclico</option>
                    </select>
                </div>

                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={bookingEnabled}
                            onChange={(e) => setBookingEnabled(e.target.checked)}
                            className="h-4 w-4"
                        />
                        <span className="text-sm font-medium">Prenotazione abilitata</span>
                    </label>
                    <p className="text-xs text-muted-foreground">
                        Se disattiva, la coda puo&apos; comunque lavorare in round robin senza ticket prenotati.
                    </p>
                </div>

                {queueType === "alpha" && (
                    <div className="space-y-1.5">
                        <Label htmlFor="prefix">Prefisso letterale</Label>
                        <Input
                            id="prefix"
                            value={prefix}
                            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                            maxLength={3}
                            placeholder="A"
                        />
                    </div>
                )}

                {serviceMode === "round-robin" && (
                    <div className="space-y-1.5">
                        <Label htmlFor="roundRobinMaxNumber">Numero massimo ciclo round robin</Label>
                        <Input
                            id="roundRobinMaxNumber"
                            type="number"
                            value={roundRobinMaxNumber}
                            min={1}
                            max={9999}
                            onChange={(e) => setRoundRobinMaxNumber(Number(e.target.value))}
                        />
                    </div>
                )}

                <div className="space-y-1.5">
                    <Label htmlFor="maxWaiting">Max in attesa</Label>
                    <Input
                        id="maxWaiting"
                        type="number"
                        value={maxWaiting}
                        min={1}
                        max={999}
                        onChange={(e) => setMaxWaiting(Number(e.target.value))}
                    />
                </div>

                {mode === "waiting-list" && (
                    <div className="space-y-1.5">
                        <Label htmlFor="waitingListLimit">Elementi visibili in waiting list</Label>
                        <Input
                            id="waitingListLimit"
                            type="number"
                            value={waitingListLimit}
                            min={1}
                            max={50}
                            onChange={(e) => setWaitingListLimit(Number(e.target.value))}
                        />
                    </div>
                )}

                <div className="space-y-1.5">
                    <Label htmlFor="accentColor">Colore accento</Label>
                    <div className="flex items-center gap-3">
                        <input
                            id="accentColor"
                            type="color"
                            value={accentColor}
                            onChange={(e) => setAccentColor(e.target.value)}
                            className="h-8 w-16 cursor-pointer rounded border border-input"
                        />
                        <span className="text-sm font-mono text-muted-foreground">
                            {accentColor}
                        </span>
                    </div>
                </div>

                {error && (
                    <p className="text-sm text-destructive rounded-md bg-destructive/10 p-3">
                        {error}
                    </p>
                )}

                <div className="flex gap-3 pt-2">
                    <Button type="submit" disabled={saving}>
                        {saving ? "Creazione…" : "Crea istanza"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => router.push("/webapps/queue")}>
                        Annulla
                    </Button>
                </div>
            </form>
        </div>
    );
}
