import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOrgIdFromSession, withErrorHandler } from "@/lib/api-utils";
import { createQueueConnector } from "@/lib/services/queue-connector.service";

function normalizeQueueName(value: string): string {
    return value.trim().toLowerCase();
}

const createSchema = z.object({
    name: z.string().min(1).max(200),
    settings: z.object({
        mode: z.enum(["display", "queue", "remote", "waiting-list", "kiosk"]),
        queueName: z.string().min(1).max(100),
        queueType: z.enum(["numeric", "alpha"]).default("numeric"),
        prefix: z.string().max(10).optional(),
        maxWaiting: z.number().int().min(1).max(999).default(99),
        showWaitingCount: z.boolean().default(true),
        serviceMode: z.enum(["reservation", "round-robin"]).default("reservation"),
        bookingEnabled: z.boolean().default(true),
        roundRobinMaxNumber: z.number().int().min(1).max(9999).default(99),
        kioskQueueNames: z.array(z.string().min(1).max(100)).max(100).optional(),
        waitingListLimit: z.number().int().min(1).max(50).default(8),
        accentColor: z
            .string()
            .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
            .optional()
            .default("#2563EB"),
    }).superRefine((settings, ctx) => {
        if (settings.mode === "kiosk") {
            if (!Array.isArray(settings.kioskQueueNames) || settings.kioskQueueNames.length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Seleziona almeno una coda per il kiosk",
                    path: ["kioskQueueNames"],
                });
            }
        }
    }),
    defaultDurationMs: z.number().int().min(5000).max(3600000).default(30000),
});

/**
 * POST /api/webapps/queue
 * Creates a new queue app instance (+ shared queue data if queueName is new).
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
    const sess = await getOrgIdFromSession(req);
    if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const { name, settings, defaultDurationMs } = parsed.data;
    const normalizedSettings = {
        ...settings,
        queueName: normalizeQueueName(settings.queueName),
        kioskQueueNames: settings.kioskQueueNames?.map((entry) => normalizeQueueName(entry)).filter(Boolean),
    };

    const agg = await createQueueConnector({
        orgId: sess.orgId,
        userId: sess.userId ?? "",
        name,
        settings: normalizedSettings,
        defaultDurationMs,
    });

    const instanceId = String(agg.instance._id);
    const playerUrl = `/webapps/queue/${instanceId}?token=${agg.instance.publicToken}&mode=${normalizedSettings.mode}`;

    return NextResponse.json(
        {
            instanceId,
            contentId: agg.instance.contentId ? String(agg.instance.contentId) : null,
            playerUrl,
            queueName: normalizedSettings.queueName,
            mode: normalizedSettings.mode,
            name,
        },
        { status: 201 },
    );
});
