import { randomUUID } from "node:crypto";

import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import {
    WebAppConfigModel,
    type QueuePlusSettings,
} from "@/lib/db/models/WebAppConfig";
import { WebAppDatasetModel } from "@/lib/db/models/WebAppDataset";
import { WebAppInstanceModel, type IWebAppInstance } from "@/lib/db/models/WebAppInstance";
import { WebAppStateModel, type IWebAppState } from "@/lib/db/models/WebAppState";
import {
    WebAppQueuePlusDataModel,
    type IWebAppQueuePlusData,
} from "@/lib/db/models/webapp-queue-plus/WebAppQueuePlusData";
import { ContentService } from "@/lib/services/content.service";

export interface QueuePlusAggregate {
    instance: IWebAppInstance;
    config: QueuePlusSettings;
    state: IWebAppState;
    queueData: IWebAppQueuePlusData | null;
}

export interface CreateQueuePlusConnectorInput {
    orgId: string;
    userId: string;
    name: string;
    settings: QueuePlusSettings;
    defaultDurationMs?: number;
}

interface QueuePlusDatasetConfig {
    queueName: string;
    queueType: QueuePlusSettings["queueType"];
    prefix?: string;
    maxWaiting: number;
    bookingEnabled: boolean;
    serviceMode: QueuePlusSettings["serviceMode"];
    roundRobinMaxNumber: number;
    audio?: QueuePlusSettings["audio"];
}

export function normalizeQueuePlusName(value: string): string {
    return value.trim().toLowerCase();
}

export function buildQueuePlusDisplayNumber(seq: number, settings: Pick<QueuePlusSettings, "queueType" | "prefix">): string {
    if (settings.queueType === "alpha") {
        const prefix = (settings.prefix || "A").toUpperCase();
        return `${prefix}${String(seq).padStart(3, "0")}`;
    }

    return String(seq);
}

