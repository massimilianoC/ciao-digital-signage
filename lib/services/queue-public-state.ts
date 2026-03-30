import {
    buildDisplayNumber,
    getEffectiveQueueMode,
    getNextRoundRobinCounter,
    getQueueDatasetById,
    getQueueAggregateForPublicAccess,
    getQueueDataByDatasetId,
    type QueueAggregate,
} from "@/lib/services/queue-connector.service";

export async function buildQueuePublicStateResponse(
    instanceId: string,
    aggregate: QueueAggregate,
) {
    const { queueData, config, instance } = aggregate;
    const mode = getEffectiveQueueMode(config.mode);

    if (mode === "kiosk") {
        const datasetIds = Array.isArray(config.kioskDatasetIds) ? config.kioskDatasetIds : [];
        const queues = await Promise.all(
            datasetIds.map(async (datasetId) => {
                const dataset = await getQueueDatasetById(String(instance.orgId), datasetId);
                const datasetConfig = (dataset?.config ?? {}) as Record<string, unknown>;
                const targetQueue = await getQueueDataByDatasetId(String(instance.orgId), datasetId);
                const queueName = typeof datasetConfig.queueName === "string" ? datasetConfig.queueName : targetQueue?.queueName ?? datasetId;
                const queueType = datasetConfig.queueType === "alpha" ? "alpha" : targetQueue?.queueType ?? config.queueType;
                const prefix = typeof datasetConfig.prefix === "string" ? datasetConfig.prefix : targetQueue?.prefix ?? "";
                const bookingEnabled = typeof datasetConfig.bookingEnabled === "boolean" ? datasetConfig.bookingEnabled : true;
                const serviceMode = datasetConfig.serviceMode === "round-robin" ? "round-robin" : "reservation";

                return {
                    datasetId,
                    queueName,
                    currentServing: targetQueue?.currentServing ?? null,
                    waitingCount: targetQueue?.waitingQueue.length ?? 0,
                    queueType,
                    prefix,
                    bookingEnabled,
                    serviceMode,
                    nextDisplayNumber: targetQueue
                        ? buildDisplayNumber(targetQueue.nextSeq, {
                            ...config,
                            queueType,
                            prefix,
                        })
                        : null,
                };
            }),
        );

        return {
            instanceId,
            mode,
            datasetId: config.datasetId,
            queueName: queueData?.queueName ?? null,
            kioskQueues: queues,
            refreshSeconds: 20,
            publicToken: instance.publicToken,
        };
    }

    if (!queueData) {
        throw new Error("QUEUE_STATE_NOT_FOUND");
    }

    const nextServingDisplayNumber = config.serviceMode === "round-robin"
        ? buildDisplayNumber(
            getNextRoundRobinCounter(queueData.currentServingSeq, Math.max(config.roundRobinMaxNumber || 1, 1)),
            config,
        )
        : queueData.waitingQueue[0]?.displayNumber ?? null;

    return {
        instanceId,
        mode,
        datasetId: config.datasetId,
        queueName: queueData.queueName,
        queueType: config.queueType,
        prefix: config.prefix ?? "",
        currentServing: queueData.currentServing,
        waitingCount: (queueData.waitingQueue as unknown[]).length,
        waitingQueue: ["remote", "waiting-list"].includes(mode)
            ? queueData.waitingQueue
            : [],
        history: mode === "remote"
            ? (queueData.history as unknown[]).slice(-5)
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
        refreshSeconds: 20,
        publicToken: instance.publicToken,
    };
}

export async function getQueuePublicStateForAccess(instanceId: string, token: string) {
    const aggregate = await getQueueAggregateForPublicAccess(instanceId, token);

    if (!aggregate) {
        return null;
    }

    const state = await buildQueuePublicStateResponse(instanceId, aggregate);

    return {
        aggregate,
        state,
    };
}
