"use client";

import { Hash, Calendar, Globe, Clock } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PublicWebAppRegistryEntry } from "@/lib/sdk/webapp-registry";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    Calendar,
    Hash,
    Globe,
    Clock,
};

const CATEGORY_LABELS: Record<string, string> = {
    productivity: "Produttività",
    operations: "Operazioni",
    communication: "Comunicazione",
    media: "Media",
};

interface Props {
    apps: PublicWebAppRegistryEntry[];
}

export function WebappCatalogGrid({ apps }: Props) {
    if (apps.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-border py-16 text-center">
                <p className="text-muted-foreground">
                    Nessuna app disponibile nel catalogo.
                </p>
            </div>
        );
    }

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((app) => {
                const Icon = ICON_MAP[app.icon] ?? Globe;
                return (
                    <Link
                        key={app.appId}
                        href={`/webapps/${app.appId}`}
                        className="group block"
                    >
                        <Card className="h-full transition-shadow group-hover:shadow-md cursor-pointer">
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="rounded-lg bg-primary/10 p-2">
                                            <Icon className="h-5 w-5 text-primary" />
                                        </span>
                                        <CardTitle className="text-base leading-tight">
                                            {app.name}
                                        </CardTitle>
                                    </div>
                                    <Badge variant="outline" className="shrink-0 text-xs">
                                        {CATEGORY_LABELS[app.category] ?? app.category}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                                    {app.description}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-1">
                                    {app.displayModes.map((m) => (
                                        <span
                                            key={m}
                                            className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                                        >
                                            {m}
                                        </span>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                );
            })}
        </div>
    );
}
