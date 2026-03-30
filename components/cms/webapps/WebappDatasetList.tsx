"use client";

import Link from "next/link";
import { Database, ExternalLink, FlaskConical, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    buildConfigFromTemplate,
    getDatasetTemplatesForApp,
} from "@/lib/sdk/dataset-templates";
import { getWebappDatasetSandboxContract } from "@/lib/sdk/webapp-host.service";
import type { PublicWebAppRegistryEntry } from "@/lib/sdk/webapp-registry";

type DatasetSummary = {
    datasetId: string;
    appId: string;
    name: string;
    status: "active" | "disabled" | "draft" | "managed";
    datasetKind: string;
    storageMode: "inline" | "asset-ref" | "app-collection" | "remote-mirror";
    usageCount: number;
    managedBy: "sdk" | "app";
    readOnly: boolean;
    updatedAt: string | null;
    summary?: Record<string, unknown>;
};

interface Props {
    appId: string;
    registryEntry: PublicWebAppRegistryEntry;
}

const STATUS_VARIANT: Record<DatasetSummary["status"], "default" | "secondary" | "outline"> = {
    active: "default",
    disabled: "secondary",
    draft: "outline",
    managed: "secondary",
};

export function WebappDatasetList({ appId, registryEntry }: Props) {
    const templates = getDatasetTemplatesForApp(appId);

    const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newDatasetName, setNewDatasetName] = useState("");
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => templates[0]?.id ?? "");
    const [message, setMessage] = useState<string>("");

    const loadDatasets = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/webapps/datasets?appId=${encodeURIComponent(appId)}`, {
                cache: "no-store",
            });
            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error || "Unable to load datasets");
            }

            const payload = (await response.json()) as { datasets?: DatasetSummary[] };
            setDatasets(payload.datasets ?? []);
            setMessage("");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to load datasets");
            setDatasets([]);
        } finally {
            setLoading(false);
        }
    }, [appId]);

    useEffect(() => {
        void loadDatasets();
    }, [loadDatasets]);

    const sandboxContract = getWebappDatasetSandboxContract(appId as "google-calendar" | "queue" | "queue-plus" | "wordpress-link");
    const isAppManaged = sandboxContract.manager.mode === "app";
    const managerPath = sandboxContract.manager.route;
    const canCreateInSdk = sandboxContract.dataset.supportsCrud;
    const hasTemplates = templates.length > 0;

    async function handleCreateDataset() {
        if (!newDatasetName.trim()) return;
        const template = templates.find((t) => t.id === selectedTemplateId) ?? templates[0];
        if (!template) return;
        setCreating(true);
        try {
            const config = buildConfigFromTemplate(template, newDatasetName);
            const response = await fetch(`/api/webapps/datasets?appId=${encodeURIComponent(appId)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newDatasetName.trim(),
                    datasetKind: template.datasetKind,
                    storageMode: template.storageMode,
                    editorMode: template.editorMode,
                    config,
                    tags: template.tags ?? [],
                }),
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string | { fieldErrors?: Record<string, string[]> } } | null;
                if (typeof body?.error === "string") {
                    throw new Error(body.error);
                }

                if (typeof body?.error === "object" && body?.error?.fieldErrors) {
                    throw new Error(Object.values(body.error.fieldErrors).flat().join(" "));
                }
                throw new Error("Unable to create dataset");
            }

            setNewDatasetName("");
            setMessage("Dataset creato correttamente");
            await loadDatasets();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Unable to create dataset");
        } finally {
            setCreating(false);
        }
    }

    async function handleValidateDataset(datasetId: string) {
        try {
            const response = await fetch(
                `/api/webapps/datasets/${encodeURIComponent(datasetId)}/validate?appId=${encodeURIComponent(appId)}`,
                { method: "POST" },
            );

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error || "Validation failed");
            }

            const result = (await response.json()) as { valid: boolean; issues?: Array<{ message: string }> };
            if (result.valid) {
                setMessage("Validazione completata senza errori");
            } else {
                const issueText = result.issues?.map((item) => item.message).join(" | ") || "Validation issues found";
                setMessage(issueText);
            }
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Validation failed");
        }
    }

    async function handleDeleteDataset(dataset: DatasetSummary) {
        if (dataset.readOnly) return;
        const confirmed = window.confirm(`Eliminare il dataset \"${dataset.name}\"?`);
        if (!confirmed) return;

        try {
            const response = await fetch(
                `/api/webapps/datasets/${encodeURIComponent(dataset.datasetId)}?appId=${encodeURIComponent(appId)}`,
                { method: "DELETE" },
            );
            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error || "Delete failed");
            }

            setMessage("Dataset eliminato");
            await loadDatasets();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Delete failed");
        }
    }

    const updatedHeader = useMemo(() => {
        if (!registryEntry.hasDatasets) return "Questa app non espone dataset dedicati.";
        if (isAppManaged && managerPath) {
            return `Dataset gestiti da editor app-specifico (${sandboxContract.manager.customConfiguratorId}).`;
        }
        return `Dataset gestiti dal workspace SDK (${sandboxContract.manager.customConfiguratorId}).`;
    }, [isAppManaged, managerPath, registryEntry.hasDatasets, sandboxContract.manager.customConfiguratorId]);

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Database className="h-4 w-4 text-primary" />
                        {registryEntry.name} - Dataset
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">{updatedHeader}</p>
                </div>

                {isAppManaged && managerPath ? (
                    <Link href={managerPath} className="inline-flex">
                        <Button size="sm" variant="outline">
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Apri editor dataset
                        </Button>
                    </Link>
                ) : null}
            </div>

            {canCreateInSdk ? (
                hasTemplates ? (
                    <div className="rounded-lg border border-border p-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <select
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm w-64 shrink-0"
                            value={selectedTemplateId}
                            onChange={(event) => setSelectedTemplateId(event.target.value)}
                            title={templates.find((t) => t.id === selectedTemplateId)?.description ?? ""}
                        >
                            {templates.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                        <input
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm flex-1"
                            placeholder="Nome dataset..."
                            value={newDatasetName}
                            onChange={(event) => setNewDatasetName(event.target.value)}
                            onKeyDown={(event) => { if (event.key === "Enter") void handleCreateDataset(); }}
                        />
                        <Button size="sm" onClick={() => void handleCreateDataset()} disabled={creating || !newDatasetName.trim()}>
                            <Plus className="h-4 w-4 mr-1" />
                            {creating ? "Creazione..." : "Nuovo dataset"}
                        </Button>
                    </div>
                ) : (
                    <div className="rounded-lg border border-dashed border-border p-3 flex items-center gap-3">
                        <Button size="sm" disabled variant="outline">
                            <Plus className="h-4 w-4 mr-1" />
                            Nuovo dataset
                        </Button>
                        <span className="text-xs text-muted-foreground">
                            Nessun modello di dataset disponibile per questa app.
                        </span>
                    </div>
                )
            ) : null}

            {loading ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Caricamento dataset...</p>
            ) : null}

            {!loading && datasets.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-10 text-center">
                    <p className="text-sm text-muted-foreground">Nessun dataset disponibile.</p>
                </div>
            ) : null}

            {!loading && datasets.length > 0 ? (
                <div className="divide-y divide-border rounded-lg border border-border">
                    {datasets.map((dataset) => (
                        <div key={dataset.datasetId} className="px-4 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm truncate">{dataset.name}</span>
                                    <Badge variant={STATUS_VARIANT[dataset.status]} className="text-[10px] uppercase">
                                        {dataset.status}
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px]">
                                        {dataset.datasetKind}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                    usage: {dataset.usageCount} - storage: {dataset.storageMode}
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <Link href={`/webapps/${encodeURIComponent(appId)}/datasets/${encodeURIComponent(dataset.datasetId)}`}>
                                    <Button size="sm" variant="outline">
                                        Dettaglio
                                    </Button>
                                </Link>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void handleValidateDataset(dataset.datasetId)}
                                >
                                    <FlaskConical className="h-4 w-4 mr-1" />
                                    Valida
                                </Button>
                                {!dataset.readOnly ? (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => void handleDeleteDataset(dataset)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}

            {message ? (
                <p className="text-xs text-muted-foreground">{message}</p>
            ) : null}
        </div>
    );
}
