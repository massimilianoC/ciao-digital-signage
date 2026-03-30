"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Clock, Monitor, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminSocket } from "@/lib/socket/admin-client";
import type { ScreenConnectivityView } from "@/lib/screens/connectivity";

export interface ScreenCardItem {
  _id: string;
  name: string;
  location?: string;
  timezone?: string;
  status?: "online" | "offline" | "pending";
  connectivity?: ScreenConnectivityView;
  lastSeen?: string;
  currentContent?: string;
}

interface ScreenStatusGridProps {
  initialScreens: ScreenCardItem[];
  orgId: string;
}

function useScreenPresence(initialScreens: ScreenCardItem[], orgId: string) {
  const [screens, setScreens] = useState(initialScreens);

  useEffect(() => {
    setScreens(initialScreens);
  }, [initialScreens]);

  useEffect(() => {
    const socket = getAdminSocket(orgId);

    const onOnline = ({ screenId }: { screenId: string }) => {
      setScreens((prev) =>
        prev.map((screen) =>
          screen._id === screenId
            ? { ...screen, status: "online", lastSeen: new Date().toISOString() }
            : screen,
        ),
      );
    };

    const onOffline = ({ screenId }: { screenId: string }) => {
      setScreens((prev) =>
        prev.map((screen) =>
          screen._id === screenId ? { ...screen, status: "offline" } : screen,
        ),
      );
    };

    const onStatus = ({
      screenId,
      status,
      lastSeenAt,
    }: {
      screenId: string;
      status: "online" | "offline";
      lastSeenAt?: string;
    }) => {
      setScreens((prev) =>
        prev.map((screen) =>
          screen._id === screenId
            ? {
                ...screen,
                status,
                lastSeen: lastSeenAt ?? screen.lastSeen,
              }
            : screen,
        ),
      );
    };

    socket.on("screen:online", onOnline);
    socket.on("screen:offline", onOffline);
    socket.on("screen:status", onStatus);

    const refreshFromApi = async () => {
      try {
        const response = await fetch("/api/screens", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as Array<{
          _id: string;
          name: string;
          location?: string;
          timezone?: string;
          status?: "online" | "offline" | "pending";
          connectivity?: ScreenConnectivityView;
          lastSeenAt?: string | null;
          currentItemId?: string | null;
        }>;

        setScreens(
          payload.map((screen) => ({
            _id: screen._id,
            name: screen.name,
            location: screen.location,
            timezone: screen.timezone,
            status: screen.status,
            connectivity: screen.connectivity,
            lastSeen: screen.lastSeenAt ?? undefined,
            currentContent: screen.currentItemId ?? undefined,
          })),
        );
      } catch {
        // Best effort: keep socket-driven state when API refresh fails.
      }
    };

    void refreshFromApi();
    const refreshInterval = window.setInterval(() => {
      void refreshFromApi();
    }, 10_000);

    return () => {
      socket.off("screen:online", onOnline);
      socket.off("screen:offline", onOffline);
      socket.off("screen:status", onStatus);
      window.clearInterval(refreshInterval);
    };
  }, [orgId]);

  return screens;
}

async function sendRemoteRefresh(screenId: string): Promise<void> {
  await fetch(`/api/screens/${screenId}/refresh`, { method: "POST" });
}

export function ScreenStatusGrid({ initialScreens, orgId }: ScreenStatusGridProps) {
  const screens = useScreenPresence(initialScreens, orgId);
  const [pendingRefresh, setPendingRefresh] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/screens/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to delete screen");
      }
      // Remove from local state so the card disappears immediately
      // (useScreenPresence keeps its own state copy via setScreens)
      // We trigger a page refresh to re-sync from the server
      window.location.reload();
    } catch (error) {
      console.error("Delete screen failed:", error);
      alert(error instanceof Error ? error.message : "Failed to delete screen");
    } finally {
      setDeletingId(null);
    }
  };

  const orderedScreens = useMemo(
    () => [...screens].sort((a, b) => a.name.localeCompare(b.name)),
    [screens],
  );

  if (orderedScreens.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed py-14 text-center text-muted-foreground">
        <Monitor className="mx-auto mb-3 h-10 w-10 opacity-40" />
        <p className="font-medium">No screens registered yet</p>
        <p className="mt-1 text-sm">
          <Link href="/screens/new" className="underline">
            Register your first screen
          </Link>{" "}
          to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {orderedScreens.map((screen) => {
        const connectivityState = screen.connectivity?.state;
        const connectivitySubstate = screen.connectivity?.substate;
        const isOnline = connectivityState
          ? connectivityState === "online"
          : screen.status === "online";

        const statusLabel = connectivityState
          ? `${connectivityState.toUpperCase()}${connectivitySubstate ? ` (${connectivitySubstate.toUpperCase()})` : ""}`
          : isOnline
            ? "ONLINE"
            : "OFFLINE";

        const statusClassName = connectivityState === "online"
          ? "bg-green-600 text-white"
          : connectivityState === "initialize"
            ? "bg-amber-500 text-white"
            : connectivitySubstate === "error"
              ? "bg-red-600 text-white"
              : connectivitySubstate === "warning"
                ? "bg-orange-500 text-white"
                : undefined;

        return (
          <Card key={screen._id} className="group relative transition-shadow hover:shadow-md">
            <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
              <AlertDialog>
                <AlertDialogTrigger
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-destructive hover:bg-destructive hover:text-destructive-foreground backdrop-blur-sm transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Screen</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete &ldquo;{screen.name}&rdquo;? This will remove
                      the screen and all its schedule assignments. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={deletingId === screen._id}
                      onClick={(e) => {
                        e.preventDefault();
                        handleDelete(screen._id);
                      }}
                    >
                      {deletingId === screen._id ? "Deleting…" : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/screens/${screen._id}`} className="block truncate text-sm font-medium hover:underline">
                    {screen.name}
                  </Link>
                  {screen.location ? (
                    <p className="truncate text-xs text-muted-foreground">{screen.location}</p>
                  ) : null}
                </div>
                <Badge
                  variant={isOnline ? "default" : "secondary"}
                  className={statusClassName}
                >
                  {statusLabel}
                </Badge>
              </div>

              {screen.currentContent ? (
                <p className="truncate text-xs text-muted-foreground">Playing: {screen.currentContent}</p>
              ) : null}

              {!isOnline && screen.lastSeen ? (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    Last seen {formatDistanceToNow(new Date(screen.lastSeen), { addSuffix: true })}
                  </span>
                </div>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={pendingRefresh === screen._id}
                onClick={async () => {
                  setPendingRefresh(screen._id);
                  try {
                    await sendRemoteRefresh(screen._id);
                  } finally {
                    setPendingRefresh((current) => (current === screen._id ? null : current));
                  }
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {pendingRefresh === screen._id ? "Sending..." : "Remote Refresh"}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
