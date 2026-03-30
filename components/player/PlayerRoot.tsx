"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useActorRef, useSelector } from "@xstate/react";
import { type SnapshotFrom } from "xstate";

import { ContentRenderer } from "@/components/player/ContentRenderer";
import { NoContentScreen } from "@/components/player/NoContentScreen";
import { OfflineScreen } from "@/components/player/OfflineScreen";
import { playerMachine } from "@/lib/player/playerMachine";
import {
  destroyPlayerSocket,
  getPlayerSocket,
  initPlayerSocket,
} from "@/lib/player/socketClient";
import { videoPool } from "@/lib/player/videoPool";
import type { ScreenConnectivityView } from "@/lib/screens/connectivity";

interface PlayerRootProps {
  screenId: string;
  token: string;
  previewMode?: boolean;
}

type DeviceInfo = {
  screenId: string;
  name: string;
  status: "online" | "offline" | "pending";
  connectivity?: ScreenConnectivityView;
  disconnectPolicy?: "keep_cache" | "show_default";
  lastSeenAt: string | null;
  updatedAt: string | null;
  helpEmail: string;
};

function isSamePlaybackProgram(
  currentManifest: PlayerSnapshot["context"]["manifest"],
  nextManifest: PlayerSnapshot["context"]["manifest"],
): boolean {
  if (!currentManifest || !nextManifest) {
    return false;
  }

  const currentItems = currentManifest.items ?? [];
  const nextItems = nextManifest.items ?? [];

  if (currentItems.length !== nextItems.length) {
    return false;
  }

  const currentLoop = currentManifest.loop ?? true;
  const nextLoop = nextManifest.loop ?? true;
  const currentStop = currentManifest.stopOnLastItem ?? false;
  const nextStop = nextManifest.stopOnLastItem ?? false;
  const currentFitOverride = currentManifest.fitModeOverride ?? null;
  const nextFitOverride = nextManifest.fitModeOverride ?? null;
  const currentBgOverride = currentManifest.backgroundColorOverride ?? null;
  const nextBgOverride = nextManifest.backgroundColorOverride ?? null;
  const currentTransitionType = currentManifest.transitionType ?? "fade";
  const nextTransitionType = nextManifest.transitionType ?? "fade";
  const currentTransitionMs = currentManifest.transitionMs ?? 500;
  const nextTransitionMs = nextManifest.transitionMs ?? 500;

  if (
    currentLoop !== nextLoop ||
    currentStop !== nextStop ||
    currentFitOverride !== nextFitOverride ||
    currentBgOverride !== nextBgOverride ||
    currentTransitionType !== nextTransitionType ||
    currentTransitionMs !== nextTransitionMs
  ) {
    return false;
  }

  for (let index = 0; index < currentItems.length; index += 1) {
    const currentItem = currentItems[index];
    const nextItem = nextItems[index];
    if (!currentItem || !nextItem) {
      return false;
    }

    if (
      currentItem.id !== nextItem.id ||
      currentItem.type !== nextItem.type ||
      currentItem.url !== nextItem.url ||
      currentItem.urlSubtype !== nextItem.urlSubtype ||
      currentItem.interactive !== nextItem.interactive ||
      currentItem.fitMode !== nextItem.fitMode ||
      currentItem.backgroundColor !== nextItem.backgroundColor ||
      currentItem.durationMs !== nextItem.durationMs
    ) {
      return false;
    }
  }

  return true;
}

type PlayerSnapshot = SnapshotFrom<typeof playerMachine>;

const selectPlayback = (snapshot: PlayerSnapshot) => snapshot.value.playback;
const selectConnectivity = (snapshot: PlayerSnapshot) => snapshot.value.connectivity;
const selectManifest = (snapshot: PlayerSnapshot) => snapshot.context.manifest;
const selectCurrentItemIndex = (snapshot: PlayerSnapshot) =>
  snapshot.context.currentItemIndex;

