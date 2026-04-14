import type { Namespace, Socket } from "socket.io";

import { resolveManifestForScreen } from "../../scheduling/runtime-resolver";
import { updatePresence } from "../../services/screen.service";

type HeartbeatPayload = {
  currentItemId?: string;
};

type PlayerErrorPayload = {
  code?: string;
  message?: string;
};

function toPlayerManifest(
  manifest: Awaited<ReturnType<typeof resolveManifestForScreen>>,
): {
  screenId: string;
  resolvedAt: string;
  scheduleId: string;
  loop: boolean;
  stopOnLastItem: boolean;
  fitModeOverride?: "cover" | "fit" | null;
  backgroundColorOverride?: string | null;
  transitionType?: "cut" | "fade";
  transitionMs?: number;
  items: Array<{
    id: string;
    type: "image" | "video" | "url" | "widget" | "layout";
    url: string;
    urlSubtype?: "youtube" | "video" | "image" | "pdf" | "webpage";
    interactive?: boolean;
    layoutId?: string;
    title?: string;
    thumbnailUrl?: string;
    fitMode?: "cover" | "fit";
    backgroundColor?: string | null;
    durationMs: number;
    durationOverride?: boolean;
  }>;
} {
  const manifestItems = manifest.items ?? [];
  const isSoleInteractiveUrl =
    manifestItems.length === 1 &&
    manifestItems[0]?.type === "url" &&
    (!manifestItems[0]?.urlSubtype || manifestItems[0]?.urlSubtype === "webpage" || manifestItems[0]?.urlSubtype === "pdf");

  return {
    screenId: manifest.screenId,
    resolvedAt: manifest.validFrom ?? new Date().toISOString(),
    scheduleId: manifest.manifestId,
    loop: manifest.loop ?? true,
    stopOnLastItem: manifest.stopOnLastItem ?? false,
    fitModeOverride: manifest.fitModeOverride ?? null,
    backgroundColorOverride: manifest.backgroundColorOverride ?? null,
    transitionType: manifest.transitionType === "cut" ? "cut" : "fade",
    transitionMs: typeof manifest.transitionMs === "number" ? Math.max(0, manifest.transitionMs) : 500,
    items: manifestItems.map((item, index) => ({
      id: String(item.contentId ?? `${manifest.screenId}-${index}`),
      type: item.type,
      url: item.url ?? item.fileUrl ?? "",
      layoutId:
        item.type === "layout"
          ? String(item.contentId ?? "")
          : undefined,
      urlSubtype: item.urlSubtype,
      interactive: item.type === "url" && isSoleInteractiveUrl ? true : undefined,
      title: item.title,
      thumbnailUrl: item.thumbnailUrl,
      fitMode: item.fitMode,
      backgroundColor: item.backgroundColor ?? null,
      durationMs: item.durationMs ?? 10000,
      durationOverride: item.durationOverride ?? true,
    })),
  };
}

function emitScreenStatus(
  playerNsp: Namespace,
  orgId: string,
  screenId: string,
  status: "online" | "offline",
  at: Date,
): void {
  playerNsp.server.of("/admin").to(`org:${orgId}`).emit("screen:status", {
    screenId,
    status,
    lastSeenAt: at.toISOString(),
  });
}

export function registerPlayerHandlers(playerNsp: Namespace): void {
  playerNsp.on("connection", async (socket: Socket) => {
    const screenId = socket.data.screenId as string | undefined;
    const orgId = socket.data.orgId as string | undefined;
    const groupId = socket.data.groupId as string | undefined;
    const isPreview = socket.data.preview === true;
    const playerSessionId = socket.data.playerSessionId as string | undefined;

    if (!screenId || !orgId) {
      socket.disconnect(true);
      return;
    }

    try {
      if (!socket.recovered) {
        await socket.join(`screen:${screenId}`);
        await socket.join(`org:${orgId}`);
        if (groupId) {
          await socket.join(`group:${groupId}`);
        }
      }

      if (!isPreview) {
        const connectedAt = new Date();
        await updatePresence(screenId, {
          status: "online",
          lastSeenAt: connectedAt,
          activePlayerSessionId: playerSessionId,
          activePlayerSessionLastSeenAt: connectedAt,
        });
        emitScreenStatus(playerNsp, orgId, screenId, "online", connectedAt);
      }

      if (!socket.recovered) {
        const manifest = await resolveManifestForScreen(screenId, new Date());
        socket.emit("content_update", { manifest: toPlayerManifest(manifest) });
      }
    } catch (error) {
      console.error("Failed to process player connection", error);
      socket.disconnect(true);
      return;
    }

    socket.on("player:request-state", async () => {
      try {
        if (!isPreview) {
          const requestedAt = new Date();
          await updatePresence(screenId, {
            status: "online",
            lastSeenAt: requestedAt,
            activePlayerSessionId: playerSessionId,
            activePlayerSessionLastSeenAt: requestedAt,
          });
        }
        const manifest = await resolveManifestForScreen(screenId, new Date());
        socket.emit("content_update", { manifest: toPlayerManifest(manifest) });
      } catch (error) {
        console.error("Failed to resolve requested manifest", error);
      }
    });

    socket.on("heartbeat", async (data: HeartbeatPayload) => {
      if (isPreview) {
        return;
      }
      await updatePresence(screenId, {
        status: "online",
        lastSeenAt: new Date(),
        currentItemId: data.currentItemId,
        activePlayerSessionId: playerSessionId,
        activePlayerSessionLastSeenAt: new Date(),
      });
    });

    socket.on("player:heartbeat", async (data: HeartbeatPayload) => {
      if (isPreview) {
        return;
      }
      await updatePresence(screenId, {
        status: "online",
        lastSeenAt: new Date(),
        currentItemId: data.currentItemId,
        activePlayerSessionId: playerSessionId,
        activePlayerSessionLastSeenAt: new Date(),
      });
    });

    socket.on("player:error", async (payload: PlayerErrorPayload) => {
      if (isPreview) {
        return;
      }
      await updatePresence(screenId, {
        error: {
          code: payload?.code ?? null,
          message: payload?.message ?? null,
          at: new Date(),
        },
      });
    });

    socket.on("disconnect", async (reason) => {
      if (isPreview) {
        return;
      }
      const disconnectedAt = new Date();
      await updatePresence(screenId, {
        status: "offline",
        lastSeenAt: disconnectedAt,
        disconnectEventAt: disconnectedAt,
      });
      emitScreenStatus(playerNsp, orgId, screenId, "offline", disconnectedAt);
      console.log(`[/player] ${screenId} disconnected: ${reason}`);
    });
  });
}
