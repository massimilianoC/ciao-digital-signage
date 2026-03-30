import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOrgIdFromSession, logger, withErrorHandler } from "@/lib/api-utils";
import {
    createGoogleCalendarSource,
    listGoogleCalendarSourcesForOrg,
} from "@/lib/services/google-calendar-sources.service";

const createSourceSchema = z
    .object({
        name: z.string().min(1).max(200),
        type: z.enum(["ics-url", "ics-upload", "google-private"]),
        timezone: z.string().min(1).default("UTC"),
        refreshSeconds: z.number().int().min(60).max(3600).default(300),
        icsUrl: z.url().optional(),
        assetContentId: z.string().optional(),
        tags: z.array(z.string()).default([]),
    })
    .superRefine((value, context) => {
        if (value.type === "ics-url" && !value.icsUrl) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "icsUrl is required for ics-url type",
                path: ["icsUrl"],
            });
        }

        if (value.type === "ics-upload" && !value.assetContentId) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "assetContentId is required for ics-upload type",
                path: ["assetContentId"],
            });
        }
    });

export const GET = withErrorHandler(async (req: NextRequest) => {
    const sess = await getOrgIdFromSession(req);
    if (!sess) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sources = await listGoogleCalendarSourcesForOrg(sess.orgId);
    return NextResponse.json({
        sources: sources.map((source) => ({
            id: source._id.toString(),
            name: source.name,
            type: source.type,
            status: source.status,
            visibility: source.visibility,
            timezone: source.timezone,
            refreshSeconds: source.refreshSeconds,
            icsUrl: source.icsUrl,
            assetContentId: source.assetContentId?.toString(),
            tags: source.tags ?? [],
            lastSyncAt: source.lastSyncAt,
            lastValidatedAt: source.lastValidatedAt,
            lastError: source.lastError,
            updatedAt: source.updatedAt,
        })),
    });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
    const sess = await getOrgIdFromSession(req);
    if (!sess) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = createSourceSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const source = await createGoogleCalendarSource({
        orgId: sess.orgId,
        userId: sess.userId,
        ...parsed.data,
    });

    logger.info("Google Calendar source created", {
        sourceId: source._id.toString(),
        sourceType: source.type,
        orgId: sess.orgId,
    });

    return NextResponse.json(
        {
            source: {
                id: source._id.toString(),
                name: source.name,
                type: source.type,
                status: source.status,
                visibility: source.visibility,
                timezone: source.timezone,
                refreshSeconds: source.refreshSeconds,
                icsUrl: source.icsUrl,
                assetContentId: source.assetContentId?.toString(),
                tags: source.tags ?? [],
            },
        },
        { status: 201 },
    );
});
