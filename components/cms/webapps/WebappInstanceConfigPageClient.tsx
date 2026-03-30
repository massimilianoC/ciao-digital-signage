"use client";

import { useRouter } from "next/navigation";

import { WebappConfigPanel } from "@/components/cms/webapps/WebappConfigPanel";
import type { PublicWebAppRegistryEntry } from "@/lib/sdk/webapp-registry";

interface Props {
    appId: string;
    instanceId: string;
    registryEntry: PublicWebAppRegistryEntry;
}

export function WebappInstanceConfigPageClient({ appId, instanceId, registryEntry }: Props) {
    const router = useRouter();

    return (
        <WebappConfigPanel
            instanceId={instanceId}
            registryEntry={registryEntry}
            onClose={() => router.push(`/webapps/${encodeURIComponent(appId)}`)}
            onSaved={() => router.refresh()}
        />
    );
}
