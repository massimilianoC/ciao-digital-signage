import Link from "next/link";
import { notFound } from "next/navigation";

import { WebappDatasetList } from "@/components/cms/webapps/WebappDatasetList";
import { Button } from "@/components/ui/button";
import { getPublicRegistryEntry } from "@/lib/sdk/webapp-registry";

interface Props {
    params: Promise<{ appId: string }>;
}

export default async function WebappDatasetsPage({ params }: Props) {
    const { appId } = await params;
    const entry = getPublicRegistryEntry(appId);
    if (!entry) return notFound();

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h1 className="text-xl font-semibold">{entry.name} - Dataset</h1>
                    <p className="text-sm text-muted-foreground">Gestione dataset dedicata per app.</p>
                </div>
                <Link href={`/webapps/${appId}`}>
                    <Button variant="outline">Torna al workspace</Button>
                </Link>
            </div>

            <WebappDatasetList appId={appId} registryEntry={entry} />
        </div>
    );
}
