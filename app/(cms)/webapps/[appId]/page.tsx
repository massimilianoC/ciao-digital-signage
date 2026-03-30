import { notFound } from "next/navigation";

import { WebappWorkspace } from "@/components/cms/webapps/WebappWorkspace";
import { getPublicRegistryEntry } from "@/lib/sdk/webapp-registry";

interface Props {
    params: Promise<{ appId: string }>;
}

export default async function WebappAppDetailPage({ params }: Props) {
    const { appId } = await params;
    const entry = getPublicRegistryEntry(appId);

    if (!entry) return notFound();

    return (
        <div className="p-6 space-y-6">
            <WebappWorkspace appId={appId} registryEntry={entry} />
        </div>
    );
}
