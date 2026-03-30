import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOrgIdFromSession, logger, withErrorHandler } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { createGoogleCalendarConnector, getGoogleCalendarAggregateForOrg } from "@/lib/services/google-calendar-connector.service";
import { WebAppInstanceModel } from "@/lib/db/models/WebAppInstance";
import { type GoogleCalendarSettings } from "@/lib/db/models/WebAppConfig";

const createSchema = z
    .object({
        name: z.string().min(1).max(200),
        mode: z.enum(["public-ics", "api-key"]),
        sourceId: z.string().optional(),
        title: z.string().max(200).optional(),
        calendarId: z.string().optional(),
        publicIcsUrl: z.url().optional(),
        apiKey: z.string().min(10).optional(),
        timezone: z.string().min(1).default("UTC"),
        refreshSeconds: z.number().int().min(60).max(3600).default(300),
        maxItems: z.number().int().min(1).max(50).default(10),
        accentColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
        defaultDurationMs: z.number().int().min(5000).max(3600000).default(60000),
    })
    .superRefine((value, context) => {
        if (value.sourceId) {
            return;
        }
        if (value.mode === "public-ics" && !value.publicIcsUrl) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: "publicIcsUrl is required for public-ics mode", path: ["publicIcsUrl"] });
        }
        if (value.mode === "api-key" && !value.calendarId) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: "calendarId is required for api-key mode", path: ["calendarId"] });
        }
        if (value.mode === "api-key" && !value.apiKey) {
            context.addIssue({ code: z.ZodIssueCode.custom, message: "apiKey is required for api-key mode", path: ["apiKey"] });
        }
    });

export const GET = withErrorHandler(async (req: NextRequest) => {
    const sess = await getOrgIdFromSession(req);
    if (!sess) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const instances = await WebAppInstanceModel.find({ orgId: sess.orgId, appId: "google-calendar" })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();

    return NextResponse.json({
        instances: await Promise.all(
            instances.map(async (instance) => {
                const aggregate = await getGoogleCalendarAggregateForOrg(sess.orgId, instance._id.toString());
                return aggregate
                    ? {
                        id: aggregate.instance._id.toString(),
                        name: aggregate.instance.name,
                        status: aggregate.instance.status,
                        contentId: aggregate.instance.contentId?.toString() ?? null,
                        ...(() => { const s = aggregate.config.settings as GoogleCalendarSettings; return { title: s.title ?? aggregate.instance.name, mode: s.mode, refreshSeconds: s.refreshSeconds, maxItems: s.maxItems }; })(),
                    }
                    : null;
            }),
        ),
    });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
    const sess = await getOrgIdFromSession(req);
    if (!sess) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await connectDB();
    const aggregate = await createGoogleCalendarConnector({
        orgId: sess.orgId,
        userId: sess.userId,
        ...parsed.data,
    });

    logger.info("Google Calendar connector created", {
        instanceId: aggregate.instance._id.toString(),
        contentId: aggregate.instance.contentId?.toString(),
        mode: (aggregate.config.settings as GoogleCalendarSettings).mode,
    });

    return NextResponse.json(
        {
            instanceId: aggregate.instance._id.toString(),
            contentId: aggregate.instance.contentId?.toString() ?? null,
            contentUrl: `/webapps/google-calendar/${aggregate.instance._id.toString()}?token=${encodeURIComponent(aggregate.instance.publicToken)}`,
            mode: (aggregate.config.settings as GoogleCalendarSettings).mode,
            name: aggregate.instance.name,
        },
        { status: 201 },
    );
});