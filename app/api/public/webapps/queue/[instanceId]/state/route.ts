import { NextRequest, NextResponse } from "next/server";

import {
    buildDisplayNumber,
    getEffectiveQueueMode,
    getNextRoundRobinCounter,
    getQueueDataByName,
    getQueueAggregateForPublicAccess,
    getQueueSettingsForQueueName,
    normalizeQueueNameList,
} from "@/lib/services/queue-connector.service";

/**
 * GET /api/public/webapps/queue/[instanceId]/state?token=...
 * Player-safe endpoint: no auth cookie required, token-gated.
 * Returns the current queue state for the display or remote app.
 */
export async function GET(
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
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { queueData, config, instance } = agg;
    const mode = getEffectiveQueueMode(config.mode);

    if (mode === "kiosk") {
        const queueNames = normalizeQueueNameList(config.kioskQueueNames);
        const queues = await Promise.all(
            queueNames.map(async (queueName) => {
                const targetQueue = await getQueueDataByName(String(instance.orgId), queueName);
                const targetSettings = await getQueueSettingsForQueueName(String(instance.orgId), queueName);

                return {
                    queueName,
                    currentServing: targetQueue?.currentServing ?? null,
                    waitingCount: targetQueue?.waitingQueue.length ?? 0,
                    queueType: targetSettings?.queueType ?? targetQueue?.queueType ?? config.queueType,
                    prefix: targetSettings?.prefix ?? targetQueue?.prefix ?? "",
                    bookingEnabled: targetSettings?.bookingEnabled ?? true,
                    serviceMode: targetSettings?.serviceMode ?? "reservation",
                    nextDisplayNumber: targetQueue && targetSettings
                        ? buildDisplayNumber(targetQueue.nextSeq, targetSettings)
                        : null,
                };
            }),
        );

        return NextResponse.json({
            instanceId,
            mode,
            queueName: config.queueName,
            kioskQueues: queues,
            refreshSeconds: 5,
            publicToken: instance.publicToken,
        });
    }

    if (!queueData) {
        return NextResponse.json({ error: "Queue state not found" }, { status: 404 });
    }

    const nextServingDisplayNumber = config.serviceMode === "round-robin"
        ? buildDisplayNumber(
            getNextRoundRobinCounter(queueData.currentServingSeq, Math.max(config.roundRobinMaxNumber || 1, 1)),
            config,
        )
        : queueData.waitingQueue[0]?.displayNumber ?? null;

    return NextResponse.json({
        instanceId,
        mode,
        queueName: config.queueName,
        queueType: config.queueType,
        prefix: config.prefix ?? "",
        currentServing: queueData.currentServing,
        waitingCount: (queueData.waitingQueue as unknown[]).length,
        waitingQueue: ["remote", "waiting-list"].includes(mode)
            ? queueData.waitingQueue
            : [], // display mode only shows counts, not full list
        history: mode === "remote"
            ? (queueData.history as unknown[]).slice(-5) // last 5 for remote
            : [],
        accentColor: queueData.displayAccentColor ?? config.accentColor ?? "#2563EB",
        defaultAccentColor: config.accentColor ?? "#2563EB",
        displayMessage: queueData.displayMessage ?? null,
        showWaitingCount: config.showWaitingCount ?? true,
        serviceMode: config.serviceMode,
        bookingEnabled: config.bookingEnabled,
        roundRobinMaxNumber: config.roundRobinMaxNumber,
        waitingListLimit: config.waitingListLimit ?? 8,
        nextSeq: queueData.nextSeq,
        nextDisplayNumber: buildDisplayNumber(queueData.nextSeq, config),
        nextServingDisplayNumber,
        refreshSeconds: 5, // queue refreshes every 5s
        publicToken: instance.publicToken,
    });
}
