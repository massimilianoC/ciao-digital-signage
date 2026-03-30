"use client";

import { useEffect, useState } from "react";

import { getContentDisplayName, type ContentItem } from "@/components/cms/types";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ContentPreviewModalProps {
  item: ContentItem | null;
  open: boolean;
  onItemUpdated?: (item: ContentItem) => void;
  onItemDeleted?: (itemId: string) => void;
  onOpenChange: (open: boolean) => void;
}

interface ContentUsagePlaylist {
  id: string;
  name: string;
  status: "active" | "suspended";
  contentUsageCount: number;
  updatedAt: string;
  href: string;
}

interface ContentUsageSchedule {
  id: string;
  name: string;
  scope: "org" | "group" | "screen";
  scopeId: string;
  playlistId: string;
  playlistName: string;
  updatedAt: string;
  href: string;
}

interface ContentUsageScreen {
  id: string;
  name: string;
  status: "online" | "offline" | "pending";
  lastSeenAt: string | null;
  reasons: string[];
  href: string;
}

interface ContentUsageResponse {
  playlists: ContentUsagePlaylist[];
  schedules: ContentUsageSchedule[];
  screens: ContentUsageScreen[];
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) {
    return "Not available";
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatMediaFormat(mimeType?: string): string {
  if (!mimeType) {
    return "Unknown";
  }

  const [, subtype] = mimeType.split("/");
  return (subtype ?? mimeType).toUpperCase();
}

function buildPdfPreviewUrl(url: string, interactive: boolean): string {
  const base = url.split("#")[0] ?? url;
  const hash = interactive
    ? "page=1&zoom=page-fit"
    : "toolbar=0&navpanes=0&scrollbar=0&page=1&zoom=page-fit";
  return `${base}#${hash}`;
}

export function ContentPreviewModal({ item, open, onItemUpdated, onItemDeleted, onOpenChange }: ContentPreviewModalProps) {
  const [alias, setAlias] = useState("");
  const [savingAlias, setSavingAlias] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [usageTab, setUsageTab] = useState<"playlists" | "runtime">("playlists");
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usage, setUsage] = useState<ContentUsageResponse | null>(null);
  const [usagePlaylistsOpen, setUsagePlaylistsOpen] = useState(false);
  const [usageSchedulesOpen, setUsageSchedulesOpen] = useState(false);
  const [usageScreensOpen, setUsageScreensOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    setAlias(item?.alias ?? "");
    setSaveError(null);
    setActionError(null);
    setActionSuccess(null);
    setUsagePlaylistsOpen(false);
    setUsageSchedulesOpen(false);
    setUsageScreensOpen(false);
  }, [item]);

  useEffect(() => {
    if (!open || !item?._id) {
      setUsage(null);
      setUsageError(null);
      setUsageLoading(false);
      return;
    }

    let mounted = true;
    setUsageLoading(true);
    setUsageError(null);

    void fetch(`/api/content/${item._id}/usage`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Unable to load usage information");
        }

        const payload = (await response.json()) as ContentUsageResponse;
        if (!mounted) {
          return;
        }

        setUsage(payload);
      })
      .catch((error: unknown) => {
        if (!mounted) {
          return;
        }

        setUsageError(error instanceof Error ? error.message : "Unable to load usage information");
      })
      .finally(() => {
        if (mounted) {
          setUsageLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [open, item?._id]);

  const handleAliasSave = async () => {
    if (!item || savingAlias) {
      return;
    }

    setSavingAlias(true);
    setSaveError(null);

    try {
      const response = await fetch(`/api/content/${item._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to save alias");
      }

      const updated = (await response.json()) as ContentItem;
      onItemUpdated?.(updated);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save alias");
    } finally {
      setSavingAlias(false);
    }
  };

  const handleStatusChange = async (nextStatus: "active" | "suspended") => {
    if (!item || savingStatus) {
      return;
    }

    setSavingStatus(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const response = await fetch(`/api/content/${item._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to update media status");
      }

      const updated = (await response.json()) as ContentItem;
      onItemUpdated?.(updated);
      setActionSuccess(nextStatus === "suspended" ? "Media suspended successfully." : "Media activated successfully.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update media status");
    } finally {
      setSavingStatus(false);
    }
  };

  const handleDelete = async () => {
    if (!item || deleting) {
      return;
    }

    setDeleting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const response = await fetch(`/api/content?id=${encodeURIComponent(item._id)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to delete media");
      }

      onItemDeleted?.(item._id);
      onOpenChange(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete media");
    } finally {
      setDeleting(false);
    }
  };

  const displayName = item ? getContentDisplayName(item) : "";
  const isPdf = !!item && (
    item.urlSubtype === "pdf" ||
    item.mimeType === "application/pdf" ||
    /\.pdf($|[?#])/i.test(item.url)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{displayName}</DialogTitle>
        </DialogHeader>

        {item && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_320px]">
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-2">
                {item.type === "image" && (
                  <img src={item.url} alt={displayName} className="w-full max-h-96 object-contain rounded" />
                )}
                {item.type === "video" && <video src={item.url} controls muted className="w-full max-h-96 rounded" />}
                {item.type === "url" && isPdf && (
                  <div className="w-full h-[32rem] rounded overflow-hidden bg-black flex items-center justify-center">
                    <iframe
                      src={buildPdfPreviewUrl(item.url, false)}
                      className="w-full h-full border-0"
                      title={`${displayName} PDF preview`}
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                {(item.type === "url" || item.type === "widget") && (
                  !isPdf && (
                  <iframe
                    src={item.url}
                    className="w-full h-96 rounded border-0"
                    sandbox="allow-scripts allow-same-origin"
                    title={`${displayName} preview`}
                  />
                  )
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Badge>{item.type}</Badge>
                {item.tags?.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>

              <section className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">Usage</h3>
                    <p className="text-xs text-muted-foreground">Where this media is used in playlists and runtime.</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={usageTab === "playlists" ? "default" : "outline"}
                      onClick={() => setUsageTab("playlists")}
                    >
                      Playlists
                    </Button>
                    <Button
                      size="sm"
                      variant={usageTab === "runtime" ? "default" : "outline"}
                      onClick={() => setUsageTab("runtime")}
                    >
                      Screens & Schedules
                    </Button>
                  </div>
                </div>

                {usageLoading ? <p className="text-sm text-muted-foreground">Loading usage...</p> : null}
                {usageError ? <p className="text-sm text-destructive">{usageError}</p> : null}

                {!usageLoading && !usageError && usage ? (
                  usageTab === "playlists" ? (
                    <section className="space-y-2">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-left"
                        onClick={() => setUsagePlaylistsOpen((current) => !current)}
                      >
                        <span className="text-sm font-medium">Playlists ({usage.playlists.length})</span>
                        <span className="text-xs text-muted-foreground">{usagePlaylistsOpen ? "Hide" : "Show"}</span>
                      </button>

                      {usagePlaylistsOpen ? (
                        usage.playlists.length === 0 ? (
                          <p className="text-sm text-muted-foreground">This media is not used in any playlist yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {usage.playlists.map((playlist) => (
                              <div key={playlist.id} className="rounded-md border border-border bg-card p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium">{playlist.name}</p>
                                  <Badge variant={playlist.status === "active" ? "default" : "secondary"}>{playlist.status}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Used {playlist.contentUsageCount} time{playlist.contentUsageCount === 1 ? "" : "s"} in this playlist
                                </p>
                                <div className="mt-2">
                                  <a
                                    href={playlist.href}
                                    className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent"
                                  >
                                    Apri playlist
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      ) : null}
                    </section>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-left"
                          onClick={() => setUsageSchedulesOpen((current) => !current)}
                        >
                          <span className="text-sm font-medium">Schedules ({usage.schedules.length})</span>
                          <span className="text-xs text-muted-foreground">{usageSchedulesOpen ? "Hide" : "Show"}</span>
                        </button>
                        {usageSchedulesOpen ? (
                          <div className="space-y-2">
                            {usage.schedules.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No active schedule currently references playlists containing this media.</p>
                            ) : (
                              usage.schedules.map((schedule) => (
                                <div key={schedule.id} className="rounded-md border border-border bg-card p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium">{schedule.name}</p>
                                    <Badge variant="outline" className="uppercase">{schedule.scope}</Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">Playlist: {schedule.playlistName}</p>
                                  <div className="mt-2">
                                    <a
                                      href={`${schedule.href}?playlistId=${schedule.playlistId}`}
                                      className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent"
                                    >
                                      Apri schedule
                                    </a>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2 text-left"
                          onClick={() => setUsageScreensOpen((current) => !current)}
                        >
                          <span className="text-sm font-medium">Screens ({usage.screens.length})</span>
                          <span className="text-xs text-muted-foreground">{usageScreensOpen ? "Hide" : "Show"}</span>
                        </button>
                        {usageScreensOpen ? (
                          <div className="space-y-2">
                            {usage.screens.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No screens are currently linked through default playlist or active schedules.</p>
                            ) : (
                              usage.screens.map((screen) => (
                                <div key={screen.id} className="rounded-md border border-border bg-card p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium">{screen.name}</p>
                                    <Badge variant={screen.status === "online" ? "default" : "secondary"}>{screen.status}</Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {screen.reasons.length > 0 ? `Linked via ${screen.reasons.join(", ")}` : "Linked by active routing"}
                                  </p>
                                  <div className="mt-2">
                                    <a
                                      href={screen.href}
                                      className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent"
                                    >
                                      Apri monitor
                                    </a>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                ) : null}
              </section>
            </div>

            <aside className="space-y-4 rounded-lg border border-border bg-card p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Asset details</h3>
                <p className="text-xs text-muted-foreground">Metadata and editorial alias for this asset.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="content-alias">
                  Alias name
                </label>
                <Input
                  id="content-alias"
                  value={alias}
                  onChange={(event) => setAlias(event.target.value)}
                  placeholder="Optional display alias"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void handleAliasSave()} disabled={savingAlias}>
                    {savingAlias ? "Saving..." : "Save alias"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAlias("")} disabled={savingAlias}>
                    Clear
                  </Button>
                </div>
                {saveError ? <p className="text-xs text-destructive">{saveError}</p> : null}
              </div>

              <div className="grid gap-3 text-sm">
                <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">Original name</span>
                  <span className="min-w-0 break-words text-left font-medium">{item.name}</span>
                </div>
                <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">Format</span>
                  <span className="min-w-0 break-words text-left font-medium">{formatMediaFormat(item.mimeType)}</span>
                </div>
                <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">Weight</span>
                  <span className="min-w-0 break-words text-left font-medium">{formatFileSize(item.fileSizeBytes)}</span>
                </div>
                <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">Storage</span>
                  <span className="min-w-0 break-words text-left font-medium">Local public storage</span>
                </div>
                <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">Path</span>
                  <span className="min-w-0 break-all text-left font-medium" title={item.url}>{item.url || "N/A"}</span>
                </div>
                <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">Folder</span>
                  <span className="min-w-0 break-words text-left font-medium">{item.folder ?? "/"}</span>
                </div>
                <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">Uploaded</span>
                  <span className="min-w-0 break-words text-left font-medium">{new Date(item.createdAt).toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-[110px_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">Uploader</span>
                  <span className="min-w-0 break-words text-left font-medium">Not tracked yet</span>
                </div>
              </div>

              <section className="space-y-3 rounded-md border border-amber-400/40 bg-amber-400/10 p-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Editing toolkit</p>
                  <p className="text-xs text-muted-foreground">Dedicated actions for content adjustments and future AI-assisted edits.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="secondary" disabled>Crop</Button>
                  <Button size="sm" variant="secondary" disabled>Resize</Button>
                  <Button size="sm" variant="secondary" disabled>Scale</Button>
                  <Button size="sm" variant="secondary" disabled>Edit</Button>
                  <Button size="sm" variant="secondary" disabled className="col-span-2">AI assist</Button>
                </div>
                <div className="rounded-md border border-dashed border-border bg-background/50 p-2 text-[11px] text-muted-foreground">
                  EXIF and advanced metadata tools are planned in a separate technical panel.
                </div>
              </section>

              <section className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Lifecycle</p>
                <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-2 py-1.5 text-xs">
                  <span className="text-muted-foreground">Current status</span>
                  <Badge variant={(item.status ?? "active") === "active" ? "default" : "secondary"}>
                    {(item.status ?? "active") === "active" ? "active" : "suspended"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Suspended media is skipped in playback and shown dimmed in library. Delete permanently removes this media and detaches it from all playlists/scheduling contexts.
                </p>
                <div className="flex flex-wrap gap-2">
                  {(item.status ?? "active") === "active" ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" disabled={savingStatus}>Suspend media</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Suspend this media</AlertDialogTitle>
                          <AlertDialogDescription>
                            Suspended media becomes unavailable for playback and will be skipped in playlists until reactivated.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void handleStatusChange("suspended")}>
                            {savingStatus ? "Saving..." : "Confirm suspend"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" disabled={savingStatus}>Activate media</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Activate this media</AlertDialogTitle>
                          <AlertDialogDescription>
                            Activated media can be rendered again by playlists and scheduling rules.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void handleStatusChange("active")}>
                            {savingStatus ? "Saving..." : "Confirm activate"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="border-destructive/60 text-destructive hover:bg-destructive/10" disabled={deleting}>Delete permanently</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete media permanently</AlertDialogTitle>
                        <AlertDialogDescription>
                          This media will be deleted permanently and removed from all playlists and scheduling contexts where it is currently referenced.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void handleDelete()}>
                          {deleting ? "Deleting..." : "Confirm delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                {actionError ? <p className="text-xs text-destructive">{actionError}</p> : null}
                {actionSuccess ? <p className="text-xs text-emerald-300">{actionSuccess}</p> : null}
              </section>
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
