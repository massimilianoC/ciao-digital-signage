import { randomUUID } from "node:crypto";

import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { WebAppConfigModel, type QueueSettings } from "@/lib/db/models/WebAppConfig";
import { WebAppDatasetModel } from "@/lib/db/models/WebAppDataset";
import { WebAppInstanceModel, type IWebAppInstance } from "@/lib/db/models/WebAppInstance";
import { WebAppStateModel, type IWebAppState } from "@/lib/db/models/WebAppState";
import {
    WebAppQueueDataModel,
    type IWebAppQueueData,
} from "@/lib/db/models/webapp-queue/WebAppQueueData";
import { ContentService } from "@/lib/services/content.service";

export interface QueueAggregate {
    instance: IWebAppInstance;
    config: QueueSettings;
    state: IWebAppState;
    queueData: IWebAppQueueData | null;
}

export interface CreateQueueConnectorInput {
    orgId: string;
    userId: string;
    name: string;
    settings: QueueSettings;
    defaultDurationMs?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function buildDisplayNumber(seq: number, settings: QueueSettings): string {
    if (settings.queueType === "alpha") {
        const p = (settings.prefix || "A").toUpperCase();
        return `${p}${String(seq).padStart(3, "0")}`;
    }
    return String(seq);
}

export function parseDisplayNumber(
    displayNumber: string,
    settings: Pick<QueueSettings, "queueType" | "prefix">,
): number | null {
    const normalized = displayNumber.trim().toUpperCase();

    if (!normalized) return null;

    if (settings.queueType === "alpha") {
        const prefix = (settings.prefix || "A").toUpperCase();
        if (!normalized.startsWith(prefix)) return null;

        const numericPart = normalized.slice(prefix.length);
        if (!/^\d+$/.test(numericPart)) return null;

        return Number.parseInt(numericPart, 10);
    }

    if (!/^\d+$/.test(normalized)) return null;
    return Number.parseInt(normalized, 10);
}

export function normalizeQueueName(value: string): string {
    return value.trim().toLowerCase();
}

export function normalizeQueueNameList(list?: string[]): string[] {
    if (!Array.isArray(list)) return [];

    return Array.from(
        new Set(
            list
                .map((entry) => normalizeQueueName(entry))
                .filter(Boolean),
        ),
    );
}

export function getEffectiveQueueMode(mode: QueueSettings["mode"]): Exclude<QueueSettings["mode"], "display"> | "queue" {
    return mode === "display" ? "queue" : mode;
}

export function getNextRoundRobinCounter(
    currentSeq: number | null | undefined,
    maxNumber: number,
): number {
    if (!Number.isFinite(maxNumber) || maxNumber < 1) return 1;
    if (!currentSeq || currentSeq < 1) return 1;
    return currentSeq >= maxNumber ? 1 : currentSeq + 1;
}

export function getNextRoundRobinTicketSeq(
    occupiedSeqs: number[],
    startSeq: number,
    maxNumber: number,
): number | null {
    if (!Number.isFinite(maxNumber) || maxNumber < 1) return null;

    const occupied = new Set(occupiedSeqs.filter((seq) => seq >= 1 && seq <= maxNumber));

    for (let offset = 0; offset < maxNumber; offset += 1) {
        const candidate = ((Math.max(startSeq, 1) - 1 + offset) % maxNumber) + 1;
        if (!occupied.has(candidate)) return candidate;
    }

    return null;
}

function buildHistoryEntry(queue: IWebAppQueueData) {
    if (!queue.currentServing) return null;

    return {
        displayNumber: queue.currentServing,
        calledAt: new Date(),
        seq: queue.currentServingSeq ?? null,
        issuedAt: queue.currentServingIssuedAt ?? null,
        source: queue.currentSource ?? null,
    };
}

function getEffectiveRoundRobinMax(settings: Pick<QueueSettings, "roundRobinMaxNumber">): number {
    return Math.max(settings.roundRobinMaxNumber || 1, 1);
}

export async function getQueueSettingsForQueueName(
    orgId: string,
    queueName: string,
): Promise<QueueSettings | null> {
    const config = await WebAppConfigModel.findOne({
        orgId: new Types.ObjectId(orgId),
        appId: "queue",
        "settings.queueName": normalizeQueueName(queueName),
        "settings.mode": { $in: ["display", "queue", "remote", "waiting-list"] },
    })
        .sort({ updatedAt: -1 })
        .lean();

    return (config?.settings as QueueSettings | undefined) ?? null;
}

export async function getQueueDataByName(
    orgId: string,
    queueName: string,
): Promise<IWebAppQueueData | null> {
    await connectDB();

    const queueData = await WebAppQueueDataModel.findOne({
        orgId: new Types.ObjectId(orgId),
        queueName: normalizeQueueName(queueName),
    }).lean();

    return (queueData as IWebAppQueueData | null) ?? null;
}

export async function getQueueDatasetById(orgId: string, datasetId: string) {
    if (!Types.ObjectId.isValid(datasetId)) return null;

    await connectDB();
    return WebAppDatasetModel.findOne({
        _id: new Types.ObjectId(datasetId),
        orgId: new Types.ObjectId(orgId),
        appId: "queue",
    }).lean();
}

export async function getQueueDataByDatasetId(orgId: string, datasetId: string): Promise<IWebAppQueueData | null> {
    if (!Types.ObjectId.isValid(datasetId)) return null;

    await connectDB();
    return WebAppQueueDataModel.findOne({
        orgId: new Types.ObjectId(orgId),
        datasetId: new Types.ObjectId(datasetId),
    }).lean() as Promise<IWebAppQueueData | null>;
}

export async function listQueueCatalogForOrg(orgId: string) {
    await connectDB();

    const rows = await WebAppQueueDataModel.find({
        orgId: new Types.ObjectId(orgId),
    })
        .sort({ queueName: 1 })
        .lean();

    return Promise.all(
        rows.map(async (row) => {
            const settings = await getQueueSettingsForQueueName(orgId, row.queueName);
            return {
                queueName: row.queueName,
                queueType: row.queueType,
                prefix: row.prefix ?? settings?.prefix ?? "",
                serviceMode: settings?.serviceMode ?? "reservation",
                bookingEnabled: settings?.bookingEnabled ?? true,
                roundRobinMaxNumber: settings?.roundRobinMaxNumber ?? 99,
                currentServing: row.currentServing,
                waitingCount: row.waitingQueue.length,
            };
        }),
    );
}

async function getQueueSettingsForInstance(
    orgId: string,
    instanceId: string,
): Promise<QueueSettings> {
    const inst = await WebAppInstanceModel.findOne({
        _id: new Types.ObjectId(instanceId),
        orgId: new Types.ObjectId(orgId),
    }).lean();

    if (!inst) throw new Error("Instance not found");

    const cfg = await WebAppConfigModel.findById(inst.configId).lean();
    if (!cfg) throw new Error("Queue config not found");

    return cfg.settings as QueueSettings;
}

// ─── Queue Data Bootstrapping ────────────────────────────────────────────────

/**
 * Finds or creates the shared queue data document for (orgId, datasetId).
 * Each dataset has its own queue state document.
 */
export async function getOrCreateQueueData(
    orgId: string,
    settings: { datasetId: Types.ObjectId; queueName: string; queueType: string; prefix?: string },
): Promise<IWebAppQueueData> {
    await connectDB();

    const existing = await WebAppQueueDataModel.findOne({
        orgId: new Types.ObjectId(orgId),
        datasetId: settings.datasetId,
    }).lean();

    if (existing) return existing as IWebAppQueueData;

    const created = await WebAppQueueDataModel.create({
        orgId: new Types.ObjectId(orgId),
        datasetId: settings.datasetId,
        queueName: normalizeQueueName(settings.queueName),
        queueType: settings.queueType,
        prefix: settings.prefix,
        currentServing: null,
        currentServingSeq: null,
        currentServingIssuedAt: null,
        currentSource: null,
        nextSeq: 1,
        waitingQueue: [],
        history: [],
        displayMessage: null,
        displayAccentColor: null,
        lastUpdatedAt: new Date(),
        lastUpdatedBy: "",
    });

    return created as unknown as IWebAppQueueData;
}

// ─── Instance Creation ───────────────────────────────────────────────────────

export async function createQueueConnector(
    input: CreateQueueConnectorInput,
): Promise<QueueAggregate> {
    await connectDB();

    const orgObjectId = new Types.ObjectId(input.orgId);
    const publicToken = randomUUID();
    const durationMs = input.defaultDurationMs ?? 30_000;

    // 1. Config
    const config = await WebAppConfigModel.create({
        orgId: orgObjectId,
        appId: "queue",
        schemaVersion: 1,
        settings: input.settings,
    });

    // 2. State
    const state = await WebAppStateModel.create({
        orgId: orgObjectId,
        instanceId: new Types.ObjectId(), // placeholder, updated below
        health: "healthy",
        lastSyncAt: new Date(),
    });

    // 3. Instance
    const instance = await WebAppInstanceModel.create({
        orgId: orgObjectId,
        appId: "queue",
        name: input.name,
        status: "active",
        version: "v0.1.0",
        configId: config._id,
        stateId: state._id,
        publicToken,
        createdBy: input.userId,
        updatedBy: input.userId,
    });

    // 4. Update state with real instanceId
    await WebAppStateModel.findByIdAndUpdate(state._id, {
        instanceId: instance._id,
    });

    // 5. Auto-create Content record so instance can be assigned to a playlist
    const playerUrl = `/webapps/queue/${String(instance._id)}?token=${publicToken}&mode=${input.settings.mode}`;
    const contentService = new ContentService(input.orgId);
    const contentEntry = await contentService.createContent({
        name: `[Queue] ${input.name}`,
        type: "url",
        folder: "/connectors/queue",
        tags: ["webapp", "connector", "queue"],
        internalWebappAsset: true,
        defaultDurationMs: durationMs,
        config: { url: playerUrl, urlSubtype: "webpage" },
    });

    if (contentEntry) {
        await WebAppInstanceModel.findByIdAndUpdate(instance._id, {
            contentId: new Types.ObjectId(String(contentEntry._id)),
        });
    }

    // 6. Ensure queue data document exists (one per dataset)
    let queueData = null;
    if (getEffectiveQueueMode(input.settings.mode) !== "kiosk") {
        const dataset = await WebAppDatasetModel.findOne({
            _id: new Types.ObjectId(input.settings.datasetId),
            orgId: orgObjectId,
            appId: "queue",
        }).lean();
        const datasetCfg = (dataset?.config ?? {}) as Record<string, unknown>;
        const queueName = typeof datasetCfg.queueName === "string" ? datasetCfg.queueName : input.settings.datasetId;
        queueData = await getOrCreateQueueData(input.orgId, {
            datasetId: new Types.ObjectId(input.settings.datasetId),
            queueName,
            queueType: input.settings.queueType,
            prefix: input.settings.prefix,
        });
    }

    const finalInstance = await WebAppInstanceModel.findById(instance._id).lean();

    return {
        instance: finalInstance as IWebAppInstance,
        config: input.settings,
        state: (await WebAppStateModel.findById(state._id).lean()) as IWebAppState,
        queueData,
    };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getQueueAggregateForPublicAccess(
    instanceId: string,
    token: string,
): Promise<QueueAggregate | null> {
    await connectDB();

    const instance = await WebAppInstanceModel.findOne({
        _id: new Types.ObjectId(instanceId),
        publicToken: token,
        status: "active",
    }).lean();

    if (!instance) return null;

    const config = await WebAppConfigModel.findById(instance.configId).lean();
    const state = await WebAppStateModel.findById(instance.stateId).lean();

    if (!config || !state) return null;

    const settings = config.settings as QueueSettings;
    const queueData = getEffectiveQueueMode(settings.mode) === "kiosk"
        ? null
        : await WebAppQueueDataModel.findOne({
            orgId: instance.orgId,
            datasetId: new Types.ObjectId(settings.datasetId),
        }).lean();

    if (getEffectiveQueueMode(settings.mode) !== "kiosk" && !queueData) return null;

    return {
        instance: instance as IWebAppInstance,
        config: settings,
        state: state as IWebAppState,
        queueData: queueData as IWebAppQueueData,
    };
}

// ─── Queue Operations ────────────────────────────────────────────────────────

/** Issue a new number and add it to the waiting queue. */
export async function issueNextNumber(
    orgId: string,
    queueName: string,
    instanceId: string,
): Promise<string> {
    await connectDB();

    const queue = await WebAppQueueDataModel.findOne({
        orgId: new Types.ObjectId(orgId),
        queueName: normalizeQueueName(queueName),
    });

    if (!queue) throw new Error("Queue not found");

    const queueSettings = await getQueueSettingsForInstance(orgId, instanceId);

    if (!queueSettings.bookingEnabled) {
        throw new Error("Prenotazione disabilitata per questa coda");
    }

    if (queueSettings.maxWaiting > 0 && queue.waitingQueue.length >= queueSettings.maxWaiting) {
        throw new Error("Limite massimo di numeri in attesa raggiunto");
    }

    const seq = queueSettings.serviceMode === "round-robin"
        ? getNextRoundRobinTicketSeq(
            [
                ...(queue.waitingQueue as Array<{ seq: number }>).map((entry) => entry.seq),
                ...(queue.currentSource === "queue" && queue.currentServingSeq ? [queue.currentServingSeq] : []),
            ],
            queue.nextSeq,
            getEffectiveRoundRobinMax(queueSettings),
        )
        : queue.nextSeq;

    if (seq === null) {
        throw new Error("Tutti i numeri disponibili sono gia' prenotati");
    }

    const displayNumber = buildDisplayNumber(seq, queueSettings);

    await WebAppQueueDataModel.findByIdAndUpdate(queue._id, {
        $push: { waitingQueue: { seq, displayNumber, issuedAt: new Date() } },
        nextSeq: queueSettings.serviceMode === "round-robin"
            ? getNextRoundRobinCounter(seq, getEffectiveRoundRobinMax(queueSettings))
            : queue.nextSeq + 1,
        lastUpdatedAt: new Date(),
        lastUpdatedBy: instanceId,
    });

    return displayNumber;
}

export interface IssuedTicketPayload {
    queueName: string;
    displayNumber: string;
    issuedAt: string;
    kioskInstanceId?: string;
    printablePayloadVersion: number;
}

export function buildIssuedTicketPayload(input: {
    queueName: string;
    displayNumber: string;
    issuedAt?: Date;
    kioskInstanceId?: string;
}): IssuedTicketPayload {
    const issuedAt = input.issuedAt ?? new Date();

    return {
        queueName: normalizeQueueName(input.queueName),
        displayNumber: input.displayNumber,
        issuedAt: issuedAt.toISOString(),
        kioskInstanceId: input.kioskInstanceId,
        printablePayloadVersion: 1,
    };
}

/** Advance to the next waiting number (calls next in FIFO queue). */
export async function advanceQueue(
    orgId: string,
    queueName: string,
    instanceId: string,
): Promise<string | null> {
    await connectDB();

    const queue = await WebAppQueueDataModel.findOne({
        orgId: new Types.ObjectId(orgId),
        queueName: normalizeQueueName(queueName),
    });

    if (!queue) throw new Error("Queue not found");

    const settings = await getQueueSettingsForInstance(orgId, instanceId);
    const current = queue.currentServing;
    const waiting = queue.waitingQueue as Array<{ seq: number; displayNumber: string; issuedAt: Date }>;

    const historyEntry = current ? buildHistoryEntry(queue) : null;

    if (settings.serviceMode === "round-robin") {
        const nextSeq = getNextRoundRobinCounter(queue.currentServingSeq, getEffectiveRoundRobinMax(settings));
        const matchedWaiting = waiting.find((entry) => entry.seq === nextSeq) ?? null;

        await WebAppQueueDataModel.findByIdAndUpdate(queue._id, {
            currentServing: buildDisplayNumber(nextSeq, settings),
            currentServingSeq: nextSeq,
            currentServingIssuedAt: matchedWaiting?.issuedAt ?? null,
            currentSource: matchedWaiting ? "queue" : "round-robin",
            ...(matchedWaiting ? { $pull: { waitingQueue: { seq: matchedWaiting.seq } } } : {}),
            ...(historyEntry ? { $push: { history: historyEntry } } : {}),
            lastUpdatedAt: new Date(),
            lastUpdatedBy: instanceId,
        });

        return buildDisplayNumber(nextSeq, settings);
    }

    // Promote first waiting to serving
    const next = waiting.length > 0 ? waiting[0] : null;

    await WebAppQueueDataModel.findByIdAndUpdate(queue._id, {
        currentServing: next ? next.displayNumber : null,
        currentServingSeq: next ? next.seq : null,
        currentServingIssuedAt: next ? next.issuedAt : null,
        currentSource: next ? "queue" : null,
        ...(next ? { $pull: { waitingQueue: { seq: next.seq } } } : {}),
        ...(historyEntry ? { $push: { history: historyEntry } } : {}),
        lastUpdatedAt: new Date(),
        lastUpdatedBy: instanceId,
    });

    return next ? next.displayNumber : null;
}

/** Retreat: re-serve the last completed number (undo advance). */
export async function retreatQueue(
    orgId: string,
    queueName: string,
    instanceId: string,
): Promise<string | null> {
    await connectDB();

    const queue = await WebAppQueueDataModel.findOne({
        orgId: new Types.ObjectId(orgId),
        queueName: normalizeQueueName(queueName),
    });

    if (!queue) throw new Error("Queue not found");

    const history = queue.history as Array<{ displayNumber: string; calledAt: Date }>;
    if (history.length === 0) return queue.currentServing;

    const previous = history[history.length - 1] as {
        displayNumber: string;
        calledAt: Date;
        seq?: number | null;
        issuedAt?: Date | null;
        source?: "queue" | "manual" | "round-robin" | null;
    };

    const currentWaiting = queue.waitingQueue as Array<{ seq: number; displayNumber: string; issuedAt: Date }>;
    const waitingQueue =
        queue.currentServing && queue.currentSource === "queue" && queue.currentServingSeq !== null
            ? [
                {
                    seq: queue.currentServingSeq,
                    displayNumber: queue.currentServing,
                    issuedAt: queue.currentServingIssuedAt ?? new Date(),
                },
                ...currentWaiting,
            ]
            : currentWaiting;

    await WebAppQueueDataModel.findByIdAndUpdate(queue._id, {
        currentServing: previous.displayNumber,
        currentServingSeq: previous.seq ?? null,
        currentServingIssuedAt: previous.issuedAt ?? null,
        currentSource:
            previous.source ?? (previous.seq !== null && previous.seq !== undefined ? "queue" : "manual"),
        waitingQueue,
        $pop: { history: 1 }, // remove last
        lastUpdatedAt: new Date(),
        lastUpdatedBy: instanceId,
    });

    return previous.displayNumber;
}

/** Manually set a specific display number as currently serving. */
export async function setCustomNumber(
    orgId: string,
    queueName: string,
    instanceId: string,
    displayNumber: string,
): Promise<void> {
    await connectDB();

    const queue = await WebAppQueueDataModel.findOne({
        orgId: new Types.ObjectId(orgId),
        queueName: normalizeQueueName(queueName),
    });

    if (!queue) throw new Error("Queue not found");

    const settings = await getQueueSettingsForInstance(orgId, instanceId);
    const parsedSeq = parseDisplayNumber(displayNumber, settings);

    if (
        settings.serviceMode === "round-robin" &&
        parsedSeq !== null &&
        parsedSeq > getEffectiveRoundRobinMax(settings)
    ) {
        throw new Error("Numero fuori dal range del round-robin");
    }

    const normalizedDisplay =
        parsedSeq !== null ? buildDisplayNumber(parsedSeq, settings) : displayNumber.trim().toUpperCase();
    const waitingQueue = queue.waitingQueue as Array<{ seq: number; displayNumber: string; issuedAt: Date }>;
    const matchedWaiting = waitingQueue.find(
        (entry) => entry.displayNumber === normalizedDisplay || (parsedSeq !== null && entry.seq === parsedSeq),
    );
    const nextWaitingQueue = matchedWaiting
        ? waitingQueue.filter((entry) => entry.seq !== matchedWaiting.seq)
        : waitingQueue;
    const historyEntry = buildHistoryEntry(queue);

    await WebAppQueueDataModel.findByIdAndUpdate(queue._id, {
        currentServing: normalizedDisplay,
        currentServingSeq: matchedWaiting?.seq ?? parsedSeq ?? null,
        currentServingIssuedAt: matchedWaiting?.issuedAt ?? null,
        currentSource: matchedWaiting ? "queue" : parsedSeq !== null && settings.serviceMode === "round-robin" ? "round-robin" : "manual",
        waitingQueue: nextWaitingQueue,
        nextSeq: parsedSeq !== null
            ? settings.serviceMode === "round-robin"
                ? queue.nextSeq
                : Math.max(queue.nextSeq, parsedSeq + 1)
            : queue.nextSeq,
        ...(historyEntry ? { $push: { history: historyEntry } } : {}),
        lastUpdatedAt: new Date(),
        lastUpdatedBy: instanceId,
    });
}

export async function updateQueueDisplayOptions(
    orgId: string,
    queueName: string,
    instanceId: string,
    input: { message?: string | null; accentColor?: string | null },
): Promise<void> {
    await connectDB();

    const update: Record<string, unknown> = {
        lastUpdatedAt: new Date(),
        lastUpdatedBy: instanceId,
    };

    if (input.message !== undefined) {
        const normalizedMessage = input.message?.trim() ?? "";
        update.displayMessage = normalizedMessage.length > 0 ? normalizedMessage : null;
    }

    if (input.accentColor !== undefined) {
        update.displayAccentColor = input.accentColor ?? null;
    }

    const result = await WebAppQueueDataModel.updateOne(
        {
            orgId: new Types.ObjectId(orgId),
            queueName: normalizeQueueName(queueName),
        },
        update,
    );

    if (result.matchedCount === 0) throw new Error("Queue not found");
}

/** Reset a queue: clear currentServing, waitingQueue, and optionally history. */
export async function resetQueue(
    orgId: string,
    queueName: string,
    instanceId: string,
    keepHistory = false,
): Promise<void> {
    await connectDB();

    const update: Record<string, unknown> = {
        currentServing: null,
        currentServingSeq: null,
        currentServingIssuedAt: null,
        currentSource: null,
        waitingQueue: [],
        nextSeq: 1,
        displayMessage: null,
        displayAccentColor: null,
        lastUpdatedAt: new Date(),
        lastUpdatedBy: instanceId,
    };

    if (!keepHistory) update.history = [];

    const result = await WebAppQueueDataModel.updateOne(
        {
            orgId: new Types.ObjectId(orgId),
            queueName: normalizeQueueName(queueName),
        },
        update,
    );

    if (result.matchedCount === 0) throw new Error("Queue not found");
}

/** Get current queue snapshot for display purposes. */
export async function getQueueState(
    orgId: string,
    queueName: string,
): Promise<IWebAppQueueData | null> {
    return getQueueDataByName(orgId, queueName);
}
