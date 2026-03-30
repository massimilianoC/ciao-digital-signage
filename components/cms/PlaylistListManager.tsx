"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Trash2, PauseCircle, PlayCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { PlaylistStatusBadge } from "@/components/cms/PlaylistStatusBadge";
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
import { Card, CardContent } from "@/components/ui/card";

export interface PlaylistListItem {
  _id: string;
  name: string;
  status: "active" | "suspended";
  itemCount: number;
  updatedAt: string;
}

type BulkAction =
  | { type: "delete" }
  | { type: "setStatus"; status: "active" | "suspended" };

interface PlaylistListManagerProps {
  playlists: PlaylistListItem[];
}

export function PlaylistListManager({ playlists }: PlaylistListManagerProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isRunningAction, setIsRunningAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderedPlaylists = useMemo(
    () => [...playlists].sort((a, b) => a.name.localeCompare(b.name)),
    [playlists],
  );

  const selectedCount = selectedIds.size;
  const allSelected = orderedPlaylists.length > 0 && selectedCount === orderedPlaylists.length;

  const toggleSelection = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(orderedPlaylists.map((playlist) => playlist._id)));
  };

  const runBulkAction = async (action: BulkAction) => {
    if (selectedIds.size === 0 || isRunningAction) {
      return;
    }

    setIsRunningAction(true);
    setError(null);

    const ids = Array.from(selectedIds);

    try {
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          if (action.type === "delete") {
            const response = await fetch(`/api/playlists/${id}`, { method: "DELETE" });
            if (!response.ok && response.status !== 204) {
              throw new Error(`Delete failed for ${id}`);
            }
            return;
          }

          const response = await fetch(`/api/playlists/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: action.status }),
          });

          if (!response.ok) {
            throw new Error(`Status update failed for ${id}`);
          }
        }),
      );

      const rejected = results.filter((result) => result.status === "rejected").length;
      if (rejected > 0) {
        throw new Error(`Operation completed with ${rejected} failure(s)`);
      }

      setSelectedIds(new Set());
      router.refresh();
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Bulk action failed");
    } finally {
      setIsRunningAction(false);
    }
  };

  if (orderedPlaylists.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">No playlists yet. Create your first playlist.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3 max-w-4xl">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-border"
            />
            Select all
          </label>

          <span className="text-sm text-muted-foreground">Selected: {selectedCount}</span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                disabled={selectedCount === 0 || isRunningAction}
              >
                <PauseCircle className="h-4 w-4" />
                Suspend
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Suspend selected playlists</AlertDialogTitle>
                  <AlertDialogDescription>
                    Suspend {selectedCount} playlist(s)? Suspended playlists are excluded from runtime scheduling.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void runBulkAction({ type: "setStatus", status: "suspended" })}>
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                disabled={selectedCount === 0 || isRunningAction}
              >
                <PlayCircle className="h-4 w-4" />
                Publish
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Publish selected playlists</AlertDialogTitle>
                  <AlertDialogDescription>
                    Reactivate {selectedCount} playlist(s) and include them in runtime scheduling?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void runBulkAction({ type: "setStatus", status: "active" })}>
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-destructive px-3 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none"
                disabled={selectedCount === 0 || isRunningAction}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete selected playlists</AlertDialogTitle>
                  <AlertDialogDescription>
                    Delete {selectedCount} playlist(s)? They will be removed permanently from all scheduled streams (global, groups, and screens). This operation cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={() => void runBulkAction({ type: "delete" })}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-3">
        {orderedPlaylists.map((playlist) => {
          const selected = selectedIds.has(playlist._id);

          return (
            <Card key={playlist._id} className={selected ? "ring-1 ring-ring" : undefined}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelection(playlist._id)}
                    className="mt-1 h-4 w-4 rounded border-border"
                    aria-label={`Select playlist ${playlist.name}`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/playlists/${playlist._id}`} className="font-medium hover:underline">
                        {playlist.name}
                      </Link>
                      <PlaylistStatusBadge status={playlist.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {playlist.itemCount} items · Updated {formatDistanceToNow(new Date(playlist.updatedAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
