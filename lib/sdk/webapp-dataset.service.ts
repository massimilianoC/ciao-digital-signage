import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import {
    WebAppDatasetBindingModel,
    type WebAppDatasetBindingRole,
} from "@/lib/db/models/WebAppDatasetBinding";
import {
    WebAppDatasetModel,
    type IWebAppDataset,
    type WebAppDatasetStatus,
    type WebAppDatasetStorageMode,
} from "@/lib/db/models/WebAppDataset";
import { WebAppConfigModel } from "@/lib/db/models/WebAppConfig";
import { type WebAppId } from "@/lib/db/models/WebAppInstance";
import { WebAppInstanceModel } from "@/lib/db/models/WebAppInstance";
import { WebAppCalendarSourceModel } from "@/lib/db/models/webapp-google-calendar/WebAppCalendarSource";
import { WebAppQueueDataModel } from "@/lib/db/models/webapp-queue/WebAppQueueData";
import { WebAppQueuePlusDataModel } from "@/lib/db/models/webapp-queue-plus/WebAppQueuePlusData";

export interface WebAppDatasetSummary {
    datasetId: string;
    appId: WebAppId;
    name: string;
    status: WebAppDatasetStatus | "managed";
    datasetKind: string;
    storageMode: WebAppDatasetStorageMode;
    usageCount: number;
    managedBy: "sdk" | "app";
    readOnly: boolean;
    updatedAt: string | null;
    summary?: Record<string, unknown>;
}

export interface WebAppDatasetDetail extends WebAppDatasetSummary {
    config: Record<string, unknown>;
    tags: string[];
}

export interface CreateDatasetInput {
    appId: WebAppId;
    name: string;
    datasetKind: string;
    storageMode?: WebAppDatasetStorageMode;
    editorMode?: "json-schema" | "custom-react" | "raw-json";
    config?: Record<string, unknown>;
    summary?: Record<string, unknown>;
    tags?: string[];
}

export interface UpdateDatasetInput {
    name?: string;
    status?: WebAppDatasetStatus;
    datasetKind?: string;
    storageMode?: WebAppDatasetStorageMode;
    config?: Record<string, unknown>;
    summary?: Record<string, unknown>;
    tags?: string[];
}

export interface DatasetValidationResult {
    valid: boolean;
    issues: Array<{
        severity: "error" | "warning" | "info";
        code: string;
        message: string;
    }>;
    validatedAt: string;
    summary?: Record<string, unknown>;
}

export interface InstanceDatasetBindingRecord {
    bindingId: string;
    instanceId: string;
    datasetId: string;
    role: WebAppDatasetBindingRole;
    order: number;
    required: boolean;
    dataset: WebAppDatasetSummary | null;
}

function slugify(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 200);
}

async function countBindingsForDataset(orgId: string, appId: WebAppId, datasetId: Types.ObjectId): Promise<number> {
    await connectDB();
    return WebAppDatasetBindingModel.countDocuments({
        orgId: new Types.ObjectId(orgId),
        appId,
        datasetId,
    });
}

function mapSdkDatasetToSummary(
    dataset: IWebAppDataset,
    usageCount: number,
): WebAppDatasetSummary {
    return {
        datasetId: dataset._id.toString(),
        appId: dataset.appId,
        name: dataset.name,
        status: dataset.status,
        datasetKind: dataset.datasetKind,
        storageMode: dataset.storageMode,
        usageCount,
        managedBy: "sdk",
        readOnly: false,
        updatedAt: dataset.updatedAt?.toISOString?.() ?? null,
        summary: dataset.summary,
    };
}

function isQueueScopedApp(appId: WebAppId): appId is "queue" | "queue-plus" {
    return appId === "queue" || appId === "queue-plus";
}

