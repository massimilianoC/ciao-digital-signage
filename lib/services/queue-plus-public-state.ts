import {
    buildQueuePlusDisplayNumber,
    getEffectiveQueuePlusMode,
    getNextQueuePlusRoundRobinCounter,
    getQueuePlusAggregateForPublicAccess,
    getOrCreateQueuePlusData,
    listQueuePlusCatalogForOrg,
    getQueuePlusDataByDatasetId,
    getQueuePlusDatasetById,
    listQueuePlusDisplayTargets,
    listRemoteQueuePlusTargets,
    type QueuePlusAggregate,
} from "@/lib/services/queue-plus.service";

export async function buildQueuePlusPublicStateResponse(
    instanceId: string,
    aggregate: QueuePlusAggregate,
    requestedDatasetId?: string,
) {
    const { queueData, config, instance } = aggregate;
    const mode = getEffectiveQueuePlusMode(config.mode);
    const orgId = String(instance.orgId);
    const remoteQueues = mode === "remote"
        ? await listRemoteQueuePlusTargets(orgId, config)
        : [];
    const selectableDatasetIds = mode === "remote"
        ? remoteQueues.map((entry) => entry.datasetId)
        : Array.from(new Set([config.datasetId, ...(config.allowedDatasetIds ?? [])]));
    const resolvedDatasetId = mode === "remote"
        ? (
            requestedDatasetId && selectableDatasetIds.includes(requestedDatasetId)
                ? requestedDatasetId
                : (selectableDatasetIds.includes(config.datasetId) ? config.datasetId : selectableDatasetIds[0] ?? config.datasetId)
        )
        : config.datasetId;
    const resolvedDataset = resolvedDatasetId !== config.datasetId
        ? await getQueuePlusDatasetById(orgId, resolvedDatasetId)
        : null;
    const resolvedDatasetConfig = (resolvedDataset?.config ?? {}) as Record<string, unknown>;
    let resolvedQueueData = resolvedDatasetId !== config.datasetId
        ? await getQueuePlusDataByDatasetId(String(instance.orgId), resolvedDatasetId)
        : queueData;

    if (!resolvedQueueData && mode === "remote" && resolvedDataset && typeof resolvedDatasetConfig.queueName === "string") {
        resolvedQueueData = await getOrCreateQueuePlusData(orgId, {
            datasetId: resolvedDatasetId,
            queueName: resolvedDatasetConfig.queueName,
            queueType: resolvedDatasetConfig.queueType === "alpha" ? "alpha" : config.queueType,
            prefix: typeof resolvedDatasetConfig.prefix === "string" ? resolvedDatasetConfig.prefix : config.prefix ?? "",
        });
    }

    const resolvedQueueType = resolvedDatasetConfig.queueType === "alpha" ? "alpha" : resolvedQueueData?.queueType ?? config.queueType;
    const resolvedPrefix = typeof resolvedDatasetConfig.prefix === "string" ? resolvedDatasetConfig.prefix : resolvedQueueData?.prefix ?? config.prefix ?? "";
    const resolvedServiceMode = resolvedDatasetConfig.serviceMode === "round-robin" || resolvedDatasetConfig.serviceMode === "multigate"
        ? resolvedDatasetConfig.serviceMode
        : config.serviceMode;
    const resolvedBookingEnabled = typeof resolvedDatasetConfig.bookingEnabled === "boolean"
        ? resolvedDatasetConfig.bookingEnabled
        : config.bookingEnabled;
    const resolvedRoundRobinMaxNumber = typeof resolvedDatasetConfig.roundRobinMaxNumber === "number"
        ? resolvedDatasetConfig.roundRobinMaxNumber
        : config.roundRobinMaxNumber;

    if (mode === "kiosk") {
        const allDatasets = await listQueuePlusCatalogForOrg(orgId);
        const datasetIds = Array.isArray(config.kioskDatasetIds) && config.kioskDatasetIds.length > 0
            ? config.kioskDatasetIds
            : allDatasets.map((entry) => entry.datasetId);
        const queues = await Promise.all(
            datasetIds.map(async (datasetId) => {
                const dataset = await getQueuePlusDatasetById(orgId, datasetId);
                const datasetConfig = (dataset?.config ?? {}) as Record<string, unknown>;
                const targetQueue = await getQueuePlusDataByDatasetId(orgId, datasetId);
                const queueName = typeof datasetConfig.queueName === "string" ? datasetConfig.queueName : targetQueue?.queueName ?? datasetId;
                const queueType = datasetConfig.queueType === "alpha" ? "alpha" : targetQueue?.queueType ?? config.queueType;
                const prefix = typeof datasetConfig.prefix === "string" ? datasetConfig.prefix : targetQueue?.prefix ?? "";
                const bookingEnabled = typeof datasetConfig.bookingEnabled === "boolean" ? datasetConfig.bookingEnabled : true;
                const serviceMode = datasetConfig.serviceMode === "round-robin" || datasetConfig.serviceMode === "multigate"
                    ? datasetConfig.serviceMode
                    : "reservation";

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
                        ? buildQueuePlusDisplayNumber(targetQueue.nextSeq, { queueType, prefix })
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
            ticketDeliveryMode: config.ticketDeliveryMode ?? "print",
            enableDigitalTicket: config.enableDigitalTicket === true,
        };
    }

    if (mode === "waiting-list") {
        const allDatasets = await listQueuePlusCatalogForOrg(orgId);
        const configuredDatasetIds = Array.isArray(config.waitingListDatasetIds) && config.waitingListDatasetIds.length > 0
            ? config.waitingListDatasetIds
            : allDatasets.map((entry) => entry.datasetId);
        const waitingDatasetIds = Array.from(new Set([resolvedDatasetId, ...configuredDatasetIds]));

        const waitingDatasets = await Promise.all(
            waitingDatasetIds.map(async (datasetId) => {
                const dataset = await getQueuePlusDatasetById(String(instance.orgId), datasetId);
                const datasetConfig = (dataset?.config ?? {}) as Record<string, unknown>;
                const runtime = await getQueuePlusDataByDatasetId(String(instance.orgId), datasetId);
                if (!runtime) return null;

                const queueName = typeof datasetConfig.queueName === "string"
                    ? datasetConfig.queueName
                    : runtime.queueName;
                const queueType = datasetConfig.queueType === "alpha" ? "alpha" : runtime.queueType;
                const prefix = typeof datasetConfig.prefix === "string" ? datasetConfig.prefix : runtime.prefix ?? "";
                const accentColor = runtime.displayAccentColor ?? config.accentColor ?? "#2563EB";

                return {
                    datasetId,
                    queueName,
                    queueType,
                    prefix,
                    accentColor,
                    currentServing: runtime.currentServing,
                    waitingCount: runtime.waitingQueue.length,
                    waitingQueue: runtime.waitingQueue.map((entry) => ({
                        seq: entry.seq,
                        displayNumber: entry.displayNumber,
                        issuedAt: entry.issuedAt?.toISOString?.() ?? new Date().toISOString(),
                        datasetId,
                        queueName,
                        accentColor,
                    })),
                };
            }),
        );

        const waitingQueues = waitingDatasets.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
        const waitingCount = waitingQueues.reduce((acc, queue) => acc + queue.waitingCount, 0);
        const waitingListMergeMode = config.waitingListMergeMode === "merged-by-timestamp"
            ? "merged-by-timestamp"
            : "split";

        const mergedWaitingQueue = waitingQueues
            .flatMap((queue) => queue.waitingQueue)
            .sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime());

        return {
            instanceId,
            mode,
            datasetId: resolvedDatasetId,
            queueName: resolvedQueueData?.queueName ?? null,
            queueType: resolvedQueueType,
            prefix: resolvedPrefix,
            currentServing: resolvedQueueData?.currentServing ?? null,
            waitingCount,
            waitingQueue: waitingListMergeMode === "merged-by-timestamp"
                ? mergedWaitingQueue
                : [],
            waitingQueues,
            history: [],
            accentColor: resolvedQueueData?.displayAccentColor ?? config.accentColor ?? "#2563EB",
            defaultAccentColor: config.accentColor ?? "#2563EB",
            displayMessage: resolvedQueueData?.displayMessage ?? null,
            showWaitingCount: config.showWaitingCount ?? true,
            serviceMode: resolvedServiceMode,
            bookingEnabled: resolvedBookingEnabled,
            roundRobinMaxNumber: resolvedRoundRobinMaxNumber,
            waitingListLimit: config.waitingListLimit ?? 8,
            waitingListLayout: config.waitingListLayout ?? "list",
            waitingListMergeMode,
            nextSeq: resolvedQueueData?.nextSeq ?? 1,
            nextDisplayNumber: resolvedQueueData
                ? buildQueuePlusDisplayNumber(resolvedQueueData.nextSeq, { queueType: resolvedQueueType, prefix: resolvedPrefix })
                : null,
            nextServingDisplayNumber: null,
            refreshSeconds: 20,
            publicToken: instance.publicToken,
            audio: config.audio,
            allowedDisplayIds: config.allowedDisplayIds ?? [],
            activeDisplayId: config.activeDisplayId ?? null,
            displayBindingMode: config.displayBindingMode ?? "follow-queue",
            remoteQueues: [],
        };
    }

    if (!resolvedQueueData) {
        throw new Error("QUEUE_PLUS_STATE_NOT_FOUND");
    }

    const nextServingDisplayNumber = resolvedServiceMode === "round-robin" || resolvedServiceMode === "multigate"
        ? buildQueuePlusDisplayNumber(
            getNextQueuePlusRoundRobinCounter(resolvedQueueData.currentServingSeq, Math.max(resolvedRoundRobinMaxNumber || 1, 1)),
            { queueType: resolvedQueueType, prefix: resolvedPrefix },
        )
        : resolvedQueueData.waitingQueue[0]?.displayNumber ?? null;

    const availableDisplays = mode === "remote"
        ? await listQueuePlusDisplayTargets(orgId, resolvedDatasetId)
        : [];
    const configuredDisplayIds = Array.isArray(config.allowedDisplayIds)
        ? config.allowedDisplayIds
        : [];
    const effectiveAllowedDisplayIds = configuredDisplayIds.length > 0
        ? configuredDisplayIds
        : availableDisplays.map((entry) => entry.displayId);

    return {
        instanceId,
        mode,
        datasetId: resolvedDatasetId,
        queueName: resolvedQueueData.queueName,
        queueType: resolvedQueueType,
        prefix: resolvedPrefix,
        currentServing: resolvedQueueData.currentServing,
        waitingCount: resolvedQueueData.waitingQueue.length,
        waitingQueue: ["remote", "waiting-list"].includes(mode)
            ? resolvedQueueData.waitingQueue
            : [],
        history: mode === "remote" ? resolvedQueueData.history.slice(-5) : [],
        accentColor: resolvedQueueData.displayAccentColor ?? config.accentColor ?? "#2563EB",
        defaultAccentColor: config.accentColor ?? "#2563EB",
        displayMessage: resolvedQueueData.displayMessage ?? null,
        showWaitingCount: config.showWaitingCount ?? true,
        serviceMode: resolvedServiceMode,
        bookingEnabled: resolvedBookingEnabled,
        roundRobinMaxNumber: resolvedRoundRobinMaxNumber,
        waitingListLimit: config.waitingListLimit ?? 8,
        waitingListLayout: config.waitingListLayout ?? "list",
        waitingListMergeMode: config.waitingListMergeMode ?? "split",
        nextSeq: resolvedQueueData.nextSeq,
        nextDisplayNumber: buildQueuePlusDisplayNumber(resolvedQueueData.nextSeq, { queueType: resolvedQueueType, prefix: resolvedPrefix }),
        nextServingDisplayNumber,
        refreshSeconds: 20,
        publicToken: instance.publicToken,
        audio: config.audio,
        allowedDisplayIds: effectiveAllowedDisplayIds,
        availableDisplays,
        activeDisplayId: config.activeDisplayId ?? null,
        displayBindingMode: config.displayBindingMode ?? "follow-queue",
        remoteQueues,
    };
}

export async function getQueuePlusPublicStateForAccess(instanceId: string, token: string, requestedDatasetId?: string) {
    const aggregate = await getQueuePlusAggregateForPublicAccess(instanceId, token);
    if (!aggregate) return null;

    const state = await buildQueuePlusPublicStateResponse(instanceId, aggregate, requestedDatasetId);

    return {
        aggregate,
        state,
    };
}
