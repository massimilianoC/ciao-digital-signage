import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

const WEBAPP_EVENT_NAME = "webapp:event";
const WEBAPP_REQUEST_SNAPSHOT = "webapp:request-snapshot";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/ciao";

function toSafeSegment(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9:_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-+/g, "-");
}

function normalizeRealtimeChannelKey(channelKey) {
    const normalized = toSafeSegment(channelKey);
    if (!normalized || normalized.length > 120) throw new Error("INVALID_CHANNEL_KEY");
    return normalized;
}

function normalizeRealtimeChannelKeys(channelKeys) {
    if (!Array.isArray(channelKeys)) return [];
    return Array.from(new Set(channelKeys.map((entry) => normalizeRealtimeChannelKey(entry)).filter(Boolean)));
}

function normalizeQueueNameList(list) {
    if (!Array.isArray(list)) return [];
    return Array.from(new Set(list.map((entry) => toSafeSegment(entry)).filter(Boolean)));
}

function buildScopedChannelKey(scope, id) {
    return `${normalizeRealtimeChannelKey(scope)}:${normalizeRealtimeChannelKey(id)}`;
}

function buildInstanceChannelKey(instanceId) {
    return buildScopedChannelKey("instance", instanceId);
}

function buildQueueChannelKey(queueName) {
    return buildScopedChannelKey("queue", queueName);
}

function buildWebappInstanceRoom(orgId, appId, instanceId) {
    return `org:${orgId}:app:${appId}:instance:${instanceId}`;
}

function buildWebappChannelRoom(orgId, appId, channelKey) {
    return `org:${orgId}:app:${appId}:channel:${normalizeRealtimeChannelKey(channelKey)}`;
}

async function ensureDB() {
    if (mongoose.connection.readyState === 1) return;
    await mongoose.connect(MONGODB_URI, { bufferCommands: false });
}

function getWebappInstanceModel() {
    return mongoose.models.WebAppInstance ?? mongoose.model("WebAppInstance", new mongoose.Schema({
        orgId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        appId: { type: String, enum: ["google-calendar", "queue", "queue-plus", "wordpress-link"], required: true, index: true },
        name: { type: String, required: true, trim: true },
        status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
        version: { type: String, default: "v0.1.0" },
        configId: { type: mongoose.Schema.Types.ObjectId, required: true },
        stateId: { type: mongoose.Schema.Types.ObjectId, required: true },
        contentId: { type: mongoose.Schema.Types.ObjectId, default: null },
        publicToken: { type: String, required: true, index: true },
        createdBy: { type: String, required: true },
        updatedBy: { type: String, required: true },
    }, { timestamps: true, collection: "webapp_instances" }));
}

function getWebappConfigModel() {
    return mongoose.models.WebAppConfig ?? mongoose.model("WebAppConfig", new mongoose.Schema({
        orgId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        appId: { type: String, enum: ["google-calendar", "queue", "queue-plus", "wordpress-link"], required: true, index: true },
        schemaVersion: { type: Number, default: 1 },
        settings: { type: mongoose.Schema.Types.Mixed, required: true },
        uiProps: { type: mongoose.Schema.Types.Mixed },
        refreshPolicy: { type: mongoose.Schema.Types.Mixed },
        dataAccessMode: { type: String },
    }, { timestamps: true, collection: "webapp_configs" }));
}

function getWebappDatasetModel() {
    return mongoose.models.WebAppDataset ?? mongoose.model("WebAppDataset", new mongoose.Schema({
        orgId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
        appId: { type: String, enum: ["google-calendar", "queue", "queue-plus", "wordpress-link"], required: true, index: true },
        status: { type: String, enum: ["active", "disabled", "draft"], default: "active", index: true },
        name: { type: String, required: true, trim: true },
        config: { type: mongoose.Schema.Types.Mixed, default: {} },
    }, { timestamps: true, collection: "webapp_datasets" }));
}

function isObjectId(value) {
    return typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value);
}

function buildQueuePlusDatasetIds(settings, mode) {
    if (mode === "kiosk") {
        return Array.from(new Set((Array.isArray(settings.kioskDatasetIds) ? settings.kioskDatasetIds : []).filter(isObjectId)));
    }

    if (mode === "remote") {
        return Array.from(new Set([
            ...(isObjectId(settings.datasetId) ? [settings.datasetId] : []),
            ...(Array.isArray(settings.allowedDatasetIds) ? settings.allowedDatasetIds.filter(isObjectId) : []),
        ]));
    }

    if (mode === "waiting-list") {
        return Array.from(new Set([
            ...(isObjectId(settings.datasetId) ? [settings.datasetId] : []),
            ...(Array.isArray(settings.waitingListDatasetIds) ? settings.waitingListDatasetIds.filter(isObjectId) : []),
        ]));
    }

    return isObjectId(settings.datasetId) ? [settings.datasetId] : [];
}