function normalizeQueueDatasetConfig(appId: "queue" | "queue-plus", config: Record<string, unknown> | undefined): Record<string, unknown> {
    const queueName = typeof config?.queueName === "string"
        ? String(config.queueName).trim().toLowerCase()
        : "";

    return {
        ...(config ?? {}),
        queueName,
        queueType: config?.queueType === "alpha" ? "alpha" : "numeric",
        serviceMode: appId === "queue-plus"
            ? "multigate"
            : (config?.serviceMode === "round-robin" ? "round-robin" : "reservation"),
        bookingEnabled: typeof config?.bookingEnabled === "boolean" ? config.bookingEnabled : true,
        maxWaiting: typeof config?.maxWaiting === "number" ? Math.max(1, Math.floor(config.maxWaiting)) : 99,
        roundRobinMaxNumber:
            typeof config?.roundRobinMaxNumber === "number"
                ? Math.max(1, Math.floor(config.roundRobinMaxNumber))
                : 99,
        prefix: typeof config?.prefix === "string" ? config.prefix : "",
        ...(appId === "queue-plus"
            ? {
                audio: config?.audio ?? {
                    enabled: true,
                    speechMode: "number",
                    languages: ["it-IT"],
                    preChime: false,
                    postChime: false,
                },
            }
            : {}),
    };
}

export async function listDatasetsForApp(
    orgId: string,
    appId: WebAppId,
): Promise<WebAppDatasetSummary[]> {
    if (appId === "google-calendar") {
        await connectDB();
        const sources = await WebAppCalendarSourceModel.find({ orgId: new Types.ObjectId(orgId) })
            .sort({ updatedAt: -1, createdAt: -1 })
            .lean();

        return Promise.all(
            sources.map(async (source) => {
                const usageCount = await WebAppConfigModel.countDocuments({
                    orgId: new Types.ObjectId(orgId),
                    appId: "google-calendar",
                    "settings.catalogSourceId": source._id.toString(),
                });

                return {
                    datasetId: source._id.toString(),
                    appId,
                    name: source.name,
                    status: source.status === "active" ? "active" : "disabled",
                    datasetKind: source.type,
                    storageMode: source.type === "ics-upload" ? "asset-ref" : "remote-mirror",
                    usageCount,
                    managedBy: "app",
                    readOnly: false,
                    updatedAt: source.updatedAt?.toISOString?.() ?? null,
                    summary: {
                        timezone: source.timezone,
                        refreshSeconds: source.refreshSeconds,
                        lastValidatedAt: source.lastValidatedAt ?? null,
                        lastError: source.lastError ?? null,
                    },
                } satisfies WebAppDatasetSummary;
            }),
        );
    }

    await connectDB();
    const datasets = await WebAppDatasetModel.find({
        orgId: new Types.ObjectId(orgId),
        appId,
    })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean<IWebAppDataset[]>();

    return Promise.all(
        datasets.map(async (dataset) => {
            const usageCount = isQueueScopedApp(appId)
                ? await WebAppConfigModel.countDocuments({
                    orgId: new Types.ObjectId(orgId),
                    appId,
                    $or: [
                        { "settings.datasetId": dataset._id.toString() },
                        { "settings.allowedDatasetIds": dataset._id.toString() },
                        { "settings.waitingListDatasetIds": dataset._id.toString() },
                        { "settings.kioskDatasetIds": dataset._id.toString() },
                    ],
                })
                : await countBindingsForDataset(orgId, appId, dataset._id);
            return mapSdkDatasetToSummary(dataset, usageCount);
        }),
    );
}

