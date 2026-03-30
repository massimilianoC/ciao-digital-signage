"use client";

import { Copy, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { WebappInstanceDatasetBindings } from "@/components/cms/webapps/WebappInstanceDatasetBindings";
import { WebappAutoConfigForm } from "@/components/cms/webapps/WebappAutoConfigForm";
import { WordpressLinkConnectorForm } from "@/components/cms/WordpressLinkConnectorForm";
import { QueueCustomConfig } from "@/components/cms/webapps/queue/QueueCustomConfig";
import { QueuePlusCustomConfig } from "@/components/cms/webapps/queue-plus/QueuePlusCustomConfig";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getWebappDatasetSandboxContract } from "@/lib/sdk/webapp-host.service";
import type { PublicWebAppRegistryEntry } from "@/lib/sdk/webapp-registry";

interface InstanceDetail {
    instanceId: string;
    appId: string;
    name: string;
    status: "active" | "suspended";
    publicToken: string;
    contentId: string | null;
    settings: Record<string, unknown>;
    health: string;
    playerUrl: string | null;
}

interface Props {
    instanceId: string | null;
    registryEntry: PublicWebAppRegistryEntry | null;
    onClose: () => void;
    onSaved?: () => void;
}

type Tab = "config" | "datasets" | "advanced";

export function WebappConfigPanel({ instanceId, registryEntry, onClose, onSaved }: Props) {
    const [detail, setDetail] = useState<InstanceDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [tab, setTab] = useState<Tab>("config");
    const [formValues, setFormValues] = useState<Record<string, unknown>>({});
    const [saveMsg, setSaveMsg] = useState<string>("");

    const isOpen = !!instanceId && !!registryEntry;
    const supportsDatasetBinding = detail
        ? getWebappDatasetSandboxContract(
            detail.appId as "google-calendar" | "queue" | "queue-plus" | "wordpress-link",
        ).dataset.supportsBinding
        : false;

    const loadDetail = useCallback(async () => {
        if (!instanceId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/webapps/instances/${instanceId}`);
            if (res.ok) {
                const data = await res.json();
                setDetail(data);
                setFormValues(data.settings ?? {});
            }
        } finally {
            setLoading(false);
        }
    }, [instanceId]);

    useEffect(() => {
        if (isOpen) {
            setTab("config");
            setSaveMsg("");
            loadDetail();
        } else {
            setDetail(null);
            setFormValues({});
        }
    }, [isOpen, loadDetail]);

    async function handleSave() {
        if (!instanceId) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/webapps/instances/${instanceId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ settings: formValues }),
            });
            if (res.ok) {
                setSaveMsg("✓ Configurazione salvata");
                onSaved?.();
            } else {
                setSaveMsg("✗ Errore nel salvataggio");
            }
        } finally {
            setSaving(false);
            setTimeout(() => setSaveMsg(""), 3000);
        }
    }

    function copyToClipboard(text: string) {
        navigator.clipboard.writeText(text).catch(() => {});
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <span>{registryEntry?.name}</span>
                        {detail && (
                            <span className="text-sm font-normal text-muted-foreground">
                                — {detail.name}
                            </span>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {loading && (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                        Caricamento…
                    </p>
                )}

                {!loading && detail && (
                    <>
                        {/* Status badge */}
                        <div className="flex items-center gap-3 text-sm">
                            <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                    detail.status === "active"
                                        ? "bg-green-100 text-green-800"
                                        : "bg-yellow-100 text-yellow-800"
                                }`}
                            >
                                {detail.status}
                            </span>
                            <span className="text-muted-foreground">
                                Salute: {detail.health}
                            </span>
                        </div>

                        {/* Player URL */}
                        {detail.playerUrl && (
                            <div className="rounded-md bg-muted/50 px-3 py-2 flex items-center gap-2 text-xs font-mono">
                                <span className="truncate flex-1 text-muted-foreground">
                                    {detail.playerUrl}
                                </span>
                                <button
                                    onClick={() => copyToClipboard(detail.playerUrl!)}
                                    title="Copia URL"
                                >
                                    <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                </button>
                                <a
                                    href={detail.playerUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                </a>
                            </div>
                        )}

                        {/* Tabs */}
                        <div className="flex gap-1 border-b border-border">
                            {(["config", "datasets", "advanced"] as Tab[])
                                .filter((candidate) => !(candidate === "datasets" && !supportsDatasetBinding))
                                .map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setTab(t)}
                                    className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
                                        tab === t
                                            ? "border-primary text-primary"
                                            : "border-transparent text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {t === "config" ? "Configurazione" : t === "datasets" ? "Dataset" : "Avanzato"}
                                </button>
                            ))}
                        </div>

                        {/* Tab: auto-form */}
                        {tab === "config" && registryEntry && (
                            <WebappAutoConfigForm
                                schema={registryEntry.configSchema}
                                initialValues={detail.settings}
                                onChange={setFormValues}
                            />
                        )}

                        {tab === "datasets" && detail && registryEntry?.hasDatasets && (
                            <WebappInstanceDatasetBindings
                                appId={detail.appId}
                                instanceId={detail.instanceId}
                                onSaved={onSaved}
                            />
                        )}

                        {/* Tab: custom per-app component */}
                        {tab === "advanced" && (
                            <div>
                                {detail.appId === "queue" && (
                                    <QueueCustomConfig
                                        instanceId={detail.instanceId}
                                        token={detail.publicToken}
                                        datasetId={
                                            (detail.settings.datasetId as string) ?? ""
                                        }
                                        mode={
                                            (detail.settings.mode as "display" | "queue" | "remote" | "waiting-list" | "kiosk") ??
                                            "queue"
                                        }
                                        settings={detail.settings}
                                        onSettingsChange={(partial) =>
                                            setFormValues((prev) => ({ ...prev, ...partial }))
                                        }
                                    />
                                )}

                                {detail.appId === "queue-plus" && (
                                    <QueuePlusCustomConfig
                                        instanceId={detail.instanceId}
                                        token={detail.publicToken}
                                        mode={
                                            (detail.settings.mode as "display" | "queue" | "remote" | "waiting-list" | "kiosk") ??
                                            "queue"
                                        }
                                        settings={detail.settings}
                                        onSettingsChange={(partial) =>
                                            setFormValues((prev) => ({ ...prev, ...partial }))
                                        }
                                    />
                                )}

                                {detail.appId === "google-calendar" && (
                                    <p className="text-sm text-muted-foreground italic py-4">
                                        Usa il configuratore base per modificare le
                                        impostazioni del Google Calendar. La configurazione
                                        avanzata è disponibile nella creazione guidata.
                                    </p>
                                )}

                                {detail.appId === "wordpress-link" && (
                                    <WordpressLinkConnectorForm
                                        mode="edit"
                                        instanceId={detail.instanceId}
                                        initialName={detail.name}
                                        initialSettings={detail.settings}
                                        onSaved={async () => {
                                            await loadDetail();
                                            onSaved?.();
                                        }}
                                    />
                                )}

                                {!["queue", "queue-plus", "google-calendar", "wordpress-link"].includes(detail.appId) && (
                                    <p className="text-sm text-muted-foreground italic py-4">
                                        Nessun configuratore avanzato disponibile per questa app.
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-2 border-t border-border">
                            <span className="text-sm text-muted-foreground">{saveMsg}</span>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={onClose}>
                                    Chiudi
                                </Button>
                                {(tab === "config" || tab === "advanced") && (
                                    <Button onClick={handleSave} disabled={saving}>
                                        {saving ? "Salvataggio…" : "Salva"}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
