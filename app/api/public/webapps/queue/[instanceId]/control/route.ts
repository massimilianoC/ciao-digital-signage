import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
    advanceQueue,
    buildIssuedTicketPayload,
    getQueueAggregateForPublicAccess,
    getQueueDatasetById,
    issueNextNumber,
    normalizeQueueName,
    resetQueue,
    retreatQueue,
    setCustomNumber,
    updateQueueDisplayOptions,
} from "@/lib/services/queue-connector.service";

const controlSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("advance") }),
    z.object({ action: z.literal("retreat") }),
    z.object({ action: z.literal("issue") }),
    z.object({ action: z.literal("issueForQueue"), queueName: z.string().min(1).max(100) }),
    z.object({ action: z.literal("reset"), keepHistory: z.boolean().optional() }),
    z.object({
        action: z.literal("set"),
        displayNumber: z.string().min(1).max(20),
    }),
    z.object({
        action: z.literal("display"),
        message: z.string().max(120).nullable().optional(),
        accentColor: z
            .string()
            .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
            .nullable()
            .optional(),
    }),
]);

/**
 * POST /api/public/webapps/queue/[instanceId]/control?token=...
 * Token-gated control endpoint for remote control instances.
 * Accepts: advance | retreat | issue | set | reset
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ instanceId: string }> },
) {
    const { instanceId } = await params;
    const token = req.nextUrl.searchParams.get("token");

    if (!token) {
        return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const agg = await getQueueAggregateForPublicAccess(instanceId, token);

    if (!agg) {
        return NextResponse.json({ error: "Instance not found" }, { status: 404 });
    }

    const mode = agg.config.mode === "display" ? "queue" : agg.config.mode;

    if (mode !== "remote" && mode !== "kiosk") {
        return NextResponse.json(
            { error: "This instance is in display mode; control not allowed" },
            { status: 403 },
        );
    }

    const body = await req.json();
    const parsed = controlSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const orgId = String(agg.instance.orgId);

    const primaryDataset = await getQueueDatasetById(orgId, agg.config.datasetId);
    const primaryConfig = (primaryDataset?.config ?? {}) as Record<string, unknown>;
    const queueName = typeof primaryConfig.queueName === "string" ? primaryConfig.queueName : null;

    if (!queueName) {
        return NextResponse.json({ error: "Queue dataset not found" }, { status: 404 });
    }

    let result: string | null = null;
    let ticket: ReturnType<typeof buildIssuedTicketPayload> | null = null;

    try {
        switch (parsed.data.action) {
            case "advance":
                if (mode !== "remote") {
                    throw new Error("Solo le istanze remote possono avanzare la coda");
                }
                result = await advanceQueue(orgId, queueName, instanceId);
                break;

            case "retreat":
                if (mode !== "remote") {
                    throw new Error("Solo le istanze remote possono tornare indietro");
                }
                result = await retreatQueue(orgId, queueName, instanceId);
                break;

            case "issue":
                if (mode !== "remote") {
                    throw new Error("Usa issueForQueue per il kiosk multicode");
                }
                result = await issueNextNumber(orgId, queueName, instanceId);
                ticket = buildIssuedTicketPayload({
                    queueName,
                    displayNumber: result,
                });
                break;

            case "issueForQueue": {
                if (mode !== "kiosk") {
                    throw new Error("Solo il kiosk puo' emettere per altre code");
                }

                const targetQueue = normalizeQueueName(parsed.data.queueName);
                const kioskDatasetIds = Array.isArray(agg.config.kioskDatasetIds) ? agg.config.kioskDatasetIds : [];
                const kioskDatasets = await Promise.all(
                    kioskDatasetIds.map((id) => getQueueDatasetById(orgId, id)),
                );
                const allowedQueues = kioskDatasets
                    .map((d) => {
                        const cfg = (d?.config ?? {}) as Record<string, unknown>;
                        return typeof cfg.queueName === "string" ? normalizeQueueName(cfg.queueName) : null;
                    })
                    .filter((n): n is string => n !== null);

                if (!allowedQueues.includes(targetQueue)) {
                    throw new Error("Coda non abilitata su questo kiosk");
                }

                result = await issueNextNumber(orgId, targetQueue, instanceId);
                ticket = buildIssuedTicketPayload({
                    queueName: targetQueue,
                    displayNumber: result,
                    kioskInstanceId: instanceId,
                });
                break;
            }

            case "set":
                if (mode !== "remote") {
                    throw new Error("Solo le istanze remote possono impostare il numero corrente");
                }
                await setCustomNumber(orgId, queueName, instanceId, parsed.data.displayNumber);
                result = parsed.data.displayNumber;
                break;

            case "reset":
                if (mode !== "remote") {
                    throw new Error("Solo le istanze remote possono resettare la coda");
                }
                await resetQueue(orgId, queueName, instanceId, parsed.data.keepHistory ?? false);
                result = null;
                break;

            case "display":
                if (mode !== "remote") {
                    throw new Error("Solo le istanze remote possono aggiornare il display");
                }
                await updateQueueDisplayOptions(orgId, queueName, instanceId, {
                    message: parsed.data.message,
                    accentColor: parsed.data.accentColor,
                });
                result = agg.queueData?.currentServing ?? null;
                break;
        }
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Queue control failed" },
            { status: 400 },
        );
    }

    return NextResponse.json({ ok: true, currentServing: result, ticket });
}