export async function getDatasetDetail(
    orgId: string,
    appId: WebAppId,
    datasetId: string,
): Promise<WebAppDatasetDetail | null> {
    if (appId === "google-calendar") {
        if (!Types.ObjectId.isValid(datasetId)) return null;
        await connectDB();
        const source = await WebAppCalendarSourceModel.findOne({
            _id: new Types.ObjectId(datasetId),
            orgId: new Types.ObjectId(orgId),
        }).lean();
        if (!source) return null;

        const usageCount = await WebAppConfigModel.countDocuments({
            orgId: new Types.ObjectId(orgId),
            appId: "google-calendar",
            "settings.catalogSourceId": source._id.toString(),
        });

        return {
            datasetId: source._id.toString(),
            appId,
            name: source.name,
            status: source.status === "active" ? "active" : "disabled",
            datasetKind: source.type,
            storageMode: source.type === "ics-upload" ? "asset-ref" : "remote-mirror",
            usageCount,
            managedBy: "app",
            readOnly: false,
            updatedAt: source.updatedAt?.toISOString?.() ?? null,
            tags: source.tags ?? [],
            config: {
                timezone: source.timezone,
                refreshSeconds: source.refreshSeconds,
                icsUrl: source.icsUrl,
                assetContentId: source.assetContentId?.toString(),
            },
            summary: {
                lastValidatedAt: source.lastValidatedAt ?? null,
                lastSyncAt: source.lastSyncAt ?? null,
                lastError: source.lastError ?? null,
            },
        };
    }

    if (!Types.ObjectId.isValid(datasetId)) return null;
    await connectDB();
    const dataset = await WebAppDatasetModel.findOne({
        _id: new Types.ObjectId(datasetId),
        orgId: new Types.ObjectId(orgId),
        appId,
    }).lean<IWebAppDataset | null>();

    if (!dataset) return null;
    const usageCount = isQueueScopedApp(appId)
        ? await WebAppConfigModel.countDocuments({
            orgId: new Types.ObjectId(orgId),
            appId,
            $or: [
                { "settings.datasetId": datasetId },
                { "settings.allowedDatasetIds": datasetId },
                { "settings.waitingListDatasetIds": datasetId },
                { "settings.kioskDatasetIds": datasetId },
            ],
        })
        : await countBindingsForDataset(orgId, appId, dataset._id);
    const summary = mapSdkDatasetToSummary(dataset, usageCount);

    const runtime = appId === "queue"
        ? await WebAppQueueDataModel.findOne({
            orgId: new Types.ObjectId(orgId),
            datasetId: new Types.ObjectId(datasetId),
        }).lean()
        : appId === "queue-plus"
            ? await WebAppQueuePlusDataModel.findOne({
                orgId: new Types.ObjectId(orgId),
                datasetId: new Types.ObjectId(datasetId),
            }).lean()
            : null;

    return {
        ...summary,
        config: (dataset.config ?? {}) as Record<string, unknown>,
        tags: dataset.tags ?? [],
        summary: isQueueScopedApp(appId)
            ? {
                ...(summary.summary ?? {}),
                currentServing: runtime?.currentServing ?? null,
                waitingCount: runtime?.waitingQueue?.length ?? 0,
            }
            : summary.summary,
    };
}

export async function createDatasetForApp(
    orgId: string,
    userId: string,
    input: CreateDatasetInput,
): Promise<WebAppDatasetDetail> {
    await connectDB();

    const normalizedName = input.name.trim();
    if (!normalizedName) throw new Error("Dataset name is required");
    const slug = slugify(normalizedName);
    if (!slug) throw new Error("Dataset name is invalid");

    if (isQueueScopedApp(input.appId)) {
        const queueName = typeof input.config?.queueName === "string"
            ? String(input.config.queueName).trim().toLowerCase()
            : "";
        if (!queueName) {
            throw new Error("Queue dataset requires config.queueName");
        }

        input.config = normalizeQueueDatasetConfig(input.appId, {
            ...(input.config ?? {}),
            queueName,
        });
    }

    const existing = await WebAppDatasetModel.findOne({
        orgId: new Types.ObjectId(orgId),
        appId: input.appId,
        slug,
    }).lean();
    if (existing) {
        throw new Error("Dataset slug already exists for this app");
    }

    const created = await WebAppDatasetModel.create({
        orgId: new Types.ObjectId(orgId),
        appId: input.appId,
        name: normalizedName,
        slug,
        status: "active",
        schemaVersion: 1,
        datasetKind: input.datasetKind,
        editorMode: input.editorMode ?? "raw-json",
        storageMode: input.storageMode ?? "inline",
        config: input.config ?? {},
        summary: input.summary ?? {},
        tags: input.tags ?? [],
        createdBy: userId,
        updatedBy: userId,
    });

    return {
        datasetId: created._id.toString(),
        appId: input.appId,
        name: created.name,
        status: created.status,
        datasetKind: created.datasetKind,
        storageMode: created.storageMode,
        usageCount: 0,
        managedBy: "sdk",
        readOnly: false,
        updatedAt: created.updatedAt.toISOString(),
        config: (created.config ?? {}) as Record<string, unknown>,
        tags: created.tags ?? [],
        summary: (created.summary ?? {}) as Record<string, unknown>,
    };
}

