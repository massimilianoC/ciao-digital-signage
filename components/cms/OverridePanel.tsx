"use client";

import { AlertTriangle, Zap } from "lucide-react";
import { useMemo, useState } from "react";

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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PlaylistOption = {
  _id: string;
  name: string;
};

type ActiveOverrideState = {
  playlistId: string;
  playlistName: string;
  expiresAt: string | null;
};

interface OverridePanelProps {
  playlists: PlaylistOption[];
  screenCount: number;
  initialActiveOverride: ActiveOverrideState | null;
}

export function OverridePanel({ playlists, screenCount, initialActiveOverride }: OverridePanelProps) {
  const [playlistId, setPlaylistId] = useState("");
  const [expiryMinutes, setExpiryMinutes] = useState(30);
  const [broadcasting, setBroadcasting] = useState(false);
  const [activeOverride, setActiveOverride] = useState(initialActiveOverride);
  const [error, setError] = useState<string | null>(null);

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist._id === playlistId),
    [playlistId, playlists],
  );

  const handleBroadcast = async () => {
    if (!playlistId || broadcasting) {
      return;
    }

    setBroadcasting(true);
    setError(null);

    try {
      const response = await fetch("/api/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistId, expiryMinutes }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Failed to broadcast override");
      }

      const expiresAt = new Date(Date.now() + expiryMinutes * 60_000).toISOString();
      setActiveOverride({
        playlistId,
        playlistName: selectedPlaylist?.name ?? "Selected playlist",
        expiresAt,
      });
    } catch (broadcastError) {
      setError(broadcastError instanceof Error ? broadcastError.message : "Failed to broadcast override");
    } finally {
      setBroadcasting(false);
    }
  };

  const handleClearOverride = async () => {
    setError(null);
    const response = await fetch("/api/override", { method: "DELETE" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Failed to clear override");
      return;
    }
    setActiveOverride(null);
  };

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2 text-foreground">
          <Zap className="h-5 w-5 text-amber-500" />
          <h2 className="text-base font-semibold">Force Override Broadcast</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Immediately overrides schedules on {screenCount} screen{screenCount === 1 ? "" : "s"}. Use only
          for urgent messaging.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {activeOverride ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-950">Override Active</p>
              <p className="text-xs text-amber-900">Playlist: {activeOverride.playlistName}</p>
              <p className="text-xs text-amber-900">
                Expires:{" "}
                {activeOverride.expiresAt
                  ? new Date(activeOverride.expiresAt).toLocaleTimeString()
                  : "No automatic expiry"}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleClearOverride}>
              Cancel Override
            </Button>
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="override-playlist">Content Playlist</Label>
            <select
              id="override-playlist"
              value={playlistId}
              onChange={(event) => setPlaylistId(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select playlist...</option>
              {playlists.map((playlist) => (
                <option key={playlist._id} value={playlist._id}>
                  {playlist.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="override-expiry">Expiry (minutes)</Label>
            <Input
              id="override-expiry"
              type="number"
              min={1}
              max={480}
              value={expiryMinutes}
              onChange={(event) => setExpiryMinutes(Math.max(1, Number(event.target.value || 1)))}
              className="max-w-32"
            />
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <AlertDialog>
          <AlertDialogTrigger
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!playlistId || broadcasting}
          >
            <AlertTriangle className="h-4 w-4" />
            Broadcast Override to All Screens
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Force Override</AlertDialogTitle>
              <AlertDialogDescription>
                This action immediately overrides all active schedules on {screenCount} screen
                {screenCount === 1 ? "" : "s"}.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {selectedPlaylist ? (
              <div className="rounded-md bg-muted p-3 text-sm">
                <p>
                  <strong>Playlist:</strong> {selectedPlaylist.name}
                </p>
                <p>
                  <strong>Duration:</strong> {expiryMinutes} minute{expiryMinutes === 1 ? "" : "s"}
                </p>
              </div>
            ) : null}

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-foreground text-background hover:opacity-90"
                onClick={handleBroadcast}
                disabled={broadcasting || !playlistId}
              >
                {broadcasting ? "Broadcasting..." : "Yes, Broadcast Now"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