export function parseQueuePlusDisplayNumber(
    displayNumber: string,
    settings: Pick<QueuePlusSettings, "queueType" | "prefix">,
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

function sanitizeAudioConfig(audio: Record<string, unknown> | undefined): QueuePlusSettings["audio"] {
    const languages = Array.isArray(audio?.languages)
        ? Array.from(new Set(audio.languages.map((entry) => String(entry).trim()).filter(Boolean)))
        : ["it-IT"];

    return {
        enabled: audio?.enabled !== false,
        speechMode: audio?.speechMode === "number" || audio?.speechMode === "message" || audio?.speechMode === "both"
            ? audio.speechMode
            : "number",
        languages,
        preChime: audio?.preChime === true,
        postChime: audio?.postChime === true,
    };
}

function parseQueuePlusDatasetConfig(config: Record<string, unknown> | undefined): QueuePlusDatasetConfig | null {
    if (!config || typeof config !== "object") return null;

    const queueName = typeof config.queueName === "string" ? normalizeQueuePlusName(config.queueName) : "";
    if (!queueName) return null;

    return {
        queueName,
        queueType: config.queueType === "alpha" ? "alpha" : "numeric",
        prefix: typeof config.prefix === "string" ? config.prefix : "",
        maxWaiting: typeof config.maxWaiting === "number" ? Math.max(1, Math.floor(config.maxWaiting)) : 99,
        bookingEnabled: typeof config.bookingEnabled === "boolean" ? config.bookingEnabled : true,
        serviceMode: config.serviceMode === "round-robin" || config.serviceMode === "multigate" ? config.serviceMode : "reservation",
        roundRobinMaxNumber: typeof config.roundRobinMaxNumber === "number" ? Math.max(1, Math.floor(config.roundRobinMaxNumber)) : 99,
        audio: sanitizeAudioConfig((config.audio ?? undefined) as Record<string, unknown> | undefined),
    };
}

function normalizeObjectIdList(list?: string[]): string[] {
    if (!Array.isArray(list)) return [];

    return Array.from(new Set(list.filter((entry) => Types.ObjectId.isValid(entry)).map((entry) => String(entry))));
}

export function getEffectiveQueuePlusMode(mode: QueuePlusSettings["mode"]): Exclude<QueuePlusSettings["mode"], "display"> | "queue" {
    return mode === "display" ? "queue" : mode;
}

function getAllowedDatasetIds(settings: QueuePlusSettings): string[] {
    return Array.from(new Set(
        (settings.allowedDatasetIds ?? [])
            .filter((entry) => typeof entry === "string" && Types.ObjectId.isValid(entry)),
    ));
}

function getEffectiveRoundRobinMax(settings: Pick<QueuePlusSettings, "roundRobinMaxNumber">): number {
    return Math.max(settings.roundRobinMaxNumber || 1, 1);
}

export function getNextQueuePlusRoundRobinCounter(currentSeq: number | null | undefined, maxNumber: number): number {
    if (!Number.isFinite(maxNumber) || maxNumber < 1) return 1;
    if (!currentSeq || currentSeq < 1) return 1;
    return currentSeq >= maxNumber ? 1 : currentSeq + 1;
}

function getNextRoundRobinTicketSeq(occupiedSeqs: number[], startSeq: number, maxNumber: number): number | null {
    if (!Number.isFinite(maxNumber) || maxNumber < 1) return null;

    const occupied = new Set(occupiedSeqs.filter((seq) => seq >= 1 && seq <= maxNumber));
    for (let offset = 0; offset < maxNumber; offset += 1) {
        const candidate = ((Math.max(startSeq, 1) - 1 + offset) % maxNumber) + 1;
        if (!occupied.has(candidate)) return candidate;
    }

    return null;
}

function buildHistoryEntry(queue: IWebAppQueuePlusData) {
    if (!queue.currentServing) return null;

    return {
        displayNumber: queue.currentServing,
        calledAt: new Date(),
        seq: queue.currentServingSeq ?? null,
        issuedAt: queue.currentServingIssuedAt ?? null,
        source: queue.currentSource ?? null,
    };
}

export async function getQueuePlusDatasetById(orgId: string, datasetId: string) {
    if (!Types.ObjectId.isValid(datasetId)) return null;

    await connectDB();
    return WebAppDatasetModel.findOne({
        _id: new Types.ObjectId(datasetId),
        orgId: new Types.ObjectId(orgId),
        appId: "queue-plus",
    }).lean();
}

export async function ensureQueuePlusDatasetByName(input: {
    orgId: string;
    userId: string;
    queueName: string;
    queueType: QueuePlusSettings["queueType"];
    prefix?: string;
    maxWaiting: number;
    bookingEnabled: boolean;
    serviceMode: QueuePlusSettings["serviceMode"];
    roundRobinMaxNumber: number;
    audio?: QueuePlusSettings["audio"];
}): Promise<string> {
    await connectDB();

    const queueName = normalizeQueuePlusName(input.queueName);
    const slug = `queue-plus-${queueName}`;

    const existing = await WebAppDatasetModel.findOne({
        orgId: new Types.ObjectId(input.orgId),
        appId: "queue-plus",
        slug,
    }).lean();

    if (existing) return String(existing._id);

    const created = await WebAppDatasetModel.create({
        orgId: new Types.ObjectId(input.orgId),
        appId: "queue-plus",
        name: queueName,
        slug,
        status: "active",
        schemaVersion: 1,
        datasetKind: "queue-plus-shared-state",
        editorMode: "raw-json",
        storageMode: "app-collection",
        config: {
            queueName,
            queueType: input.queueType,
            prefix: input.prefix ?? "",
            maxWaiting: input.maxWaiting,
            bookingEnabled: input.bookingEnabled,
            serviceMode: input.serviceMode,
            roundRobinMaxNumber: input.roundRobinMaxNumber,
            audio: sanitizeAudioConfig(input.audio as Record<string, unknown> | undefined),
        },
        summary: {},
        tags: ["queue-plus", "sandbox-sdk"],
        createdBy: input.userId,
        updatedBy: input.userId,
    });

    return String(created._id);
}

export async function getQueuePlusDataByDatasetId(orgId: string, datasetId: string): Promise<IWebAppQueuePlusData | null> {
    if (!Types.ObjectId.isValid(datasetId)) return null;

    await connectDB();
    return WebAppQueuePlusDataModel.findOne({
        orgId: new Types.ObjectId(orgId),
        datasetId: new Types.ObjectId(datasetId),
    }).lean() as Promise<IWebAppQueuePlusData | null>;
}

export async function listQueuePlusCatalogForOrg(orgId: string) {
    await connectDB();

    const orgObjectId = new Types.ObjectId(orgId);

    // Load SDK dataset definitions
    const datasets = await WebAppDatasetModel.find({
        orgId: orgObjectId,
        appId: "queue-plus",
        status: "active",
    })
        .sort({ name: 1 })
        .lean();

    // Load runtime state for all datasets
    const runtimes = await WebAppQueuePlusDataModel.find({ orgId: orgObjectId })
        .lean();
    const runtimeByDatasetId = new Map(
        runtimes.map((rt) => [String(rt.datasetId), rt]),
    );

    // Merge: SDK dataset + runtime state
    return datasets.map((dataset) => {
        const config = parseQueuePlusDatasetConfig(dataset.config as Record<string, unknown>);
        const runtime = runtimeByDatasetId.get(String(dataset._id));

        return {
            datasetId: String(dataset._id),
            queueName: config?.queueName ?? dataset.name,
            queueType: config?.queueType ?? "numeric",
            prefix: config?.prefix ?? "",
            currentServing: runtime?.currentServing ?? null,
            waitingCount: runtime?.waitingQueue.length ?? 0,
        };
    });
}

export async function getOrCreateQueuePlusData(
    orgId: string,
    input: { datasetId: string; queueName: string; queueType: QueuePlusSettings["queueType"]; prefix?: string },
): Promise<IWebAppQueuePlusData> {
    await connectDB();

    if (!Types.ObjectId.isValid(input.datasetId)) throw new Error("Invalid queue-plus datasetId");

    const existing = await WebAppQueuePlusDataModel.findOne({
        orgId: new Types.ObjectId(orgId),
        datasetId: new Types.ObjectId(input.datasetId),
    }).lean();
    if (existing) return existing as IWebAppQueuePlusData;

    const created = await WebAppQueuePlusDataModel.create({
        orgId: new Types.ObjectId(orgId),
        datasetId: new Types.ObjectId(input.datasetId),
        queueName: normalizeQueuePlusName(input.queueName),
        queueType: input.queueType,
        prefix: input.prefix,
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
    }).catch(async (error) => {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("E11000")) throw error;
        const concurrent = await WebAppQueuePlusDataModel.findOne({
            orgId: new Types.ObjectId(orgId),
            datasetId: new Types.ObjectId(input.datasetId),
        }).lean();
        if (concurrent) return concurrent;
        throw error;
    });

    return created as unknown as IWebAppQueuePlusData;
}