export async function updateDatasetForApp(
    orgId: string,
    userId: string,
    appId: WebAppId,
    datasetId: string,
    input: UpdateDatasetInput,
): Promise<void> {
    if (appId === "google-calendar") {
        if (!Types.ObjectId.isValid(datasetId)) throw new Error("Dataset not found");

        const patch: Record<string, unknown> = { updatedBy: userId };
        if (typeof input.name === "string" && input.name.trim()) patch.name = input.name.trim();
        if (input.status === "active" || input.status === "disabled") patch.status = input.status;
        if (Array.isArray(input.tags)) patch.tags = input.tags;

        if (input.config) {
            if (typeof input.config.timezone === "string") patch.timezone = input.config.timezone;
            if (typeof input.config.refreshSeconds === "number") patch.refreshSeconds = input.config.refreshSeconds;
            if (typeof input.config.icsUrl === "string") patch.icsUrl = input.config.icsUrl;
        }

        await connectDB();
        const result = await WebAppCalendarSourceModel.updateOne(
            { _id: new Types.ObjectId(datasetId), orgId: new Types.ObjectId(orgId) },
            { $set: patch },
        );
        if (result.matchedCount === 0) throw new Error("Dataset not found");
        return;
    }

    if (!Types.ObjectId.isValid(datasetId)) throw new Error("Dataset not found");

    const patch: Record<string, unknown> = {
        updatedBy: userId,
    };

    if (typeof input.name === "string" && input.name.trim()) {
        patch.name = input.name.trim();
        patch.slug = slugify(input.name);
    }
    if (input.status) patch.status = input.status;
    if (typeof input.datasetKind === "string" && input.datasetKind.trim()) patch.datasetKind = input.datasetKind.trim();
    if (input.storageMode) patch.storageMode = input.storageMode;
    if (input.config) {
        patch.config = isQueueScopedApp(appId)
            ? normalizeQueueDatasetConfig(appId, input.config)
            : input.config;
    }
    if (input.summary) patch.summary = input.summary;
    if (Array.isArray(input.tags)) patch.tags = input.tags;

    await connectDB();
    const result = await WebAppDatasetModel.updateOne(
        {
            _id: new Types.ObjectId(datasetId),
            orgId: new Types.ObjectId(orgId),
            appId,
        },
        { $set: patch },
    );

    if (result.matchedCount === 0) throw new Error("Dataset not found");
}

