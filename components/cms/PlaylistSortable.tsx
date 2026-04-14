"use client";

import { useEffect, useState } from "react";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Globe, GripVertical, Image as ImageIcon, Puzzle, Trash2, Video } from "lucide-react";

import { type PlaylistItem } from "@/components/cms/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface PlaylistSortableProps {
  playlistId: string;
  initialItems: PlaylistItem[];
  initialLoop: boolean;
  initialStopOnLastItem: boolean;
  initialFitModeOverride: "cover" | "fit" | null;
  initialBackgroundColorOverride: string | null;
  initialTransitionType: "cut" | "fade";
  initialTransitionMs: number;
}

function isVideoLikeItem(item: Pick<PlaylistItem, "type" | "urlSubtype">): boolean {
  return item.type === "video" || (item.type === "url" && item.urlSubtype === "video");
}

function SortableItem({
  item,
  onDurationChange,
  onDurationOverrideChange,
  onFitModeChange,
  onRemove,
}: {
  item: PlaylistItem;
  onDurationChange: (id: string, durationSeconds: number) => void;
  onDurationOverrideChange: (id: string, enabled: boolean) => void;
  onFitModeChange: (id: string, fitMode: "cover" | "fit") => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item._id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const previewSrc = item.thumbnailUrl ?? (item.type === "image" ? item.previewUrl : undefined);
  const isVideoLike = isVideoLikeItem(item);
  const durationOverrideEnabled = item.durationOverride === true || !isVideoLike;

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="mb-2">
        <CardContent className="p-3 flex items-center gap-3">
          <button
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
            type="button"
            aria-label={`Reorder ${item.name}`}
          >
            <GripVertical className="h-5 w-5" />
          </button>

          <div className="w-10 h-10 rounded bg-muted overflow-hidden shrink-0 flex items-center justify-center">
            {previewSrc ? (
              <img
                src={previewSrc}
                alt={item.name}
                className="h-full w-full object-cover"
              />
            ) : item.type === "image" ? (
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            ) : item.type === "video" ? (
              <Video className="h-4 w-4 text-muted-foreground" />
            ) : item.type === "url" ? (
              <Globe className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Puzzle className="h-4 w-4 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {item.type}
              {typeof item.fileSizeBytes === "number" ? ` · ${(item.fileSizeBytes / 1024 / 1024).toFixed(2)} MB` : ""}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={3600}
                value={item.durationSeconds}
                disabled={!durationOverrideEnabled}
                onChange={(event) => onDurationChange(item._id, Number(event.target.value))}
                className="w-20 text-sm"
              />
              <span className="text-xs text-muted-foreground">sec</span>
            </div>
            {isVideoLike && (
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={item.durationOverride === true}
                  onChange={(event) => onDurationOverrideChange(item._id, event.target.checked)}
                />
                Override durata
              </label>
            )}
          </div>

          {item.type === "image" && (
            <select
              value={item.fitMode ?? "cover"}
              onChange={(event) => onFitModeChange(item._id, event.target.value as "cover" | "fit")}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="cover">Cover</option>
              <option value="fit">Fit</option>
            </select>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemove(item._id)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function PlaylistSortable({
  playlistId,
  initialItems,
  initialLoop,
  initialStopOnLastItem,
  initialFitModeOverride,
  initialBackgroundColorOverride,
  initialTransitionType,
  initialTransitionMs,
}: PlaylistSortableProps) {
  const router = useRouter();
  const refreshTimerRef = useRef<number | null>(null);
  const [items, setItems] = useState(initialItems);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [loop, setLoop] = useState(initialLoop);
  const [stopOnLastItem, setStopOnLastItem] = useState(initialStopOnLastItem);
  const [fitModeOverride, setFitModeOverride] = useState<"cover" | "fit" | null>(initialFitModeOverride);
  const [backgroundColorOverride, setBackgroundColorOverride] = useState<string | null>(initialBackgroundColorOverride);
  const [transitionType, setTransitionType] = useState<"cut" | "fade">(initialTransitionType);
  const [transitionMs, setTransitionMs] = useState<number>(initialTransitionMs);

  // Keep local UI state aligned with server-refreshed props (router.refresh).
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    setLoop(initialLoop);
  }, [initialLoop]);

  useEffect(() => {
    setStopOnLastItem(initialStopOnLastItem);
  }, [initialStopOnLastItem]);

  useEffect(() => {
    setFitModeOverride(initialFitModeOverride);
  }, [initialFitModeOverride]);

  useEffect(() => {
    setBackgroundColorOverride(initialBackgroundColorOverride);
  }, [initialBackgroundColorOverride]);

  useEffect(() => {
    setTransitionType(initialTransitionType);
  }, [initialTransitionType]);

  useEffect(() => {
    setTransitionMs(initialTransitionMs);
  }, [initialTransitionMs]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const parseApiError = async (response: Response): Promise<string> => {
    const fallback = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload.error === "string" && payload.error.trim()) {
        return payload.error;
      }
      if (payload.error && typeof payload.error === "object") {
        return fallback;
      }
      return fallback;
    } catch {
      return fallback;
    }
  };

  const scheduleOverviewRefresh = () => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = window.setTimeout(() => {
      router.refresh();
      refreshTimerRef.current = null;
    }, 350);
  };

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const buildItemsPayload = (nextItems: PlaylistItem[]) => {
    return nextItems.map((item) => {
      const isVideoLike = isVideoLikeItem(item);
      const durationOverride = isVideoLike ? item.durationOverride === true : true;
      return {
        contentId: item.contentId,
        title: item.name,
        thumbnailUrl: item.thumbnailUrl,
        fitMode: item.fitMode ?? "cover",
        durationMs: durationOverride ? item.durationSeconds * 1000 : null,
        durationOverride,
      };
    });
  };

  const persistItems = async (
    nextItems: Array<{
      contentId: string;
      title: string;
      thumbnailUrl?: string;
      fitMode: "cover" | "fit";
      durationMs: number | null;
      durationOverride: boolean;
    }>,
  ) => {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/playlists/${playlistId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextItems }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      setLastSavedAt(Date.now());
      scheduleOverviewRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save playlist items";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const persistPlaybackSettings = async (
    nextLoop: boolean,
    nextStopOnLastItem: boolean,
    nextFitModeOverride: "cover" | "fit" | null = fitModeOverride,
    nextBackgroundColorOverride: string | null = backgroundColorOverride,
    nextTransitionType: "cut" | "fade" = transitionType,
    nextTransitionMs: number = transitionMs,
  ) => {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/playlists/${playlistId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loop: nextLoop,
          stopOnLastItem: nextLoop ? false : nextStopOnLastItem,
          fitModeOverride: nextFitModeOverride,
          backgroundColorOverride: nextBackgroundColorOverride,
          transitionType: nextTransitionType,
          transitionMs: nextTransitionMs,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      setLastSavedAt(Date.now());
      scheduleOverviewRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleLoopChange = async (checked: boolean) => {
    const prevLoop = loop;
    const prevStopOnLastItem = stopOnLastItem;

    setLoop(checked);
    const normalizedStopOnLastItem = checked ? false : stopOnLastItem;
    if (checked) {
      setStopOnLastItem(false);
    }

    try {
      await persistPlaybackSettings(checked, normalizedStopOnLastItem, fitModeOverride, backgroundColorOverride, transitionType, transitionMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save playback settings";
      setSaveError(message);
      setLoop(prevLoop);
      setStopOnLastItem(prevStopOnLastItem);
    }
  };

  const handleStopOnLastItemChange = async (checked: boolean) => {
    if (loop) {
      return;
    }

    const prevStopOnLastItem = stopOnLastItem;

    setStopOnLastItem(checked);
    try {
      await persistPlaybackSettings(loop, checked, fitModeOverride, backgroundColorOverride, transitionType, transitionMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save playback settings";
      setSaveError(message);
      setStopOnLastItem(prevStopOnLastItem);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = items.findIndex((item) => item._id === active.id);
    const newIndex = items.findIndex((item) => item._id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);

    setItems(reordered);
    void persistItems(buildItemsPayload(reordered));
  };

  const handleDurationChange = (id: string, durationSeconds: number) => {
    const safeDuration = Number.isFinite(durationSeconds) ? Math.max(1, durationSeconds) : 1;
    setItems((prev) => {
      const next = prev.map((item) => (item._id === id ? { ...item, durationSeconds: safeDuration } : item));
      void persistItems(buildItemsPayload(next));
      return next;
    });
  };

  const handleItemFitModeChange = (id: string, fitMode: "cover" | "fit") => {
    setItems((prev) => {
      const next = prev.map((item) => (item._id === id ? { ...item, fitMode } : item));
      void persistItems(buildItemsPayload(next));
      return next;
    });
  };

  const handleDurationOverrideChange = (id: string, enabled: boolean) => {
    setItems((prev) => {
      const next = prev.map((item) => (item._id === id ? { ...item, durationOverride: enabled } : item));
      void persistItems(buildItemsPayload(next));
      return next;
    });
  };

  const handleGlobalFitModeOverrideChange = async (value: "none" | "cover" | "fit") => {
    const nextOverride = value === "none" ? null : value;
    const prevOverride = fitModeOverride;

    setFitModeOverride(nextOverride);
    try {
      await persistPlaybackSettings(loop, stopOnLastItem, nextOverride, backgroundColorOverride, transitionType, transitionMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save playback settings";
      setSaveError(message);
      setFitModeOverride(prevOverride);
    }
  };

  const handleRemove = (id: string) => {
    const filtered = items.filter((item) => item._id !== id);
    setItems(filtered);
    void persistItems(buildItemsPayload(filtered));
  };

  return (
    <div>
      {saving && <p className="text-xs text-muted-foreground mb-2">Saving...</p>}
      {!saving && saveError && <p className="text-xs text-destructive mb-2">{saveError}</p>}
      {!saving && !saveError && lastSavedAt && <p className="text-xs text-emerald-600 mb-2">Saved</p>}

      <div className="mb-4 rounded-lg border border-border bg-card p-3">
        <p className="text-sm font-medium">Playback behavior</p>
        <div className="mt-2 flex flex-col gap-2 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={loop}
              onChange={(event) => {
                void handleLoopChange(event.target.checked);
              }}
            />
            <span>Loop (ripeti automaticamente)</span>
          </label>

          <label className={`inline-flex items-center gap-2 ${loop ? "opacity-50" : ""}`}>
            <input
              type="checkbox"
              checked={stopOnLastItem}
              disabled={loop}
              onChange={(event) => {
                void handleStopOnLastItemChange(event.target.checked);
              }}
            />
            <span>Stop on last item</span>
          </label>

          <label className="inline-flex items-center gap-2">
            <span>Image fit override</span>
            <select
              value={fitModeOverride ?? "none"}
              onChange={(event) => {
                void handleGlobalFitModeOverrideChange(event.target.value as "none" | "cover" | "fit");
              }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="none">Per-item</option>
              <option value="cover">Cover (crop fullscreen)</option>
              <option value="fit">Fit (full image in screen)</option>
            </select>
          </label>
        </div>
      </div>

      {items.length === 0 && (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
          <p>No items in this playlist.</p>
          <p className="text-sm mt-1">Add content from the Content Library.</p>
        </div>
      )}

      <DndContext
        id={`playlist-dnd-${playlistId}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          id={`playlist-sortable-${playlistId}`}
          items={items.map((item) => item._id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <SortableItem
              key={item._id}
              item={item}
              onDurationChange={handleDurationChange}
              onDurationOverrideChange={handleDurationOverrideChange}
              onFitModeChange={handleItemFitModeChange}
              onRemove={handleRemove}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
