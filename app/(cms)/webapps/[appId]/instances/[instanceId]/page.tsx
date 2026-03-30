import { notFound } from "next/navigation";

import { WebappInstanceConfigPageClient } from "@/components/cms/webapps/WebappInstanceConfigPageClient";
import { getPublicRegistryEntry } from "@/lib/sdk/webapp-registry";

interface Props {
    params: Promise<{ appId: string; instanceId: string }>;
}

export default async function WebappInstanceConfigPage({ params }: Props) {
    const { appId, instanceId } = await params;
    const registryEntry = getPublicRegistryEntry(appId);

    if (!registryEntry) return notFound();

    return (
        <div className="p-6">
            <WebappInstanceConfigPageClient
                appId={appId}
                instanceId={instanceId}
                registryEntry={registryEntry}
            />
        </div>
    );
}
