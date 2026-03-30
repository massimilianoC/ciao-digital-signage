import { WordpressLinkConnectorForm } from "@/components/cms/WordpressLinkConnectorForm";

export default function WordpressLinkConnectorPage() {
    return (
        <div className="max-w-6xl space-y-4 p-6">
            <div>
                <h1 className="text-3xl font-bold">New WordpressLink Connector</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    Crea un kiosk catalogo da WordPress o WooCommerce con prefetch tassonomie, mapping template e player interattivo.
                </p>
            </div>
            <WordpressLinkConnectorForm />
        </div>
    );
}