export async function deleteDatasetForApp(
    orgId: string,
    appId: WebAppId,
    datasetId: string,
): Promise<void> {
    if (appId === "google-calendar") {
        if (!Types.ObjectId.isValid(datasetId)) throw new Error("Dataset not found");

        await connectDB();
        const sourceId = new Types.ObjectId(datasetId);
        const usageCount = await WebAppConfigModel.countDocuments({
            orgId: new Types.ObjectId(orgId),
            appId: "google-calendar",
            "settings.catalogSourceId": datasetId,
        });
        if (usageCount > 0) {
            throw new Error("Dataset is used by one or more instances");
        }

        const result = await WebAppCalendarSourceModel.deleteOne({
            _id: sourceId,
            orgId: new Types.ObjectId(orgId),
        });
        if (result.deletedCount === 0) throw new Error("Dataset not found");
        return;
    }

    if (!Types.ObjectId.isValid(datasetId)) throw new Error("Dataset not found");
    await connectDB();
    const objectId = new Types.ObjectId(datasetId);

    const usageCount = await WebAppDatasetBindingModel.countDocuments({
        orgId: new Types.ObjectId(orgId),
        appId,
        datasetId: objectId,
    });

    if (usageCount > 0) {
        throw new Error("Dataset is used by one or more instances");
    }

    const result = await WebAppDatasetModel.deleteOne({
        _id: objectId,
        orgId: new Types.ObjectId(orgId),
        appId,
    });

    if (result.deletedCount === 0) throw new Error("Dataset not found");
}

export async function validateDatasetForApp(
    orgId: string,
    appId: WebAppId,
    datasetId: string,
): Promise<DatasetValidationResult> {
    const now = new Date().toISOString();

    if (isQueueScopedApp(appId)) {
        const detail = await getDatasetDetail(orgId, appId, datasetId);
        if (!detail) {
            return {
                valid: false,
                issues: [
                    {
                        severity: "error",
                        code: "DATASET_NOT_FOUND",
                        message: "Dataset not found",
                    },
                ],
                validatedAt: now,
            };
        }

        return {
            valid: true,
            issues: [],
            validatedAt: now,
            summary: {
                mode: `${appId}-dataset`,
                usageCount: detail.usageCount,
            },
        };
    }

    if (appId === "google-calendar") {
        const detail = await getDatasetDetail(orgId, appId, datasetId);
        if (!detail) {
            return {
                valid: false,
                issues: [
                    {
                        severity: "error",
                        code: "DATASET_NOT_FOUND",
                        message: "Dataset not found",
                    },
                ],
                validatedAt: now,
            };
        }

        const issues: DatasetValidationResult["issues"] = [];
        if (detail.summary?.lastError) {
            issues.push({
                severity: "warning",
                code: "LAST_SOURCE_ERROR",
                message: String(detail.summary.lastError),
            });
        }

        return {
            valid: issues.length === 0,
            issues,
            validatedAt: now,
            summary: {
                lastValidatedAt: detail.summary?.lastValidatedAt ?? null,
                lastSyncAt: detail.summary?.lastSyncAt ?? null,
            },
        };
    }

    const detail = await getDatasetDetail(orgId, appId, datasetId);
    if (!detail) {
        return {
            valid: false,
            issues: [
                {
                    severity: "error",
                    code: "DATASET_NOT_FOUND",
                    message: "Dataset not found",
                },
            ],
            validatedAt: now,
        };
    }

    const issues: DatasetValidationResult["issues"] = [];
    if (!detail.name.trim()) {
        issues.push({
            severity: "error",
            code: "INVALID_NAME",
            message: "Dataset name is required",
        });
    }

    return {
        valid: issues.every((item) => item.severity !== "error"),
        issues,
        validatedAt: now,
        summary: {
            configKeys: Object.keys(detail.config ?? {}).length,
            usageCount: detail.usageCount,
        },
    };
}

export async function bindDatasetToInstance(input: {
    orgId: string;
    appId: WebAppId;
    instanceId: string;
    datasetId: string;
    role?: WebAppDatasetBindingRole;
    required?: boolean;
    order?: number;
}): Promise<void> {
    if (!Types.ObjectId.isValid(input.instanceId) || !Types.ObjectId.isValid(input.datasetId)) {
        throw new Error("Invalid binding ids");
    }

    await connectDB();
    await WebAppDatasetBindingModel.updateOne(
        {
            orgId: new Types.ObjectId(input.orgId),
            appId: input.appId,
            instanceId: new Types.ObjectId(input.instanceId),
            datasetId: new Types.ObjectId(input.datasetId),
            role: input.role ?? "primary",
        },
        {
            $set: {
                required: input.required ?? true,
                order: input.order ?? 0,
            },
        },
        { upsert: true },
    );
}

