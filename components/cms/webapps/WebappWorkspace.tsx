"use client";

import { Layers2, LayoutList } from "lucide-react";
import { useMemo, useState } from "react";

import { WebappDatasetList } from "@/components/cms/webapps/WebappDatasetList";
import { WebappInstanceList } from "@/components/cms/webapps/WebappInstanceList";
import type { PublicWebAppRegistryEntry } from "@/lib/sdk/webapp-registry";

type WorkspaceTab = "instances" | "datasets";

interface Props {
    appId: string;
    registryEntry: PublicWebAppRegistryEntry;
}

export function WebappWorkspace({ appId, registryEntry }: Props) {
    const initialTab: WorkspaceTab = useMemo(() => {
        if (registryEntry.hasDatasets) return "instances";
        return "instances";
    }, [registryEntry.hasDatasets]);

    const [tab, setTab] = useState<WorkspaceTab>(initialTab);

    return (
        <div className="space-y-4">
            <div className="border-b border-border">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setTab("instances")}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition ${
                            tab === "instances"
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <LayoutList className="h-4 w-4" />
                        Istanze
                    </button>

                    {registryEntry.hasDatasets ? (
                        <button
                            onClick={() => setTab("datasets")}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition ${
                                tab === "datasets"
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Layers2 className="h-4 w-4" />
                            Dataset
                        </button>
                    ) : null}
                </div>
            </div>

            {tab === "instances" ? (
                <WebappInstanceList appId={appId} registryEntry={registryEntry} />
            ) : null}

            {tab === "datasets" && registryEntry.hasDatasets ? (
                <WebappDatasetList appId={appId} registryEntry={registryEntry} />
            ) : null}
        </div>
    );
}
