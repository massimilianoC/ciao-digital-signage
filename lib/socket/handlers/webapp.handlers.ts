import type { Namespace, Socket } from "socket.io";
import { randomUUID } from "node:crypto";

import {
    WEBAPP_EVENT_NAME,
    WEBAPP_REQUEST_SNAPSHOT,
    buildInstanceChannelKey,
    buildQueueChannelKey,
    buildWebappChannelRoom,
    buildWebappInstanceRoom,
    normalizeRealtimeChannelKeys,
    type WebappRealtimeEnvelope,
} from "@/lib/realtime/webapp-events";
import { getQueuePublicStateForAccess } from "@/lib/services/queue-public-state";
import { getQueuePlusPublicStateForAccess } from "@/lib/services/queue-plus-public-state";

type WebappHandshake = {
    appId?: string;
    instanceId?: string;
    token?: string;
    channelKeys?: string[];
};

type WebappSnapshotPayload = {
    state: unknown;
};

export function registerWebappHandlers(webappNsp: Namespace): void {
    webappNsp.on("connection", async (socket: Socket) => {
        const orgId = socket.data.orgId as string | undefined;
        const appId = socket.data.appId as string | undefined;
        const instanceId = socket.data.instanceId as string | undefined;
        const channelKeys = (socket.data.channelKeys as string[] | undefined) ?? [];

        if (!orgId || !appId || !instanceId) {
            socket.disconnect(true);
            return;
        }

        const instanceRoom = buildWebappInstanceRoom(orgId, appId, instanceId);
        await socket.join(instanceRoom);

        for (const channelKey of channelKeys) {
            await socket.join(buildWebappChannelRoom(orgId, appId, channelKey));
        }

        const emitQueueSnapshot = async () => {
            const token = socket.data.token as string;
            const snapshot = appId === "queue-plus"
                ? await getQueuePlusPublicStateForAccess(instanceId, token)
                : await getQueuePublicStateForAccess(instanceId, token);

            if (!snapshot) {
                return;
            }

            const envelope: WebappRealtimeEnvelope<WebappSnapshotPayload> = {
                eventId: randomUUID(),
                eventType: "queue.snapshot",
                orgId,
                appId,
                instanceId,
                channelKeys,
                version: Date.now(),
                ts: new Date().toISOString(),
                source: "socket.webapp.snapshot",
                payload: { state: snapshot.state },
            };

            socket.emit(WEBAPP_EVENT_NAME, envelope);
        };

        await emitQueueSnapshot();

        socket.on(WEBAPP_REQUEST_SNAPSHOT, async () => {
            await emitQueueSnapshot();
        });
    });
}

export async function authenticateWebappSocket(socket: Socket, next: (err?: Error) => void): Promise<void> {
    const authData = (socket.handshake.auth ?? socket.handshake.query) as WebappHandshake;

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

    const snapshot = appId === "queue-plus"
        ? await getQueuePlusPublicStateForAccess(instanceId, token)
        : await getQueuePublicStateForAccess(instanceId, token);

    if (!snapshot) {
        next(new Error("INVALID_TOKEN"));
        return;
    }

    const effectiveMode = snapshot.aggregate.config.mode === "display" ? "queue" : snapshot.aggregate.config.mode;
    const allowedChannelKeys = new Set<string>([buildInstanceChannelKey(instanceId)]);
    const addQueueChannelKey = (queueName: unknown) => {
        if (typeof queueName !== "string" || queueName.trim().length === 0) return;
        try {
            allowedChannelKeys.add(buildQueueChannelKey(queueName));
        } catch {
            // Ignore malformed queue names to avoid hard auth failures.
        }
    };

    if (appId === "queue-plus") {
        if (effectiveMode === "kiosk") {
            const queueNames = (snapshot.state as { kioskQueues?: Array<{ queueName: string }> }).kioskQueues
                ?.map((queue) => queue.queueName) ?? [];
            for (const queueName of queueNames) addQueueChannelKey(queueName);
        } else if (effectiveMode === "remote") {
            const queueNames = (snapshot.state as { remoteQueues?: Array<{ queueName: string }> }).remoteQueues
                ?.map((queue) => queue.queueName) ?? [];
            for (const queueName of queueNames) addQueueChannelKey(queueName);
        } else if (effectiveMode === "waiting-list") {
            const queueNames = (snapshot.state as { waitingQueues?: Array<{ queueName: string }> }).waitingQueues
                ?.map((queue) => queue.queueName) ?? [];
            for (const queueName of queueNames) addQueueChannelKey(queueName);
        }

        if (allowedChannelKeys.size === 1) {
            const queueName = snapshot.aggregate.queueData?.queueName ?? snapshot.aggregate.config.datasetId;
            addQueueChannelKey(queueName);
        }
    } else {
        const queueName = snapshot.aggregate.queueData?.queueName ?? snapshot.aggregate.config.datasetId;
        addQueueChannelKey(queueName);
    }

    let requestedChannelKeys: string[] = [];

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

    socket.data.orgId = String(snapshot.aggregate.instance.orgId);
    socket.data.appId = appId;
    socket.data.instanceId = instanceId;
    socket.data.channelKeys = channelKeys;
    socket.data.token = token;

    next();
}
