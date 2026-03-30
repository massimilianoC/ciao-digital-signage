import { io, type Socket } from "socket.io-client";

import type {
  ClockSyncEvent,
  ContentUpdateEvent,
  PlayerClientToServerEvents,
  PlayerServerToClientEvents,
} from "./types";

export type PlayerSocket = Socket<
  PlayerServerToClientEvents,
  PlayerClientToServerEvents
>;

let socketInstance: PlayerSocket | null = null;

interface PlayerSocketCallbacks {
  onConnected: (recovered: boolean) => void;
  onDisconnected: (reason: string) => void;
  onContentUpdate: (data: ContentUpdateEvent) => void;
  onForceOverride: (data: ContentUpdateEvent) => void;
  onOverrideClear: () => void;
  onClockSync: (data: ClockSyncEvent) => void;
  onRemoteRefresh: () => void;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function initPlayerSocket(
  screenId: string,
  token: string,
  callbacks: PlayerSocketCallbacks,
  options?: { previewMode?: boolean },
): PlayerSocket {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }

  const socket: PlayerSocket = io("/player", {
    auth: { token, screenId, preview: options?.previewMode === true },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: parsePositiveInt(process.env.NEXT_PUBLIC_PLAYER_RECONNECT_DELAY_MS, 1000),
    reconnectionDelayMax: parsePositiveInt(process.env.NEXT_PUBLIC_PLAYER_RECONNECT_DELAY_MAX_MS, 10000),
    timeout: parsePositiveInt(process.env.NEXT_PUBLIC_PLAYER_CONNECT_TIMEOUT_MS, 20000),
    transports: ["websocket", "polling"],
  });

  socket.on("content_update", callbacks.onContentUpdate);
  socket.on("force_override", callbacks.onForceOverride);
  socket.on("override_clear", callbacks.onOverrideClear);
  socket.on("clock_sync", callbacks.onClockSync);
  socket.on("remote_refresh", callbacks.onRemoteRefresh);

  socket.on("connect", () => {
    if (!socket.recovered) {
      socket.emit("player:request-state", { screenId });
    }

    callbacks.onConnected(socket.recovered ?? false);
  });

  socket.on("disconnect", (reason) => {
    callbacks.onDisconnected(reason);
  });

  socket.on("connect_error", (error) => {
    callbacks.onDisconnected(`connect_error:${error.message}`);
  });

  socketInstance = socket;
  return socket;
}

export function getPlayerSocket(): PlayerSocket | null {
  return socketInstance;
}

export function destroyPlayerSocket(): void {
  if (!socketInstance) {
    return;
  }

  socketInstance.disconnect();
  socketInstance = null;
}