export async function createQueuePlusConnector(input: CreateQueuePlusConnectorInput): Promise<QueuePlusAggregate> {
    await connectDB();

    const dataset = await getQueuePlusDatasetById(input.orgId, input.settings.datasetId);
    if (!dataset) throw new Error("QueuePLUS dataset not found");

    const datasetConfig = parseQueuePlusDatasetConfig(dataset.config as Record<string, unknown>);
    if (!datasetConfig) throw new Error("QueuePLUS dataset config is invalid");

    const normalizedSettings: QueuePlusSettings = {
        ...input.settings,
        queueType: datasetConfig.queueType,
        prefix: datasetConfig.prefix,
        maxWaiting: datasetConfig.maxWaiting,
        bookingEnabled: datasetConfig.bookingEnabled,
        serviceMode: datasetConfig.serviceMode,
        roundRobinMaxNumber: datasetConfig.roundRobinMaxNumber,
        waitingListLayout: input.settings.waitingListLayout === "grid" ? "grid" : "list",
        waitingListMergeMode: input.settings.waitingListMergeMode === "merged-by-timestamp" ? "merged-by-timestamp" : "split",
        kioskDatasetIds: normalizeObjectIdList(input.settings.kioskDatasetIds),
        waitingListDatasetIds: normalizeObjectIdList(input.settings.waitingListDatasetIds),
        allowedDatasetIds: normalizeObjectIdList(input.settings.allowedDatasetIds),
        allowedDisplayIds: Array.isArray(input.settings.allowedDisplayIds)
            ? Array.from(new Set(input.settings.allowedDisplayIds.map((entry) => String(entry).trim()).filter(Boolean)))
            : [],
        audio: sanitizeAudioConfig(input.settings.audio as Record<string, unknown> | undefined),
        displayBindingMode: input.settings.displayBindingMode === "remote-controlled" ? "remote-controlled" : "follow-queue",
        ticketDeliveryMode: input.settings.ticketDeliveryMode === "qr" || input.settings.ticketDeliveryMode === "both"
            ? input.settings.ticketDeliveryMode
            : "print",
        enableDigitalTicket: input.settings.enableDigitalTicket === true,
    };

    const orgObjectId = new Types.ObjectId(input.orgId);
    const publicToken = randomUUID();
    const durationMs = input.defaultDurationMs ?? 30_000;

    const config = await WebAppConfigModel.create({
        orgId: orgObjectId,
        appId: "queue-plus",
        schemaVersion: 1,
        settings: normalizedSettings,
    });

    const state = await WebAppStateModel.create({
        orgId: orgObjectId,
        instanceId: new Types.ObjectId(),
        health: "healthy",
        lastSyncAt: new Date(),
    });

    const instance = await WebAppInstanceModel.create({
        orgId: orgObjectId,
        appId: "queue-plus",
        name: input.name,
        status: "active",
        version: "v0.1.0",
        configId: config._id,
        stateId: state._id,
        publicToken,
        createdBy: input.userId,
        updatedBy: input.userId,
    });

    await WebAppStateModel.findByIdAndUpdate(state._id, { instanceId: instance._id });

    const playerUrl = `/webapps/queue-plus/${String(instance._id)}?token=${publicToken}&mode=${normalizedSettings.mode}`;
    const contentService = new ContentService(input.orgId);
    const contentEntry = await contentService.createContent({
        name: `[QueuePLUS] ${input.name}`,
        type: "url",
        folder: "/connectors/queue-plus",
        tags: ["webapp", "connector", "queue-plus", "sandbox-sdk"],
        internalWebappAsset: true,
        defaultDurationMs: durationMs,
        config: { url: playerUrl, urlSubtype: "webpage" },
    });

    if (contentEntry) {
        await WebAppInstanceModel.findByIdAndUpdate(instance._id, {
            contentId: new Types.ObjectId(String(contentEntry._id)),
        });
        instance.contentId = new Types.ObjectId(String(contentEntry._id));
    }

    const queueData = getEffectiveQueuePlusMode(normalizedSettings.mode) === "kiosk"
        ? null
        : await getOrCreateQueuePlusData(input.orgId, {
            datasetId: normalizedSettings.datasetId,
            queueName: datasetConfig.queueName,
            queueType: datasetConfig.queueType,
            prefix: datasetConfig.prefix,
        });

    return {
        instance: instance.toObject() as IWebAppInstance,
        config: normalizedSettings,
        state: (await WebAppStateModel.findById(state._id).lean()) as IWebAppState,
        queueData,
    };
}

