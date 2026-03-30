import { NextRequest, NextResponse } from "next/server";

import { logger, withErrorHandler } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { type WordpressLinkSettings } from "@/lib/db/models/WebAppConfig";
import {
    fetchWordpressLinkCatalog,
    getWordpressLinkAggregateForPublicAccess,
    updateWordpressLinkState,
} from "@/lib/services/wordpress-link-connector.service";

type Params = { params: Promise<{ instanceId: string }> };

export const GET = withErrorHandler(async (req: NextRequest, { params }: Params) => {
    const { instanceId } = await params;
    const token = req.nextUrl.searchParams.get("token")?.trim();

    if (!token) {
        return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    await connectDB();

    const aggregate = await getWordpressLinkAggregateForPublicAccess(instanceId, token);
    if (!aggregate) {
        return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    const settings = aggregate.config.settings as WordpressLinkSettings;

    try {
        const items = await fetchWordpressLinkCatalog(aggregate);
        await updateWordpressLinkState({
            stateId: aggregate.state._id,
            health: "healthy",
            itemCount: items.length,
        });

        return NextResponse.json({
            instanceId: aggregate.instance._id.toString(),
            title: settings.title || aggregate.instance.name,
            viewMode: settings.viewMode,
            autoScrollMode: settings.autoScrollMode,
            templatePreset: settings.templatePreset,
            refreshSeconds: settings.refreshSeconds,
            fieldBindings: settings.fieldBindings,
            theme: settings.theme,
            sourceKind: settings.sourceKind,
            itemCount: items.length,
            items,
            lastSyncAt: new Date().toISOString(),
        });
    } catch (error) {
        await updateWordpressLinkState({
            stateId: aggregate.state._id,
            health: "error",
            error: error as Error,
        });

        logger.error("WordpressLink public catalog fetch failed", error, { instanceId });
        return NextResponse.json({ error: "Failed to fetch remote catalog" }, { status: 502 });
    }
});
