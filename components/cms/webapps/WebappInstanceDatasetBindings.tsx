"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type BindingRole = "primary" | "secondary" | "fallback" | "overlay";

type DatasetSummary = {
    datasetId: string;
    name: string;
    status: string;
    datasetKind: string;
    readOnly: boolean;
};

type InstanceBinding = {
    bindingId: string;
    datasetId: string;
    role: BindingRole;
    order: number;
    required: boolean;
};

type BindingDraft = {
    id: string;
    datasetId: string;
    role: BindingRole;
    required: boolean;
};

interface Props {
    appId: string;
    instanceId: string;
    onSaved?: () => void;
}

export function WebappInstanceDatasetBindings({ appId, instanceId, onSaved }: Props) {
    const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
    const [drafts, setDrafts] = useState<BindingDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [datasetsRes, bindingsRes] = await Promise.all([
                fetch(`/api/webapps/datasets?appId=${encodeURIComponent(appId)}`, { cache: "no-store" }),
                fetch(`/api/webapps/instances/${encodeURIComponent(instanceId)}/datasets`, { cache: "no-store" }),
            ]);

            const datasetPayload = datasetsRes.ok
                ? ((await datasetsRes.json()) as { datasets?: DatasetSummary[] })
                : { datasets: [] };
            const bindingPayload = bindingsRes.ok
                ? ((await bindingsRes.json()) as { bindings?: InstanceBinding[] })
                : { bindings: [] };

            const available = (datasetPayload.datasets ?? []).filter((dataset) => !dataset.readOnly);
            setDatasets(available);

            const nextDrafts = (bindingPayload.bindings ?? []).map((binding) => ({
                id: binding.bindingId,
                datasetId: binding.datasetId,
                role: binding.role,
                required: binding.required,
            }));
            setDrafts(nextDrafts);
        } catch {
            setMessage("Errore caricamento binding dataset");
        } finally {
            setLoading(false);
        }
    }, [appId, instanceId]);

    useEffect(() => {
        void load();
    }, [load]);

    const datasetOptions = useMemo(
        () => datasets.map((dataset) => ({ value: dataset.datasetId, label: `${dataset.name} (${dataset.datasetKind})` })),
        [datasets],
    );

    function addBindingRow() {
        const firstDataset = datasetOptions[0]?.value ?? "";
        if (!firstDataset) return;
        setDrafts((prev) => [
            ...prev,
            {
                id: `new-${Date.now()}-${Math.random()}`,
                datasetId: firstDataset,
                role: "primary",
                required: true,
            },
        ]);
    }

    function updateRow(id: string, patch: Partial<BindingDraft>) {
        setDrafts((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    }

    function removeRow(id: string) {
        setDrafts((prev) => prev.filter((row) => row.id !== id));
    }

    async function saveBindings() {
        setSaving(true);
        setMessage("");
        try {
            const payload = {
                bindings: drafts
                    .filter((row) => row.datasetId)
                    .map((row, index) => ({
                        datasetId: row.datasetId,
                        role: row.role,
                        required: row.required,
                        order: index,
                    })),
            };

            const response = await fetch(`/api/webapps/instances/${encodeURIComponent(instanceId)}/datasets`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error || "Salvataggio binding fallito");
            }

            setMessage("Binding dataset salvati");
            onSaved?.();
            await load();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Salvataggio binding fallito");
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return <p className="text-sm text-muted-foreground py-4">Caricamento binding dataset...</p>;
    }

    if (datasetOptions.length === 0) {
        return (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nessun dataset modificabile disponibile per questa app.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="rounded-md border border-border p-3 space-y-3">
                {drafts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nessun binding configurato.</p>
                ) : null}

                {drafts.map((row) => (
                    <div key={row.id} data-testid="dataset-binding-row" className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_auto_auto] gap-2 items-center">
                        <select
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={row.datasetId}
                            onChange={(event) => updateRow(row.id, { datasetId: event.target.value })}
                        >
                            {datasetOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>

                        <select
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={row.role}
                            onChange={(event) => updateRow(row.id, { role: event.target.value as BindingRole })}
                        >
                            <option value="primary">primary</option>
                            <option value="secondary">secondary</option>
                            <option value="fallback">fallback</option>
                            <option value="overlay">overlay</option>
                        </select>

                        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={row.required}
                                onChange={(event) => updateRow(row.id, { required: event.target.checked })}
                            />
                            required
                        </label>

                        <Button type="button" size="sm" variant="outline" onClick={() => removeRow(row.id)}>
                            Rimuovi
                        </Button>
                    </div>
                ))}

                <div className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={addBindingRow} data-testid="add-dataset-binding">
                        Aggiungi binding
                    </Button>
                    <Button type="button" size="sm" onClick={saveBindings} disabled={saving} data-testid="save-dataset-bindings">
                        {saving ? "Salvataggio..." : "Salva binding"}
                    </Button>
                </div>
            </div>

            {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
        </div>
    );
}