export async function getQueuePlusAggregateForPublicAccess(instanceId: string, token: string): Promise<QueuePlusAggregate | null> {
    await connectDB();

    if (!Types.ObjectId.isValid(instanceId)) return null;

    const instance = await WebAppInstanceModel.findOne({
        _id: new Types.ObjectId(instanceId),
        status: "active",
        appId: "queue-plus",
    }).lean();

    if (!instance || String(instance.publicToken).trim() !== String(token).trim()) return null;

    const config = await WebAppConfigModel.findById(instance.configId).lean();
    const state = await WebAppStateModel.findById(instance.stateId).lean();
    if (!config || !state) return null;

    const settings = config.settings as QueuePlusSettings;
    let queueData = getEffectiveQueuePlusMode(settings.mode) === "kiosk"
        ? null
        : await getQueuePlusDataByDatasetId(String(instance.orgId), settings.datasetId);

    if (getEffectiveQueuePlusMode(settings.mode) !== "kiosk" && !queueData) {
        const dataset = await getQueuePlusDatasetById(String(instance.orgId), settings.datasetId);
        const datasetConfig = parseQueuePlusDatasetConfig(dataset?.config as Record<string, unknown> | undefined);
        if (!datasetConfig) return null;
        queueData = await getOrCreateQueuePlusData(String(instance.orgId), {
            datasetId: settings.datasetId,
            queueName: datasetConfig.queueName,
            queueType: datasetConfig.queueType,
            prefix: datasetConfig.prefix,
        });
    }

    return {
        instance: instance as IWebAppInstance,
        config: settings,
        state: state as IWebAppState,
        queueData: queueData as IWebAppQueuePlusData | null,
    };
}

