"use client";

import { ExternalLink, Plus, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { WebappConfigPanel } from "@/components/cms/webapps/WebappConfigPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PublicWebAppRegistryEntry } from "@/lib/sdk/webapp-registry";

interface InstanceSummary {
    instanceId: string;
    appId: string;
    name: string;
    status: "active" | "suspended";
    publicToken: string;
    contentId: string | null;
    playerUrl: string;
    createdAt: string;
}

interface Props {
    appId: string;
    registryEntry: PublicWebAppRegistryEntry;
}

export function WebappInstanceList({ appId, registryEntry }: Props) {
    const [instances, setInstances] = useState<InstanceSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/webapps/instances?appId=${appId}`);
            if (res.ok) {
                const data = await res.json();
                setInstances(data.instances ?? []);
            }
        } finally {
            setLoading(false);
        }
    }, [appId]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                    {registryEntry.name} — Istanze
                </h2>
                <a
                    href={getNewInstancePath(appId)}
                    className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 h-8 px-3"
                >
                    <Plus className="h-4 w-4" />
                    Nuova istanza
                </a>
            </div>

            {loading && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                    Caricamento istanze…
                </p>
            )}

            {!loading && instances.length === 0 && (
                <div className="rounded-lg border border-dashed border-border py-12 text-center">
                    <p className="text-muted-foreground text-sm">
                        Nessuna istanza configurata.
                    </p>
                    <a
                        href={getNewInstancePath(appId)}
                        className="mt-4 inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium border border-border bg-transparent hover:bg-accent hover:text-accent-foreground h-8 px-3"
                    >
                        <Plus className="h-4 w-4" />
                        Crea la prima istanza
                    </a>
                </div>
            )}

            {!loading && instances.length > 0 && (
                <div className="divide-y divide-border rounded-lg border border-border">
                    {instances.map((inst) => (
                        <div
                            key={inst.instanceId}
                            data-testid="webapp-instance-row"
                            data-instance-id={inst.instanceId}
                            className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm truncate">
                                        {inst.name}
                                    </span>
                                    <Badge
                                        variant={
                                            inst.status === "active"
                                                ? "default"
                                                : "secondary"
                                        }
                                        className="text-xs"
                                    >
                                        {inst.status}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                                    {inst.instanceId}
                                </p>
                            </div>

                            <div className="flex items-center gap-2 ml-4">
                                {inst.playerUrl && (
                                    <a
                                        href={inst.playerUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Apri player"
                                    >
                                        <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                                    </a>
                                )}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectedInstanceId(inst.instanceId)}
                                    data-testid={`configure-instance-${inst.instanceId}`}
                                >
                                    <Settings className="h-4 w-4 mr-1" />
                                    Configura
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Config popup */}
            <WebappConfigPanel
                instanceId={selectedInstanceId}
                registryEntry={selectedInstanceId ? registryEntry : null}
                onClose={() => setSelectedInstanceId(null)}
                onSaved={load}
            />
        </div>
    );
}

function getNewInstancePath(appId: string): string {
    if (appId === "google-calendar") return "/content/google-calendar/new";
    if (appId === "wordpress-link") return "/content/wordpress-link/new";
    if (appId === "queue") return `/webapps/${appId}/new`;
    return `/webapps/${appId}/new`;
}
