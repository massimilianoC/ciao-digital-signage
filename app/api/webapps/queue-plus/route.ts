import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOrgIdFromSession, logger, withErrorHandler } from "@/lib/api-utils";
import { createQueuePlusConnector, ensureQueuePlusDatasetByName, listQueuePlusCatalogForOrg } from "@/lib/services/queue-plus.service";

const createSchema = z.object({
    name: z.string().min(1).max(200),
    settings: z.object({
        mode: z.enum(["display", "queue", "remote", "waiting-list", "kiosk"]),
        datasetId: z.string().min(1).optional(),
        queueType: z.enum(["numeric", "alpha"]).default("numeric"),
        prefix: z.string().max(10).optional(),
        maxWaiting: z.number().int().min(1).max(999).default(99),
        showWaitingCount: z.boolean().default(true),
        serviceMode: z.literal("multigate").default("multigate"),
        bookingEnabled: z.boolean().default(true),
        roundRobinMaxNumber: z.number().int().min(1).max(9999).default(99),
        kioskDatasetIds: z.array(z.string().min(1)).max(100).optional(),
        allowedDatasetIds: z.array(z.string().min(1)).max(100).optional(),
        waitingListDatasetIds: z.array(z.string().min(1)).max(100).optional(),
        waitingListLimit: z.number().int().min(1).max(50).default(8),
        waitingListLayout: z.enum(["list", "grid"]).default("list"),
        waitingListMergeMode: z.enum(["split", "merged-by-timestamp"]).default("split"),
        displayBindingMode: z.enum(["follow-queue", "remote-controlled"]).default("remote-controlled"),
        allowedDisplayIds: z.array(z.string().min(1)).max(100).optional(),
        activeDisplayId: z.string().min(1).nullable().optional(),
        ticketDeliveryMode: z.enum(["print", "qr", "both"]).default("print"),
        enableDigitalTicket: z.boolean().default(false),
        printerProfile: z.string().max(120).optional(),
        audio: z.object({
            enabled: z.boolean().default(true),
            speechMode: z.enum(["off", "number", "message", "both"]).default("number"),
            languages: z.array(z.string().min(2)).default(["it-IT"]),
            preChime: z.boolean().default(false),
            postChime: z.boolean().default(false),
        }).optional(),
        accentColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional().default("#2563EB"),
    }),
    defaultDurationMs: z.number().int().min(5000).max(3600000).default(30000),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
    const sess = await getOrgIdFromSession(req);
    if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const { name, settings, defaultDurationMs } = parsed.data;

    let datasetId = settings.datasetId;

    // Verify the dataset exists if provided
    if (datasetId) {
        const WebAppDatasetModel = (await import("@/lib/db/models/WebAppDataset")).WebAppDatasetModel;
        const { connectDB } = await import("@/lib/db/connection");
        await connectDB();
        const dataset = await WebAppDatasetModel.findOne({
            _id: datasetId,
            orgId: sess.orgId,
            appId: "queue-plus",
        }).lean();
        if (!dataset) {
            // Dataset was deleted or doesn't belong to this org — auto-create instead
            datasetId = undefined;
        }
    }

    // QueuePLUS connector persistence currently requires a primary datasetId.
    // If none is provided (or stale), create/reuse a deterministic dataset by instance name.
    if (!datasetId) {
        datasetId = await ensureQueuePlusDatasetByName({
            orgId: sess.orgId,
            userId: sess.userId ?? "",
            queueName: `display-${name.toLowerCase().replace(/\s+/g, "-")}`,
            queueType: settings.queueType,
            prefix: settings.prefix,
            maxWaiting: settings.maxWaiting,
            bookingEnabled: settings.bookingEnabled,
            serviceMode: settings.serviceMode,
            roundRobinMaxNumber: settings.roundRobinMaxNumber,
            audio: settings.audio,
        });
    }

    const catalog = await listQueuePlusCatalogForOrg(sess.orgId);
    const validDatasetIds = new Set(catalog.map((entry) => entry.datasetId));

    const normalizeDatasetList = (values?: string[]) => Array.from(new Set(values ?? []))
        .filter((entry) => validDatasetIds.has(entry));

    const normalizedAllowedDatasetIds = normalizeDatasetList(settings.allowedDatasetIds);
    const normalizedKioskDatasetIds = normalizeDatasetList(settings.kioskDatasetIds);
    const normalizedWaitingListDatasetIds = normalizeDatasetList(settings.waitingListDatasetIds);

    const normalizedSettings = {
        ...settings,
        datasetId,
        serviceMode: "multigate" as const,
        displayBindingMode: "remote-controlled" as const,
        ticketDeliveryMode: settings.mode === "kiosk"
            ? (settings.ticketDeliveryMode ?? "print")
            : "print",
        enableDigitalTicket: settings.mode === "kiosk"
            ? settings.enableDigitalTicket === true
            : false,
        printerProfile: settings.mode === "kiosk"
            ? settings.printerProfile
            : undefined,
        allowedDatasetIds: normalizedAllowedDatasetIds,
        kioskDatasetIds: normalizedKioskDatasetIds,
        waitingListDatasetIds: normalizedWaitingListDatasetIds,
    };

    let agg;
    try {
        agg = await createQueuePlusConnector({
            orgId: sess.orgId,
            userId: sess.userId ?? "",
            name,
            settings: normalizedSettings,
            defaultDurationMs,
        });
    } catch (error) {
        logger.error("QueuePLUS connector creation failed", error, {
            orgId: sess.orgId,
            name,
            mode: normalizedSettings.mode,
            datasetId: normalizedSettings.datasetId,
        });
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "QueuePLUS connector creation failed" },
            { status: 400 },
        );
    }

    const instanceId = String(agg.instance._id);
    const playerUrl = `/webapps/queue-plus/${instanceId}?token=${agg.instance.publicToken}&mode=${normalizedSettings.mode}`;

    return NextResponse.json({
        instanceId,
        publicToken: agg.instance.publicToken,
        contentId: agg.instance.contentId ? String(agg.instance.contentId) : null,
        playerUrl,
        datasetId: normalizedSettings.datasetId,
        mode: normalizedSettings.mode,
        name,
    }, { status: 201 });
});