export async function listDatasetBindingsForInstance(
    orgId: string,
    instanceId: string,
): Promise<InstanceDatasetBindingRecord[]> {
    if (!Types.ObjectId.isValid(instanceId)) {
        throw new Error("Instance not found");
    }

    await connectDB();
    const instance = await WebAppInstanceModel.findOne({
        _id: new Types.ObjectId(instanceId),
        orgId: new Types.ObjectId(orgId),
    }).lean();
    if (!instance) throw new Error("Instance not found");

    const bindings = await WebAppDatasetBindingModel.find({
        orgId: new Types.ObjectId(orgId),
        appId: instance.appId,
        instanceId: new Types.ObjectId(instanceId),
    })
        .sort({ order: 1, updatedAt: -1 })
        .lean();

    const datasets = await listDatasetsForApp(orgId, instance.appId);
    const datasetMap = new Map(datasets.map((d) => [d.datasetId, d]));

    return bindings.map((binding) => ({
        bindingId: String(binding._id),
        instanceId,
        datasetId: String(binding.datasetId),
        role: binding.role,
        order: binding.order,
        required: binding.required,
        dataset: datasetMap.get(String(binding.datasetId)) ?? null,
    }));
}

export async function replaceDatasetBindingsForInstance(input: {
    orgId: string;
    userId: string;
    instanceId: string;
    bindings: Array<{
        datasetId: string;
        role: WebAppDatasetBindingRole;
        order?: number;
        required?: boolean;
    }>;
}): Promise<void> {
    if (!Types.ObjectId.isValid(input.instanceId)) {
        throw new Error("Instance not found");
    }

    await connectDB();
    const instance = await WebAppInstanceModel.findOne({
        _id: new Types.ObjectId(input.instanceId),
        orgId: new Types.ObjectId(input.orgId),
    }).lean();
    if (!instance) throw new Error("Instance not found");

    if (instance.appId === "queue" || instance.appId === "queue-plus") {
        throw new Error("Queue bindings are implicit and cannot be changed from generic binding API");
    }

    const normalizedBindings = input.bindings.map((binding, index) => ({
        datasetId: String(binding.datasetId).trim(),
        role: binding.role,
        order: Number.isFinite(binding.order) ? Number(binding.order) : index,
        required: binding.required ?? true,
    }));

    if (normalizedBindings.length > 0) {
        const duplicateSet = new Set<string>();
        for (const binding of normalizedBindings) {
            const duplicateKey = `${binding.datasetId}:${binding.role}`;
            if (duplicateSet.has(duplicateKey)) {
                throw new Error("Duplicate dataset-role binding is not allowed");
            }
            duplicateSet.add(duplicateKey);

            const dataset = await getDatasetDetail(input.orgId, instance.appId, binding.datasetId);
            if (!dataset) {
                throw new Error(`Dataset not found for app: ${binding.datasetId}`);
            }
        }
    }

    await WebAppDatasetBindingModel.deleteMany({
        orgId: new Types.ObjectId(input.orgId),
        appId: instance.appId,
        instanceId: new Types.ObjectId(input.instanceId),
    });

    if (normalizedBindings.length === 0) return;

    await WebAppDatasetBindingModel.insertMany(
        normalizedBindings.map((binding) => ({
            orgId: new Types.ObjectId(input.orgId),
            appId: instance.appId,
            instanceId: new Types.ObjectId(input.instanceId),
            datasetId: new Types.ObjectId(binding.datasetId),
            role: binding.role,
            order: binding.order,
            required: binding.required,
        })),
    );
}
