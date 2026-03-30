import { randomUUID } from "node:crypto";

import { getIO } from "@/lib/socket";
import {
    WEBAPP_EVENT_NAME,
    type WebappRealtimeEnvelope,
    buildWebappChannelRoom,
    buildWebappInstanceRoom,
    normalizeRealtimeChannelKeys,
} from "@/lib/realtime/webapp-events";

interface EmitWebappEventInput<TPayload = unknown> {
    orgId: string;
    appId: string;
    instanceId: string;
    eventType: string;
    payload: TPayload;
    channelKeys?: string[];
    source: string;
    version?: number;
}

export function emitWebappEvent<TPayload>(
    input: EmitWebappEventInput<TPayload>,
): WebappRealtimeEnvelope<TPayload> | null {
    const ts = new Date();
    const normalizedChannelKeys = normalizeRealtimeChannelKeys(input.channelKeys);

    const envelope: WebappRealtimeEnvelope<TPayload> = {
        eventId: randomUUID(),
        eventType: input.eventType,
        orgId: input.orgId,
        appId: input.appId,
        instanceId: input.instanceId,
        channelKeys: normalizedChannelKeys,
        version: input.version ?? ts.getTime(),
        ts: ts.toISOString(),
        source: input.source,
        payload: input.payload,
    };

    let io;
    try {
        io = getIO();
    } catch {
        return null;
    }

    const nsp = io.of("/webapp");
    const targetRooms = new Set<string>();

    targetRooms.add(buildWebappInstanceRoom(input.orgId, input.appId, input.instanceId));

    for (const channelKey of normalizedChannelKeys) {
        targetRooms.add(buildWebappChannelRoom(input.orgId, input.appId, channelKey));
    }

    for (const room of targetRooms) {
        nsp.to(room).emit(WEBAPP_EVENT_NAME, envelope);
    }

    return envelope;
}