async function getQueuePlusSettingsForInstance(orgId: string, instanceId: string): Promise<QueuePlusSettings> {
    const inst = await WebAppInstanceModel.findOne({
        _id: new Types.ObjectId(instanceId),
        orgId: new Types.ObjectId(orgId),
        appId: "queue-plus",
    }).lean();
    if (!inst) throw new Error("Instance not found");

    const cfg = await WebAppConfigModel.findById(inst.configId).lean();
    if (!cfg) throw new Error("QueuePLUS config not found");

    return cfg.settings as QueuePlusSettings;
}

async function resolveQueuePlusDatasetContext(orgId: string, instanceId: string, requestedDatasetId?: string) {
    const settings = await getQueuePlusSettingsForInstance(orgId, instanceId);
    let allowedDatasetIds = getAllowedDatasetIds(settings);

    if (allowedDatasetIds.length === 0) {
        const catalog = await listQueuePlusCatalogForOrg(orgId);
        allowedDatasetIds = catalog.map((entry) => entry.datasetId);
    }

    if (allowedDatasetIds.length === 0 && Types.ObjectId.isValid(settings.datasetId)) {
        allowedDatasetIds = [settings.datasetId];
    }

    const datasetId = requestedDatasetId && allowedDatasetIds.includes(requestedDatasetId)
        ? requestedDatasetId
        : (allowedDatasetIds.includes(settings.datasetId) ? settings.datasetId : allowedDatasetIds[0] ?? settings.datasetId);

    return { settings, datasetId, allowedDatasetIds };
}

export async function issueNextQueuePlusNumber(orgId: string, datasetId: string, instanceId: string): Promise<string> {
    await connectDB();

    const queue = await WebAppQueuePlusDataModel.findOne({
        orgId: new Types.ObjectId(orgId),
        datasetId: new Types.ObjectId(datasetId),
    });
    if (!queue) throw new Error("QueuePLUS runtime not found");

    const settings = await getQueuePlusSettingsForInstance(orgId, instanceId);
    if (!settings.bookingEnabled) throw new Error("Prenotazione disabilitata");
    if (settings.maxWaiting > 0 && queue.waitingQueue.length >= settings.maxWaiting) {
        throw new Error("Limite massimo di numeri in attesa raggiunto");
    }

    const roundRobinEnabled = settings.serviceMode === "round-robin" || settings.serviceMode === "multigate";
    const seq = roundRobinEnabled
        ? getNextRoundRobinTicketSeq(
            [
                ...(queue.waitingQueue as Array<{ seq: number }>).map((entry) => entry.seq),
                ...(queue.currentSource === "queue" && queue.currentServingSeq ? [queue.currentServingSeq] : []),
            ],
            queue.nextSeq,
            getEffectiveRoundRobinMax(settings),
        )
        : queue.nextSeq;

    if (seq === null) throw new Error("Tutti i numeri disponibili sono gia' prenotati");

    const displayNumber = buildQueuePlusDisplayNumber(seq, settings);

    await WebAppQueuePlusDataModel.findByIdAndUpdate(queue._id, {
        $push: { waitingQueue: { seq, displayNumber, issuedAt: new Date() } },
        nextSeq: roundRobinEnabled
            ? getNextQueuePlusRoundRobinCounter(seq, getEffectiveRoundRobinMax(settings))
            : queue.nextSeq + 1,
        lastUpdatedAt: new Date(),
        lastUpdatedBy: instanceId,
    });

    return displayNumber;
}

