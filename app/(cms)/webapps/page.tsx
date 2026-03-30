import { AppWindow } from "lucide-react";

import { WebappCatalogGrid } from "@/components/cms/webapps/WebappCatalogGrid";
import { listRegisteredPublicApps } from "@/lib/sdk/webapp-registry";

export default function WebappsCatalogPage() {
    const apps = listRegisteredPublicApps();

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-3">
                <AppWindow className="h-6 w-6 text-primary" />
                <div>
                    <h1 className="text-2xl font-bold">Catalogo App</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Seleziona un&apos;app per gestire le istanze e la configurazione.
                    </p>
                </div>
            </div>

            <WebappCatalogGrid apps={apps} />
        </div>
    );
}
