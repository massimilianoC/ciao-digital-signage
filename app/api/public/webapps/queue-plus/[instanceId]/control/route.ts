import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { emitWebappEvent } from "@/lib/realtime/webapp-emitter";
import { buildInstanceChannelKey, buildQueueChannelKey } from "@/lib/realtime/webapp-events";
import {
    advanceQueuePlus,
    buildIssuedQueuePlusTicketPayload,
    getQueuePlusAggregateForPublicAccess,
    getQueuePlusDataByDatasetId,
    issueNextQueuePlusNumber,
    listQueuePlusDisplayTargets,
    resetQueuePlus,
    resolveQueuePlusActionContext,
    retreatQueuePlus,
    setQueuePlusCustomNumber,
    updateQueuePlusDisplayOptions,
} from "@/lib/services/queue-plus.service";
import { issueQueuePlusDigitalTicket } from "@/lib/services/queue-plus-ticket.service";
import {
    assertQueuePlusDisplayLockOwner,
    QueuePlusDisplayLockError,
    renewQueuePlusDisplayLock,
} from "@/lib/services/queue-plus-display-lock.service";

const controlSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("advance"), datasetId: z.string().min(1).optional(), displayId: z.string().optional() }),
    z.object({ action: z.literal("retreat"), datasetId: z.string().min(1).optional(), displayId: z.string().optional() }),
    z.object({ action: z.literal("issue"), datasetId: z.string().min(1).optional(), displayId: z.string().optional() }),
    z.object({ action: z.literal("issueForQueue"), datasetId: z.string().min(1), displayId: z.string().optional() }),
    z.object({ action: z.literal("reset"), keepHistory: z.boolean().optional(), datasetId: z.string().min(1).optional(), displayId: z.string().optional() }),
    z.object({ action: z.literal("set"), displayNumber: z.string().min(1).max(20), datasetId: z.string().min(1).optional(), displayId: z.string().optional() }),
    z.object({ action: z.literal("display"), message: z.string().max(120).nullable().optional(), accentColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).nullable().optional(), datasetId: z.string().min(1).optional(), displayId: z.string().optional() }),
]);

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ instanceId: string }> },
) {
    const { instanceId } = await params;
    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
        return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const agg = await getQueuePlusAggregateForPublicAccess(instanceId, token);
    if (!agg) {
        return NextResponse.json({ error: "Instance not found" }, { status: 404 });
    }

    const mode = agg.config.mode === "display" ? "queue" : agg.config.mode;
    if (mode !== "remote" && mode !== "kiosk") {
        return NextResponse.json({ error: "This instance is in display mode; control not allowed" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = controlSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const orgId = String(agg.instance.orgId);
    let result: string | null = null;
    let ticket: ReturnType<typeof buildIssuedQueuePlusTicketPayload> | null = null;
    let targetDatasetId = agg.config.datasetId;

    try {
        const resolved = await resolveQueuePlusActionContext(orgId, instanceId, parsed.data.datasetId);
        targetDatasetId = parsed.data.action === "issueForQueue" ? parsed.data.datasetId : resolved.datasetId;

        const requiresDisplayLock =
            mode === "remote" &&
            agg.config.serviceMode === "multigate";

        if (requiresDisplayLock) {
            const selectedDisplayId = (parsed.data.displayId ?? agg.config.activeDisplayId ?? "").trim();
            if (!selectedDisplayId) {
                throw new QueuePlusDisplayLockError("DISPLAY_LOCK_REQUIRED", "Display lock required. Select a display and acquire lock.", 423);
            }

            const configuredAllowedDisplayIds = Array.isArray(agg.config.allowedDisplayIds)
                ? agg.config.allowedDisplayIds.map((entry) => String(entry).toLowerCase())
                : [];
            const discoveredDisplayIds = configuredAllowedDisplayIds.length === 0
                ? (await listQueuePlusDisplayTargets(orgId, targetDatasetId)).map((entry) => entry.displayId.toLowerCase())
                : [];
            const effectiveAllowedDisplayIds = configuredAllowedDisplayIds.length > 0
                ? configuredAllowedDisplayIds
                : discoveredDisplayIds;

            if (!effectiveAllowedDisplayIds.includes(selectedDisplayId.toLowerCase())) {
                throw new QueuePlusDisplayLockError("DISPLAY_NOT_ALLOWED", "Selected display is not allowed for this remote.", 403);
            }

            await assertQueuePlusDisplayLockOwner({
                orgId,
                datasetId: targetDatasetId,
                displayId: selectedDisplayId,
                ownerInstanceId: instanceId,
            });

            await renewQueuePlusDisplayLock({
                orgId,
                datasetId: targetDatasetId,
                displayId: selectedDisplayId,
                ownerInstanceId: instanceId,
            });
        }

        switch (parsed.data.action) {
            case "advance":
                if (mode !== "remote") throw new Error("Solo le istanze remote possono avanzare la coda");
                result = await advanceQueuePlus(orgId, targetDatasetId, instanceId);
                break;
            case "retreat":
                if (mode !== "remote") throw new Error("Solo le istanze remote possono tornare indietro");
                result = await retreatQueuePlus(orgId, targetDatasetId, instanceId);
                break;
            case "issue":
                if (mode !== "remote") throw new Error("Usa issueForQueue per il kiosk multicode");
                result = await issueNextQueuePlusNumber(orgId, targetDatasetId, instanceId);
                {
                    const targetQueueState = await getQueuePlusDataByDatasetId(orgId, targetDatasetId);
                    ticket = buildIssuedQueuePlusTicketPayload({
                        datasetId: targetDatasetId,
                        queueName: targetQueueState?.queueName ?? targetDatasetId,
                        displayNumber: result,
                        ticketDeliveryMode: agg.config.ticketDeliveryMode,
                        enableDigitalTicket: agg.config.enableDigitalTicket,
                    });
                }
                break;
            case "issueForQueue":
                if (mode !== "kiosk") throw new Error("Solo il kiosk puo' emettere per altre code");
                if (Array.isArray(agg.config.kioskDatasetIds) && agg.config.kioskDatasetIds.length > 0 && !agg.config.kioskDatasetIds.includes(targetDatasetId)) {
                    throw new Error("Coda non abilitata su questo kiosk");
                }
                result = await issueNextQueuePlusNumber(orgId, targetDatasetId, instanceId);
                {
                    const targetQueueState = await getQueuePlusDataByDatasetId(orgId, targetDatasetId);
                    ticket = buildIssuedQueuePlusTicketPayload({
                        datasetId: targetDatasetId,
                        queueName: targetQueueState?.queueName ?? targetDatasetId,
                        displayNumber: result,
                        kioskInstanceId: instanceId,
                        ticketDeliveryMode: agg.config.ticketDeliveryMode,
                        enableDigitalTicket: agg.config.enableDigitalTicket,
                    });
                }
                break;
            case "set":
                if (mode !== "remote") throw new Error("Solo le istanze remote possono impostare il numero corrente");
                await setQueuePlusCustomNumber(orgId, targetDatasetId, instanceId, parsed.data.displayNumber);
                result = parsed.data.displayNumber;
                break;
            case "reset":
                if (mode !== "remote") throw new Error("Solo le istanze remote possono resettare la coda");
                await resetQueuePlus(orgId, targetDatasetId, instanceId, parsed.data.keepHistory ?? false);
                result = null;
                break;
            case "display":
                if (mode !== "remote") throw new Error("Solo le istanze remote possono aggiornare il display");
                await updateQueuePlusDisplayOptions(orgId, targetDatasetId, instanceId, {
                    message: parsed.data.message,
                    accentColor: parsed.data.accentColor,
                });
                result = null;
                break;
        }
    } catch (error) {
        if (error instanceof QueuePlusDisplayLockError) {
            return NextResponse.json(
                { error: error.code, message: error.message },
                { status: error.httpStatus },
            );
        }

        return NextResponse.json({ error: error instanceof Error ? error.message : "QueuePLUS control failed" }, { status: 400 });
    }

    const targetQueueState = await getQueuePlusDataByDatasetId(orgId, targetDatasetId);
    const queueChannelKey = buildQueueChannelKey(targetQueueState?.queueName ?? targetDatasetId);
    const instanceChannelKey = buildInstanceChannelKey(instanceId);
    const eventVersion = targetQueueState?.lastUpdatedAt ? new Date(targetQueueState.lastUpdatedAt).getTime() : Date.now();

    emitWebappEvent({
        orgId,
        appId: "queue-plus",
        instanceId,
        eventType: "queue.updated",
        payload: {
            datasetId: targetDatasetId,
            queueName: targetQueueState?.queueName ?? targetDatasetId,
            currentServing: targetQueueState?.currentServing ?? null,
            waitingCount: targetQueueState?.waitingQueue.length ?? 0,
            displayMessage: targetQueueState?.displayMessage ?? null,
            accentColor: targetQueueState?.displayAccentColor ?? null,
            updatedAt: targetQueueState?.lastUpdatedAt?.toISOString() ?? new Date().toISOString(),
        },
        channelKeys: [instanceChannelKey, queueChannelKey],
        version: eventVersion,
        source: "api.public.queue-plus.control",
    });

    if (ticket) {
        if (agg.config.enableDigitalTicket) {
            const tracking = await issueQueuePlusDigitalTicket({
                orgId,
                instanceId,
                datasetId: targetDatasetId,
                queueName: ticket.queueName,
                displayNumber: ticket.displayNumber,
                kioskInstanceId: ticket.kioskInstanceId,
            });
            ticket.trackingCode = tracking.ticketCode;
            ticket.trackingUrl = tracking.trackingUrl;
        }

        emitWebappEvent({
            orgId,
            appId: "queue-plus",
            instanceId,
            eventType: "queue.ticket.issued",
            payload: ticket,
            channelKeys: [instanceChannelKey, queueChannelKey],
            version: eventVersion,
            source: "api.public.queue-plus.control",
        });
    }

    return NextResponse.json({ ok: true, currentServing: result, ticket });
}