export async function advanceQueuePlus(orgId: string, datasetId: string, instanceId: string): Promise<string | null> {
    await connectDB();

    const queue = await WebAppQueuePlusDataModel.findOne({
        orgId: new Types.ObjectId(orgId),
        datasetId: new Types.ObjectId(datasetId),
    });
    if (!queue) throw new Error("QueuePLUS runtime not found");

    const settings = await getQueuePlusSettingsForInstance(orgId, instanceId);
    const waiting = queue.waitingQueue as Array<{ seq: number; displayNumber: string; issuedAt: Date }>;
    const historyEntry = queue.currentServing ? buildHistoryEntry(queue) : null;

    if (settings.serviceMode === "round-robin" || settings.serviceMode === "multigate") {
        const nextSeq = getNextQueuePlusRoundRobinCounter(queue.currentServingSeq, getEffectiveRoundRobinMax(settings));
        const matchedWaiting = waiting.find((entry) => entry.seq === nextSeq) ?? null;

        await WebAppQueuePlusDataModel.findByIdAndUpdate(queue._id, {
            currentServing: buildQueuePlusDisplayNumber(nextSeq, settings),
            currentServingSeq: nextSeq,
            currentServingIssuedAt: matchedWaiting?.issuedAt ?? null,
            currentSource: matchedWaiting ? "queue" : "round-robin",
            ...(matchedWaiting ? { $pull: { waitingQueue: { seq: matchedWaiting.seq } } } : {}),
            ...(historyEntry ? { $push: { history: historyEntry } } : {}),
            lastUpdatedAt: new Date(),
            lastUpdatedBy: instanceId,
        });

        return buildQueuePlusDisplayNumber(nextSeq, settings);
    }

    const next = waiting.length > 0 ? waiting[0] : null;
    await WebAppQueuePlusDataModel.findByIdAndUpdate(queue._id, {
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

export async function retreatQueuePlus(orgId: string, datasetId: string, instanceId: string): Promise<string | null> {
    await connectDB();

    const queue = await WebAppQueuePlusDataModel.findOne({
        orgId: new Types.ObjectId(orgId),
        datasetId: new Types.ObjectId(datasetId),
    });
    if (!queue) throw new Error("QueuePLUS runtime not found");

    const history = queue.history as Array<{ displayNumber: string; calledAt: Date; seq?: number | null; issuedAt?: Date | null; source?: "queue" | "manual" | "round-robin" | null }>;
    if (history.length === 0) return queue.currentServing;

    const previous = history[history.length - 1];
    const currentWaiting = queue.waitingQueue as Array<{ seq: number; displayNumber: string; issuedAt: Date }>;
    const waitingQueue =
        queue.currentServing && queue.currentSource === "queue" && queue.currentServingSeq !== null
            ? [{ seq: queue.currentServingSeq, displayNumber: queue.currentServing, issuedAt: queue.currentServingIssuedAt ?? new Date() }, ...currentWaiting]
            : currentWaiting;

    await WebAppQueuePlusDataModel.findByIdAndUpdate(queue._id, {
        currentServing: previous.displayNumber,
        currentServingSeq: previous.seq ?? parseQueuePlusDisplayNumber(previous.displayNumber, queue),
        currentServingIssuedAt: previous.issuedAt ?? null,
        currentSource: previous.source ?? "manual",
        waitingQueue,
        $pop: { history: 1 },
        lastUpdatedAt: new Date(),
        lastUpdatedBy: instanceId,
    });

    return previous.displayNumber;
}

export async function setQueuePlusCustomNumber(orgId: string, datasetId: string, instanceId: string, displayNumber: string): Promise<void> {
    await connectDB();

    const queue = await WebAppQueuePlusDataModel.findOne({
        orgId: new Types.ObjectId(orgId),
        datasetId: new Types.ObjectId(datasetId),
    });
    if (!queue) throw new Error("QueuePLUS runtime not found");

    const settings = await getQueuePlusSettingsForInstance(orgId, instanceId);
    const trimmed = displayNumber.trim().toUpperCase();
    if (!trimmed) throw new Error("Numero non valido");

    const waitingMatch = queue.waitingQueue.find((entry: { displayNumber: string; issuedAt?: Date; seq?: number }) => entry.displayNumber === trimmed);
    const historyEntry = queue.currentServing ? buildHistoryEntry(queue) : null;
    const parsedSeq = parseQueuePlusDisplayNumber(trimmed, settings);

    await WebAppQueuePlusDataModel.findByIdAndUpdate(queue._id, {
        currentServing: trimmed,
        currentServingSeq: parsedSeq,
        currentServingIssuedAt: waitingMatch?.issuedAt ?? null,
        currentSource: waitingMatch ? "queue" : "manual",
        ...(waitingMatch ? { $pull: { waitingQueue: { seq: waitingMatch.seq } } } : {}),
        ...(historyEntry ? { $push: { history: historyEntry } } : {}),
        ...(parsedSeq && parsedSeq >= queue.nextSeq ? { nextSeq: parsedSeq + 1 } : {}),
        lastUpdatedAt: new Date(),
        lastUpdatedBy: instanceId,
    });
}

export async function resetQueuePlus(orgId: string, datasetId: string, instanceId: string, keepHistory: boolean): Promise<void> {
    await connectDB();

    const queue = await WebAppQueuePlusDataModel.findOne({
        orgId: new Types.ObjectId(orgId),
        datasetId: new Types.ObjectId(datasetId),
    });
    if (!queue) throw new Error("QueuePLUS runtime not found");

    await WebAppQueuePlusDataModel.findByIdAndUpdate(queue._id, {
        currentServing: null,
        currentServingSeq: null,
        currentServingIssuedAt: null,
        currentSource: null,
        nextSeq: 1,
        waitingQueue: [],
        displayMessage: null,
        displayAccentColor: null,
        ...(keepHistory ? {} : { history: [] }),
        lastUpdatedAt: new Date(),
        lastUpdatedBy: instanceId,
    });
}

export async function updateQueuePlusDisplayOptions(
    orgId: string,
    datasetId: string,
    instanceId: string,
    input: { message?: string | null; accentColor?: string | null },
): Promise<void> {
    await connectDB();

    const queue = await WebAppQueuePlusDataModel.findOne({
        orgId: new Types.ObjectId(orgId),
        datasetId: new Types.ObjectId(datasetId),
    });
    if (!queue) throw new Error("QueuePLUS runtime not found");

    await WebAppQueuePlusDataModel.findByIdAndUpdate(queue._id, {
        ...(Object.prototype.hasOwnProperty.call(input, "message") ? { displayMessage: input.message ?? null } : {}),
        ...(Object.prototype.hasOwnProperty.call(input, "accentColor") ? { displayAccentColor: input.accentColor ?? null } : {}),
        lastUpdatedAt: new Date(),
        lastUpdatedBy: instanceId,
    });
}

export async function resolveQueuePlusActionContext(orgId: string, instanceId: string, requestedDatasetId?: string) {
    return resolveQueuePlusDatasetContext(orgId, instanceId, requestedDatasetId);
}

export interface IssuedQueuePlusTicketPayload {
    datasetId: string;
    queueName: string;
    displayNumber: string;
    issuedAt: string;
    kioskInstanceId?: string;
    printablePayloadVersion: number;
    ticketDeliveryMode?: string;
    enableDigitalTicket?: boolean;
    trackingCode?: string;
    trackingUrl?: string;
}

export interface QueuePlusDisplayTarget {
    displayId: string;
    displayName: string;
    datasetId: string;
    queueName: string;
}

export async function listQueuePlusDisplayInstancesForOrg(orgId: string): Promise<QueuePlusDisplayTarget[]> {
    await connectDB();

    const configs = await WebAppConfigModel.find({
        orgId: new Types.ObjectId(orgId),
        appId: "queue-plus",
        "settings.mode": { $in: ["queue", "display"] },
    })
        .select({ _id: 1, settings: 1 })
        .lean();

    if (!configs.length) return [];

    const configById = new Map(
        configs.map((config) => [String(config._id), (config.settings ?? {}) as Record<string, unknown>]),
    );

    const configIds = configs.map((config) => config._id);
    const instances = await WebAppInstanceModel.find({
        orgId: new Types.ObjectId(orgId),
        appId: "queue-plus",
        status: "active",
        configId: { $in: configIds },
    })
        .select({ _id: 1, name: 1, configId: 1 })
        .lean();

    return instances
        .map((instance) => {
            const settings = configById.get(String(instance.configId)) ?? {};
            const datasetId = typeof settings.datasetId === "string" ? settings.datasetId : "";
            if (!datasetId || !Types.ObjectId.isValid(datasetId)) return null;

            const queueName = typeof settings.queueName === "string"
                ? normalizeQueuePlusName(settings.queueName)
                : datasetId;

            return {
                displayId: String(instance._id),
                displayName: instance.name,
                datasetId,
                queueName,
            };
        })
        .filter((entry): entry is QueuePlusDisplayTarget => entry !== null);
}

export function buildIssuedQueuePlusTicketPayload(input: {
    datasetId: string;
    queueName: string;
    displayNumber: string;
    issuedAt?: Date;
    kioskInstanceId?: string;
    ticketDeliveryMode?: string;
    enableDigitalTicket?: boolean;
}): IssuedQueuePlusTicketPayload {
    const issuedAt = input.issuedAt ?? new Date();

    return {
        datasetId: input.datasetId,
        queueName: normalizeQueuePlusName(input.queueName),
        displayNumber: input.displayNumber,
        issuedAt: issuedAt.toISOString(),
        kioskInstanceId: input.kioskInstanceId,
        printablePayloadVersion: 1,
        ticketDeliveryMode: input.ticketDeliveryMode,
        enableDigitalTicket: input.enableDigitalTicket,
    };
}

export async function listRemoteQueuePlusTargets(orgId: string, settings: QueuePlusSettings) {
    let datasetIds = getAllowedDatasetIds(settings);

    if (datasetIds.length === 0) {
        const catalog = await listQueuePlusCatalogForOrg(orgId);
        datasetIds = catalog.map((entry) => entry.datasetId);
    }

    if (datasetIds.length === 0 && Types.ObjectId.isValid(settings.datasetId)) {
        datasetIds = [settings.datasetId];
    }

    if (Types.ObjectId.isValid(settings.datasetId) && !datasetIds.includes(settings.datasetId)) {
        datasetIds = [settings.datasetId, ...datasetIds];
    }

    const targets = await Promise.all(datasetIds.map(async (datasetId) => {
        if (!Types.ObjectId.isValid(datasetId)) return null;

        const dataset = await getQueuePlusDatasetById(orgId, datasetId);
        if (!dataset) return null;

        const datasetConfig = parseQueuePlusDatasetConfig(dataset.config as Record<string, unknown> | undefined);
        let queueData = await getQueuePlusDataByDatasetId(orgId, datasetId);

        if (!queueData && datasetConfig) {
            queueData = await getOrCreateQueuePlusData(orgId, {
                datasetId,
                queueName: datasetConfig.queueName,
                queueType: datasetConfig.queueType,
                prefix: datasetConfig.prefix,
            });
        }

        const queueName = datasetConfig?.queueName
            ?? queueData?.queueName
            ?? normalizeQueuePlusName(dataset.name ?? "");

        if (!queueName) return null;

        return {
            datasetId,
            queueName,
            queueType: datasetConfig?.queueType ?? queueData?.queueType ?? settings.queueType,
            prefix: datasetConfig?.prefix ?? queueData?.prefix ?? settings.prefix ?? "",
            currentServing: queueData?.currentServing ?? null,
            waitingCount: queueData?.waitingQueue.length ?? 0,
            accentColor: queueData?.displayAccentColor ?? settings.accentColor ?? "#2563EB",
        };
    }));

    return targets.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

export async function listQueuePlusDisplayTargets(orgId: string, datasetId: string): Promise<QueuePlusDisplayTarget[]> {
    if (!Types.ObjectId.isValid(datasetId)) return [];

    await connectDB();

    const configs = await WebAppConfigModel.find({
        orgId: new Types.ObjectId(orgId),
        appId: "queue-plus",
        "settings.mode": { $in: ["queue", "display"] },
        "settings.datasetId": datasetId,
    })
        .select({ _id: 1, settings: 1 })
        .lean();

    if (!configs.length) return [];

    const configById = new Map(
        configs.map((config) => [String(config._id), (config.settings ?? {}) as Record<string, unknown>]),
    );

    const configIds = configs.map((config) => config._id);
    const instances = await WebAppInstanceModel.find({
        orgId: new Types.ObjectId(orgId),
        appId: "queue-plus",
        status: "active",
        configId: { $in: configIds },
    })
        .select({ _id: 1, name: 1, configId: 1 })
        .lean();

    return instances.map((instance) => {
        const settings = configById.get(String(instance.configId)) ?? {};
        const queueName = typeof settings.queueName === "string"
            ? normalizeQueuePlusName(settings.queueName)
            : datasetId;

        return {
            displayId: String(instance._id),
            displayName: instance.name,
            datasetId,
            queueName,
        };
    });
}

export async function getQueuePlusSettingsForDatasetId(orgId: string, datasetId: string): Promise<QueuePlusSettings | null> {
    if (!Types.ObjectId.isValid(datasetId)) return null;

    const config = await WebAppConfigModel.findOne({
        orgId: new Types.ObjectId(orgId),
        appId: "queue-plus",
        "settings.datasetId": datasetId,
        "settings.mode": { $in: ["display", "queue", "remote", "waiting-list"] },
    })
        .sort({ updatedAt: -1 })
        .lean();

    return (config?.settings as QueuePlusSettings | undefined) ?? null;
}
