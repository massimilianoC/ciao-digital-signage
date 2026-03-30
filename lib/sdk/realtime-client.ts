import { io, type Socket } from "socket.io-client";

import {
    WEBAPP_EVENT_NAME,
    WEBAPP_REQUEST_SNAPSHOT,
    type WebappRealtimeEnvelope,
    normalizeRealtimeChannelKeys,
} from "@/lib/realtime/webapp-events";

export type WebappRealtimeSocket = Socket<
    {
        [WEBAPP_EVENT_NAME]: (event: WebappRealtimeEnvelope) => void;
    },
    {
        [WEBAPP_REQUEST_SNAPSHOT]: () => void;
    }
>;

interface InitWebappRealtimeClientInput {
    appId: string;
    instanceId: string;
    token: string;
    channelKeys: string[];
    onEvent: (event: WebappRealtimeEnvelope) => void;
    onConnected?: (recovered: boolean) => void;
    onDisconnected?: (reason: string) => void;
}

export function initWebappRealtimeClient(
    input: InitWebappRealtimeClientInput,
): WebappRealtimeSocket {
    const channelKeys = normalizeRealtimeChannelKeys(input.channelKeys);

    const socket: WebappRealtimeSocket = io("/webapp", {
        auth: {
            appId: input.appId,
            instanceId: input.instanceId,
            token: input.token,
            channelKeys,
        },
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 20000,
        transports: ["websocket", "polling"],
    });

    socket.on(WEBAPP_EVENT_NAME, input.onEvent);

    socket.on("connect", () => {
        if (!socket.recovered) {
            socket.emit(WEBAPP_REQUEST_SNAPSHOT);
        }

        input.onConnected?.(socket.recovered ?? false);
    });

    socket.on("disconnect", (reason) => {
        input.onDisconnected?.(reason);
    });

    socket.on("connect_error", (error) => {
        input.onDisconnected?.(`connect_error:${error.message}`);
    });

    return socket;
}