function addQueueChannelKey(allowedChannelKeys, queueName) {
    if (typeof queueName !== "string" || queueName.trim().length === 0) return;
    try {
        allowedChannelKeys.add(buildQueueChannelKey(queueName));
    } catch {
        // Ignore malformed queue names to avoid hard auth failures.
    }
}

export function registerWebappHandlers(webappNsp) {
    webappNsp.on("connection", async (socket) => {
        const orgId = socket.data.orgId;
        const appId = socket.data.appId;
        const instanceId = socket.data.instanceId;
        const channelKeys = socket.data.channelKeys ?? [];

        if (!orgId || !appId || !instanceId) {
            socket.disconnect(true);
            return;
        }

        const instanceRoom = buildWebappInstanceRoom(orgId, appId, instanceId);
        await socket.join(instanceRoom);

        for (const channelKey of channelKeys) {
            await socket.join(buildWebappChannelRoom(orgId, appId, channelKey));
        }

        socket.on(WEBAPP_REQUEST_SNAPSHOT, async () => {
            socket.emit(WEBAPP_EVENT_NAME, {
                eventId: randomUUID(),
                eventType: "queue.snapshot.requested",
                orgId,
                appId,
                instanceId,
                channelKeys,
                version: Date.now(),
                ts: new Date().toISOString(),
                source: "socket.webapp.snapshot.request",
                payload: { requested: true },
            });
        });
    });
}

export async function authenticateWebappSocket(socket, next) {
    const authData = socket.handshake.auth ?? socket.handshake.query;

    const appId = authData.appId;
    const instanceId = authData.instanceId;
    const token = authData.token;

    if (!appId || !instanceId || !token) {
        next(new Error("MISSING_CREDENTIALS"));
        return;
    }

    if (appId !== "queue" && appId !== "queue-plus") {
        next(new Error("UNSUPPORTED_APP"));
        return;
    }

    await ensureDB();

    const WebAppInstance = getWebappInstanceModel();
    const WebAppConfig = getWebappConfigModel();
    const WebAppDataset = getWebappDatasetModel();

    const instance = await WebAppInstance.findOne({
        _id: instanceId,
        appId,
        status: "active",
        publicToken: token,
    }).lean();

    if (!instance) {
        next(new Error("INVALID_TOKEN"));
        return;
    }

    const config = await WebAppConfig.findById(instance.configId).lean();

    if (!config?.settings) {
        next(new Error("INVALID_CONFIG"));
        return;
    }

    const effectiveMode = config.settings.mode === "display" ? "queue" : config.settings.mode;
    const allowedChannelKeys = new Set([buildInstanceChannelKey(instanceId)]);

    if (appId === "queue-plus") {
        const datasetIds = buildQueuePlusDatasetIds(config.settings ?? {}, effectiveMode);

        if (datasetIds.length > 0) {
            const datasets = await WebAppDataset.find({
                _id: { $in: datasetIds },
                orgId: instance.orgId,
                appId: "queue-plus",
                status: "active",
            })
                .select({ _id: 1, name: 1, config: 1 })
                .lean();

            for (const dataset of datasets) {
                const configQueueName = dataset?.config && typeof dataset.config.queueName === "string"
                    ? dataset.config.queueName
                    : "";
                const fallbackQueueName = typeof dataset?.name === "string" ? dataset.name : "";
                addQueueChannelKey(allowedChannelKeys, configQueueName || fallbackQueueName);
            }
        }

        if (allowedChannelKeys.size === 1) {
            addQueueChannelKey(
                allowedChannelKeys,
                typeof config.settings.queueName === "string" ? config.settings.queueName : String(config.settings.datasetId ?? ""),
            );
        }
    } else if (effectiveMode === "kiosk") {
        const queueKeys = normalizeQueueNameList(config.settings.kioskQueueNames).map((queueName) => buildQueueChannelKey(queueName));
        for (const channelKey of queueKeys) allowedChannelKeys.add(channelKey);
    } else {
        addQueueChannelKey(allowedChannelKeys, config.settings.queueName);
    }

    let requestedChannelKeys = [];

    try {
        requestedChannelKeys = normalizeRealtimeChannelKeys(authData.channelKeys);
    } catch {
        next(new Error("INVALID_CHANNEL_KEY"));
        return;
    }

    const channelKeys = requestedChannelKeys.length > 0
        ? requestedChannelKeys
        : Array.from(allowedChannelKeys);

    const isAuthorized = channelKeys.every((key) => allowedChannelKeys.has(key));

    if (!isAuthorized) {
        next(new Error("CHANNEL_NOT_ALLOWED"));
        return;
    }

    socket.data.orgId = String(instance.orgId);
    socket.data.appId = appId;
    socket.data.instanceId = instanceId;
    socket.data.channelKeys = channelKeys;
    socket.data.token = token;

    next();
}
