import { randomUUID } from "node:crypto";

import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { WebAppConfigModel, type WebAppSettings } from "@/lib/db/models/WebAppConfig";
import { WebAppInstanceModel, type IWebAppInstance, type WebAppId } from "@/lib/db/models/WebAppInstance";
import { WebAppStateModel } from "@/lib/db/models/WebAppState";

/** Lightweight summary returned by list queries */
export interface WebAppInstanceSummary {
    instanceId: string;
    appId: WebAppId;
    name: string;
    status: "active" | "suspended";
    publicToken: string;
    contentId: string | null;
    createdAt: string;
    updatedAt: string;
}

/** Full aggregate for a single instance (instance + config + state) */
export interface WebAppInstanceAggregate {
    instance: IWebAppInstance;
    settings: WebAppSettings;
    health: string;
    lastSyncAt: Date | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setDeepValue(target: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split(".").filter(Boolean);
    if (parts.length === 0) return;

    let cursor: Record<string, unknown> = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
        const segment = parts[i];
        const current = cursor[segment];
        if (!isPlainObject(current)) {
            cursor[segment] = {};
        }
        cursor = cursor[segment] as Record<string, unknown>;
    }

    cursor[parts[parts.length - 1]] = value;
}

function mergePatchIntoSettings(
    baseSettings: Record<string, unknown>,
    patch: Record<string, unknown>,
): Record<string, unknown> {
    const next = structuredClone(baseSettings);

    for (const [key, value] of Object.entries(patch)) {
        if (key.includes(".")) {
            setDeepValue(next, key, value);
            continue;
        }

        if (isPlainObject(value) && isPlainObject(next[key])) {
            next[key] = mergePatchIntoSettings(
                next[key] as Record<string, unknown>,
                value,
            );
            continue;
        }

        next[key] = value;
    }

    return next;
}

/**
 * List all active instances for an org and app type.
 */
export async function listInstancesForApp(
    orgId: string,
    appId: WebAppId,
): Promise<WebAppInstanceSummary[]> {
    await connectDB();
    const docs = await WebAppInstanceModel.find({
        orgId: new Types.ObjectId(orgId),
        appId,
    })
        .sort({ createdAt: -1 })
        .lean();

    return docs.map((d) => ({
        instanceId: String(d._id),
        appId: d.appId,
        name: d.name,
        status: d.status,
        publicToken: d.publicToken,
        contentId: d.contentId ? String(d.contentId) : null,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
    }));
}

/**
 * Get a single instance with its config/state.
 * Throws if not found or org mismatch.
 */
export async function getInstanceAggregate(
    orgId: string,
    instanceId: string,
): Promise<WebAppInstanceAggregate> {
    await connectDB();

    const instance = await WebAppInstanceModel.findOne({
        _id: new Types.ObjectId(instanceId),
        orgId: new Types.ObjectId(orgId),
    }).lean();

    if (!instance) throw new Error("Instance not found");

    const config = await WebAppConfigModel.findById(instance.configId).lean();
    if (!config) throw new Error("Config not found for instance");

    const state = await WebAppStateModel.findById(instance.stateId).lean();

    return {
        instance: instance as IWebAppInstance,
        settings: config.settings as WebAppSettings,
        health: state?.health ?? "unknown",
        lastSyncAt: state?.lastSyncAt ?? null,
    };
}

/**
 * Update the config settings for an instance.
 * Performs org ownership check.
 */
export async function updateInstanceSettings(
    orgId: string,
    instanceId: string,
    updatedBy: string,
    patch: Partial<WebAppSettings>,
): Promise<void> {
    await connectDB();

    const instance = await WebAppInstanceModel.findOne({
        _id: new Types.ObjectId(instanceId),
        orgId: new Types.ObjectId(orgId),
    });

    if (!instance) throw new Error("Instance not found");

    const config = await WebAppConfigModel.findById(instance.configId).lean();
    if (!config) throw new Error("Config not found for instance");

    const currentSettings = isPlainObject(config.settings)
        ? (config.settings as Record<string, unknown>)
        : {};
    const normalizedPatch = isPlainObject(patch)
        ? (patch as Record<string, unknown>)
        : {};

    const mergedSettings = mergePatchIntoSettings(currentSettings, normalizedPatch);

    await WebAppConfigModel.findByIdAndUpdate(instance.configId, {
        $set: { settings: mergedSettings },
    });

    await WebAppInstanceModel.findByIdAndUpdate(instanceId, {
        updatedBy,
        updatedAt: new Date(),
    });
}

/**
 * Suspend or reactivate an instance.
 */
export async function setInstanceStatus(
    orgId: string,
    instanceId: string,
    status: "active" | "suspended",
    updatedBy: string,
): Promise<void> {
    await connectDB();

    const result = await WebAppInstanceModel.updateOne(
        { _id: new Types.ObjectId(instanceId), orgId: new Types.ObjectId(orgId) },
        { status, updatedBy },
    );

    if (result.matchedCount === 0) throw new Error("Instance not found");
}

/**
 * Rename an instance.
 */
export async function setInstanceName(
    orgId: string,
    instanceId: string,
    name: string,
    updatedBy: string,
): Promise<void> {
    await connectDB();

    const trimmed = name.trim();
    if (!trimmed) throw new Error("Instance name is required");

    const result = await WebAppInstanceModel.updateOne(
        { _id: new Types.ObjectId(instanceId), orgId: new Types.ObjectId(orgId) },
        { name: trimmed, updatedBy, updatedAt: new Date() },
    );

    if (result.matchedCount === 0) throw new Error("Instance not found");
}

/**
 * Delete an instance and its associated config/state documents.
 * Does NOT delete the linked Content record (that is managed separately).
 */
export async function deleteInstance(
    orgId: string,
    instanceId: string,
): Promise<void> {
    await connectDB();

    const instance = await WebAppInstanceModel.findOne({
        _id: new Types.ObjectId(instanceId),
        orgId: new Types.ObjectId(orgId),
    });

    if (!instance) throw new Error("Instance not found");

    await Promise.all([
        WebAppConfigModel.findByIdAndDelete(instance.configId),
        WebAppStateModel.findByIdAndDelete(instance.stateId),
        WebAppInstanceModel.findByIdAndDelete(instanceId),
    ]);
}

/**
 * Rotate the public token for an instance (invalidates existing player URLs).
 */
export async function rotatePublicToken(
    orgId: string,
    instanceId: string,
    updatedBy: string,
): Promise<string> {
    await connectDB();

    const newToken = randomUUID();
    const result = await WebAppInstanceModel.findOneAndUpdate(
        { _id: new Types.ObjectId(instanceId), orgId: new Types.ObjectId(orgId) },
        { publicToken: newToken, updatedBy },
        { new: true },
    );

    if (!result) throw new Error("Instance not found");
    return newToken;
}
