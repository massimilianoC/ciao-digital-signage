import { NextRequest, NextResponse } from "next/server";

import { connectDB } from "@/lib/db/connection";
import { type GoogleCalendarSettings } from "@/lib/db/models/WebAppConfig";
import {
    fetchGoogleCalendarEvents,
    getGoogleCalendarAggregateForPublicAccess,
    updateGoogleCalendarState,
} from "@/lib/services/google-calendar-connector.service";
import { logger, withErrorHandler } from "@/lib/api-utils";

type Params = { params: Promise<{ instanceId: string }> };

export const GET = withErrorHandler(async (req: NextRequest, { params }: Params) => {
    const { instanceId } = await params;
    const token = req.nextUrl.searchParams.get("token")?.trim();

    if (!token) {
        return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    await connectDB();
    const aggregate = await getGoogleCalendarAggregateForPublicAccess(instanceId, token);
    if (!aggregate) {
        return NextResponse.json({ error: "Connector not found" }, { status: 404 });
    }

    try {
        const events = await fetchGoogleCalendarEvents(aggregate);
        await updateGoogleCalendarState(aggregate.state._id, { health: "healthy", events });

        return NextResponse.json({
            instanceId: aggregate.instance._id.toString(),
            ...(() => { const s = aggregate.config.settings as GoogleCalendarSettings; return { title: s.title ?? aggregate.instance.name, timezone: s.timezone, refreshSeconds: s.refreshSeconds, mode: s.mode }; })(),
            events,
            lastSyncAt: new Date().toISOString(),
        });
    } catch (error) {
        await updateGoogleCalendarState(aggregate.state._id, { health: "error", error: error as Error });
        logger.error("Google Calendar event fetch failed", error, { instanceId });
        return NextResponse.json({ error: "Failed to fetch calendar events" }, { status: 502 });
    }
});