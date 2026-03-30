import Link from "next/link";
import { notFound } from "next/navigation";

import { WebappDatasetDetailPanel } from "@/components/cms/webapps/WebappDatasetDetailPanel";
import { Button } from "@/components/ui/button";
import { getPublicRegistryEntry } from "@/lib/sdk/webapp-registry";

interface Props {
    params: Promise<{ appId: string; datasetId: string }>;
}

export default async function WebappDatasetDetailPage({ params }: Props) {
    const { appId, datasetId } = await params;
    const entry = getPublicRegistryEntry(appId);
    if (!entry) return notFound();

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h1 className="text-xl font-semibold">{entry.name} - Dettaglio dataset</h1>
                    <p className="text-sm text-muted-foreground">Configurazione, validazione e manutenzione dataset.</p>
                </div>
                <Link href={`/webapps/${appId}/datasets`}>
                    <Button variant="outline">Torna ai dataset</Button>
                </Link>
            </div>

            <WebappDatasetDetailPanel appId={appId} datasetId={datasetId} />
        </div>
    );
}
