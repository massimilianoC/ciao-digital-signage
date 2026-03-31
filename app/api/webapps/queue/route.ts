import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOrgIdFromSession, withErrorHandler } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { WebAppDatasetModel } from "@/lib/db/models/WebAppDataset";
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
 * Creates a new queue app instance (+ dataset + queue data if queueName is new).
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
    const normalizedQueueName = normalizeQueueName(settings.queueName);
    const userId = sess.userId ?? "";

    await connectDB();

    // Ensure a dataset exists for each referenced queue name
    async function ensureDataset(orgId: string, queueName: string, queueType: string, prefix?: string) {
        const existing = await WebAppDatasetModel.findOne({
            orgId,
            appId: "queue",
            "config.queueName": queueName,
        }).lean();
        if (existing) return String(existing._id);

        const created = await WebAppDatasetModel.create({
            orgId,
            appId: "queue",
            name: queueName,
            slug: queueName,
            status: "active",
            schemaVersion: 1,
            datasetKind: "queue",
            editorMode: "custom-react",
            storageMode: "app-collection",
            config: { queueName, queueType, prefix: prefix ?? "" },
            tags: ["queue"],
            createdBy: userId,
            updatedBy: userId,
        });
        return String(created._id);
    }

    // For kiosk: build kioskDatasetIds from kioskQueueNames
    let datasetId: string;
    let kioskDatasetIds: string[] | undefined;

    if (settings.mode === "kiosk") {
        const kioskQueues = (settings.kioskQueueNames ?? []).map((n) => normalizeQueueName(n)).filter(Boolean);
        const ids = await Promise.all(
            kioskQueues.map((qn) => ensureDataset(sess.orgId, qn, settings.queueType, settings.prefix)),
        );
        kioskDatasetIds = ids;
        // For kiosk, primary datasetId is the first kiosk queue (or a dedicated one)
        datasetId = ids[0] ?? await ensureDataset(sess.orgId, normalizedQueueName, settings.queueType, settings.prefix);
    } else {
        datasetId = await ensureDataset(sess.orgId, normalizedQueueName, settings.queueType, settings.prefix);
    }

    const instanceSettings = {
        mode: settings.mode,
        datasetId,
        queueType: settings.queueType,
        prefix: settings.prefix,
        maxWaiting: settings.maxWaiting,
        showWaitingCount: settings.showWaitingCount,
        serviceMode: settings.serviceMode,
        bookingEnabled: settings.bookingEnabled,
        roundRobinMaxNumber: settings.roundRobinMaxNumber,
        kioskDatasetIds,
        waitingListLimit: settings.waitingListLimit,
        accentColor: settings.accentColor,
    };

    const agg = await createQueueConnector({
        orgId: sess.orgId,
        userId: sess.userId ?? "",
        name,
        settings: instanceSettings,
        defaultDurationMs,
    });

    const instanceId = String(agg.instance._id);
    const playerUrl = `/webapps/queue/${instanceId}?token=${agg.instance.publicToken}&mode=${instanceSettings.mode}`;

    return NextResponse.json(
        {
            instanceId,
            contentId: agg.instance.contentId ? String(agg.instance.contentId) : null,
            playerUrl,
            queueName: normalizedQueueName,
            mode: instanceSettings.mode,
            name,
        },
        { status: 201 },
    );
});
