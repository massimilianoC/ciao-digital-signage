"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Trash2 } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PlaylistMetaBoxProps {
  playlistId: string;
  status: "active" | "suspended";
  itemCount: number;
  totalDurationSeconds: number;
  totalSizeBytes: number;
  createdAt: string;
  updatedAt: string;
  lastEditedBy?: string | null;
  lastPlaybackAt?: string | null;
}

export function PlaylistMetaBox({
  playlistId,
  status: initialStatus,
  itemCount,
  totalDurationSeconds,
  totalSizeBytes,
  createdAt,
  updatedAt,
  lastEditedBy,
  lastPlaybackAt,
}: PlaylistMetaBoxProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextStatus = status === "active" ? "suspended" : "active";
  const totalMinutes = Math.floor(totalDurationSeconds / 60);
  const remainingSeconds = totalDurationSeconds % 60;
  const totalSizeMb = totalSizeBytes > 0 ? (totalSizeBytes / 1024 / 1024).toFixed(2) : "0.00";

  const handleStatusChange = async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/playlists/${playlistId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        throw new Error("Unable to update playlist status");
      }

      setStatus(nextStatus);
      router.refresh();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to update playlist status");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/playlists/${playlistId}`, { method: "DELETE" });
      if (!response.ok && response.status !== 204) {
        throw new Error("Unable to delete playlist");
      }

      router.push("/playlists");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete playlist");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Playlist status</CardTitle>
          <PlaylistStatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm text-muted-foreground">
          <div className="flex items-center justify-between gap-3">
            <span>Items</span>
            <span className="font-medium text-foreground">{itemCount}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Total duration</span>
            <span className="font-medium text-foreground">{totalMinutes}m {remainingSeconds}s</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Total size</span>
            <span className="font-medium text-foreground">{totalSizeMb} MB</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Created</span>
            <span className="font-medium text-foreground">
              {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Updated</span>
            <span className="font-medium text-foreground">
              {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Last editor</span>
            <span className="font-medium text-foreground">{lastEditedBy || "Not tracked yet"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Last playback</span>
            <span className="font-medium text-foreground">
              {lastPlaybackAt
                ? formatDistanceToNow(new Date(lastPlaybackAt), { addSuffix: true })
                : "No recent playback"}
            </span>
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Suspended playlists are ignored by runtime resolution for schedules, defaults, and force overrides until reactivated.
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            variant={status === "active" ? "outline" : "default"}
            className="w-full"
            onClick={() => void handleStatusChange()}
            disabled={saving || deleting}
          >
            {saving ? "Updating..." : status === "active" ? "Suspend playlist" : "Activate playlist"}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={saving || deleting}
            >
              <Trash2 className="h-4 w-4" />
              Delete playlist
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete playlist</AlertDialogTitle>
                <AlertDialogDescription>
                  Delete this playlist permanently? It will be removed from all scheduled streams (global, groups, and screens) and this action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                >
                  {deleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}