export function PlayerRoot({ screenId, token, previewMode = false }: PlayerRootProps) {
  const actorRef = useActorRef(playerMachine);
  const playbackState = useSelector(actorRef, selectPlayback);
  const connectivityState = useSelector(actorRef, selectConnectivity);
  const manifest = useSelector(actorRef, selectManifest);
  const currentItemIndex = useSelector(actorRef, selectCurrentItemIndex);
  const workerRef = useRef<Worker | null>(null);
  const [showSupportPanel, setShowSupportPanel] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [sessionRevoked, setSessionRevoked] = useState(false);
  const [sessionGateReady, setSessionGateReady] = useState(previewMode);
  const [sessionErrorMessage, setSessionErrorMessage] = useState<string | null>(null);
  const [lastManifestUpdateAt, setLastManifestUpdateAt] = useState<string | null>(null);
  const [renderCycle, setRenderCycle] = useState(0);
  const manifestRef = useRef<PlayerSnapshot["context"]["manifest"] | null>(null);
  const playbackStateRef = useRef(playbackState);
  const currentItemIndexRef = useRef(currentItemIndex);

  useEffect(() => {
    manifestRef.current = manifest;
  }, [manifest]);

  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  useEffect(() => {
    currentItemIndexRef.current = currentItemIndex;
  }, [currentItemIndex]);

  useEffect(() => {
    if (playbackState === "loading") {
      setRenderCycle((previous) => previous + 1);
    }
  }, [playbackState]);

  useEffect(() => {
    videoPool.init();
    return () => {
      videoPool.destroy();
    };
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL("../../lib/player/timingWorker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<{ type: string }>) => {
      if (event.data.type === "EXPIRED") {
        actorRef.send({ type: "ITEM_TIMER_EXPIRED" });
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [actorRef]);

  useEffect(() => {
    if (playbackState !== "playing" || !manifest) {
      workerRef.current?.postMessage({ type: "CANCEL" });
      return;
    }

    const currentItem = manifest.items[currentItemIndex] ?? manifest.items[0];
    if (!currentItem || !workerRef.current) {
      return;
    }

    workerRef.current.postMessage({
      type: "START",
      itemId: currentItem.id,
      durationMs: currentItem.durationMs,
    });

    return () => {
      workerRef.current?.postMessage({ type: "CANCEL" });
    };
  }, [currentItemIndex, manifest, playbackState]);

  useEffect(() => {
    let cancelled = false;

    if (previewMode) {
      setSessionGateReady(true);
      setSessionRevoked(false);
      setSessionErrorMessage(null);
      return () => {
        cancelled = true;
      };
    }

    const claimSession = async () => {
      setSessionGateReady(false);
      setSessionRevoked(false);
      setSessionErrorMessage(null);

      try {
        const response = await fetch("/api/player/session/claim", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ screenId, token }),
        });

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string; code?: string }
            | null;

          const errorCode = payload?.code?.toUpperCase();
          const message =
            payload?.error ??
            (errorCode === "SESSION_LOCKED"
              ? "Sessione monitor gia attiva su un altro browser"
              : "Sessione monitor non valida");

          setSessionRevoked(true);
          setSessionErrorMessage(message);
          setSessionGateReady(false);
          return;
        }

        setSessionGateReady(true);
      } catch {
        if (cancelled) {
          return;
        }

        setSessionRevoked(true);
        setSessionErrorMessage("Errore di autenticazione sessione monitor");
        setSessionGateReady(false);
      }
    };

    void claimSession();

    return () => {
      cancelled = true;
    };
  }, [previewMode, screenId, token]);

  useEffect(() => {
    if (!previewMode && !sessionGateReady) {
      return;
    }

    initPlayerSocket(screenId, token, {
      onConnected: (recovered) => {
        actorRef.send({ type: "WS_CONNECTED", recovered });
      },
      onDisconnected: (reason) => {
        actorRef.send({ type: "WS_DISCONNECTED" });

        const normalized = String(reason ?? "").toUpperCase();
        if (
          normalized.includes("INVALID_TOKEN") ||
          normalized.includes("AUTH_ERROR") ||
          normalized.includes("MISSING_CREDENTIALS") ||
          normalized.includes("MISSING_PLAYER_SESSION") ||
          normalized.includes("SESSION_LOCKED")
        ) {
          setSessionRevoked(true);
          setSessionErrorMessage(
            normalized.includes("SESSION_LOCKED")
              ? "Sessione monitor gia attiva su un altro browser"
              : "Sessione monitor non valida",
          );
          destroyPlayerSocket();
          actorRef.send({ type: "NO_CONTENT" });
        }
      },
      onContentUpdate: (data) => {
        if (!data.manifest?.items?.length) {
          actorRef.send({ type: "NO_CONTENT" });
          return;
        }

        // Ignore duplicates only while already playing; if we are in fallback/error
        // we must allow a same-manifest refresh to restart playback.
        if (
          playbackStateRef.current === "playing" &&
          isSamePlaybackProgram(manifestRef.current, data.manifest)
        ) {
          return;
        }

        manifestRef.current = data.manifest;
        setLastManifestUpdateAt(new Date().toISOString());
        actorRef.send({ type: "CONTENT_UPDATE", manifest: data.manifest });
      },
      onForceOverride: (data) => {
        if (!data.manifest?.items?.length) {
          actorRef.send({ type: "NO_CONTENT" });
          return;
        }

        if (
          playbackStateRef.current === "playing" &&
          isSamePlaybackProgram(manifestRef.current, data.manifest)
        ) {
          return;
        }

        manifestRef.current = data.manifest;
        setLastManifestUpdateAt(new Date().toISOString());
        actorRef.send({ type: "FORCE_OVERRIDE", manifest: data.manifest });
      },
      onOverrideClear: () => {
        actorRef.send({ type: "NO_CONTENT" });
      },
      onClockSync: (data) => {
        actorRef.send({ type: "CLOCK_SYNC", serverTs: data.serverTs });
      },
      onRemoteRefresh: () => {
        window.location.reload();
      },
    }, { previewMode });

    return () => {
      destroyPlayerSocket();
    };
  }, [actorRef, previewMode, sessionGateReady, screenId, token]);

  useEffect(() => {
    if (previewMode) {
      return;
    }

    const fetchDeviceInfo = async () => {
      try {
        const response = await fetch(
          `/api/player/device-info?screenId=${encodeURIComponent(screenId)}&token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as DeviceInfo;
        setDeviceInfo(payload);
      } catch {
        // Best-effort fetch: panel will fallback to available local data.
      }
    };

    void fetchDeviceInfo();
  }, [previewMode, screenId, token]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setShowSupportPanel((previous) => !previous);
        return;
      }

      if (event.key === "Escape") {
        setShowSupportPanel(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (previewMode) {
      return;
    }

    const configuredPollMs = Number.parseInt(
      process.env.NEXT_PUBLIC_PLAYER_STATE_POLL_MS ?? "5000",
      10,
    );
    const statePollMs = Number.isFinite(configuredPollMs) && configuredPollMs > 0
      ? configuredPollMs
      : 5000;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      const socket = getPlayerSocket();
      if (socket) {
        socket.emit("player:request-state", { screenId });
      }
    };

    const reconnectIntervalMs = 5000;

    const reconnectIntervalId = window.setInterval(() => {
      const socket = getPlayerSocket();
      if (!socket || socket.connected) {
        return;
      }

      socket.connect();
    }, reconnectIntervalMs);

    const handleOnline = () => {
      const socket = getPlayerSocket();
      if (!socket?.connected) {
        socket?.connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    const syncIntervalId = window.setInterval(() => {
      const socket = getPlayerSocket();
      if (socket?.connected) {
        socket.emit("player:request-state", { screenId });
        if (!previewMode) {
          socket.emit("heartbeat", {
            currentItemId: manifestRef.current?.items?.[currentItemIndexRef.current]?.id,
          });
        }
      }
    }, statePollMs);

    const reportRuntimeError = (code: string, message: string) => {
      const socket = getPlayerSocket();
      if (!socket?.connected) {
        return;
      }

      socket.emit("player:error", {
        code,
        message: message.slice(0, 600),
      });
    };

    const onWindowError = (event: ErrorEvent) => {
      if (!previewMode) {
        reportRuntimeError("window_error", event.message || "Unknown runtime error");
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason =
        typeof event.reason === "string"
          ? event.reason
          : event.reason instanceof Error
            ? event.reason.message
            : "Unhandled promise rejection";

      if (!previewMode) {
        reportRuntimeError("unhandled_rejection", reason);
      }
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.clearInterval(syncIntervalId);
      window.clearInterval(reconnectIntervalId);
    };
  }, [previewMode, screenId]);

  const isConnecting =
    connectivityState === "connecting" || connectivityState === "reconnecting";

  const defaultDisconnectPolicy =
    process.env.NEXT_PUBLIC_PLAYER_DISCONNECT_POLICY === "show_default"
      ? "show_default"
      : "keep_cache";
  const disconnectPolicy = deviceInfo?.disconnectPolicy ?? defaultDisconnectPolicy;
  const hasRenderableItem = Boolean(
    manifest?.items?.length &&
      manifest.items.some((item) => item.type === "layout" || Boolean(item.url)),
  );
  const allowCachedPlaybackWhileDisconnected = !sessionRevoked && disconnectPolicy === "keep_cache";
  const showNoContent =
    sessionRevoked ||
    (isConnecting && disconnectPolicy === "show_default") ||
    (!isConnecting && (playbackState === "noContent" || !hasRenderableItem));
  const showCompactReconnectBadge =
    isConnecting &&
    !previewMode &&
    allowCachedPlaybackWhileDisconnected &&
    hasRenderableItem &&
    !showNoContent;

  const handleLoad = useCallback(() => {
    actorRef.send({ type: "LOAD_SUCCESS" });
  }, [actorRef]);

  const handleError = useCallback(() => {
    actorRef.send({ type: "LOAD_ERROR" });
  }, [actorRef]);

  const uniqueCode = screenId;
  const monitorName = deviceInfo?.name || `Monitor ${screenId.slice(-6)}`;
  const helpEmail = deviceInfo?.helpEmail || "support@ciao.local";

  const formatDateTime = (value: string | null): string => {
    if (!value) {
      return "n/d";
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "n/d";
    }

    return parsed.toLocaleString();
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }} data-state={playbackState}>
      <div id="player-mount" style={{ width: "100%", height: "100%" }} />
      {(!isConnecting || allowCachedPlaybackWhileDisconnected) && hasRenderableItem && !showNoContent ? (
        <ContentRenderer
          key={`${manifest?.scheduleId ?? "manifest"}-${currentItemIndex}-${renderCycle}`}
          manifest={manifest}
          currentItemIndex={currentItemIndex}
          onLoad={handleLoad}
          onError={handleError}
          screenId={screenId}
          screenToken={token}
          previewMode={previewMode}
        />
      ) : null}
      {showCompactReconnectBadge ? <OfflineScreen compact /> : null}
      {isConnecting && !previewMode && disconnectPolicy !== "show_default" && !sessionRevoked && !showCompactReconnectBadge ? <OfflineScreen /> : null}
      {showNoContent ? (
        <NoContentScreen
          title={sessionRevoked ? "Monitor bloccato" : "Ciao"}
          subtitle={
            sessionRevoked
              ? "Sessione esclusiva gia in uso"
              : "Digital Signage Player"
          }
          badgeText={sessionRevoked ? (sessionErrorMessage ?? "Sessione non disponibile") : "Nessuna pianificazione attiva"}
        />
      ) : null}

      {showSupportPanel ? (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            minWidth: 360,
            maxWidth: "min(92vw, 460px)",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.22)",
            background: "rgba(10,10,10,0.82)",
            color: "#f5f5f5",
            padding: "12px 14px",
            boxShadow: "0 14px 40px rgba(0,0,0,0.5)",
            backdropFilter: "blur(3px)",
            fontFamily: "var(--font-geist-mono), monospace",
            zIndex: 9999,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <strong style={{ letterSpacing: "0.03em" }}>Support Panel</strong>
            <span style={{ opacity: 0.72 }}>Ctrl+Shift+S</span>
          </div>

          <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
            <div><strong>Monitor:</strong> {monitorName}</div>
            <div><strong>Codice univoco:</strong> {uniqueCode}</div>
            <div>
              <strong>Stato:</strong>{" "}
              {deviceInfo?.connectivity
                ? `${deviceInfo.connectivity.state}${deviceInfo.connectivity.substate ? ` (${deviceInfo.connectivity.substate})` : ""}`
                : deviceInfo?.status ?? connectivityState}
            </div>
            <div><strong>Ultimo update playlist:</strong> {formatDateTime(lastManifestUpdateAt ?? manifest?.resolvedAt ?? null)}</div>
            <div><strong>Ultimo heartbeat:</strong> {formatDateTime(deviceInfo?.lastSeenAt ?? null)}</div>
            <div><strong>Ultimo update screen:</strong> {formatDateTime(deviceInfo?.updatedAt ?? null)}</div>
            <div><strong>Help admin:</strong> {helpEmail}</div>
          </div>

          <div style={{ marginTop: 8, opacity: 0.72, fontSize: 12 }}>
            Premi Esc per chiudere.
          </div>
        </div>
      ) : null}
    </div>
  );
}
