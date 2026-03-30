"use client";

import { useEffect, useState } from "react";
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
import {
  Crop,
  Expand,
  Globe,
  GripVertical,
  Image as ImageIcon,
  Palette,
  Puzzle,
  Trash2,
  Video,
} from "lucide-react";

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

function M3Switch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-8 w-14 items-center rounded-full border transition-colors
        ${checked ? "border-blue-500 bg-blue-500/90" : "border-border bg-muted"}
        ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}
      `}
    >
      <span
        className={`
          ml-1 inline-block h-6 w-6 rounded-full bg-white shadow transition-transform
          ${checked ? "translate-x-6" : "translate-x-0"}
        `}
      />
    </button>
  );
}

function SortableItem({
  item,
  onDurationChange,
  onFitModeChange,
  onBackgroundColorChange,
  onRemove,
}: {
  item: PlaylistItem;
  onDurationChange: (id: string, durationSeconds: number) => void;
  onFitModeChange: (id: string, fitMode: "cover" | "fit") => void;
  onBackgroundColorChange: (id: string, color: string | null) => void;
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
  const safeName = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Untitled item";

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
            aria-label={`Reorder ${safeName}`}
          >
            <GripVertical className="h-5 w-5" />
          </button>

          <div className="w-12 h-12 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center border border-border">
            {previewSrc ? (
              <img
                src={previewSrc}
                alt={safeName}
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
            <p className="text-sm font-semibold truncate">{safeName}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{item.type}</p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Input
              type="number"
              min={1}
              max={3600}
              value={item.durationSeconds}
              onChange={(event) => onDurationChange(item._id, Number(event.target.value))}
              className="w-20 text-sm"
            />
            <span className="text-xs text-muted-foreground">sec</span>
          </div>

          {item.type === "image" && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Palette className="h-3.5 w-3.5" />
                <span>Bg</span>
              </div>
              <Input
                type="color"
                value={item.backgroundColor ?? "#000000"}
                onChange={(event) => onBackgroundColorChange(item._id, event.target.value)}
                className="h-8 w-10 p-1"
                title="Background color"
              />
              <select
                value={item.fitMode ?? "cover"}
                onChange={(event) => onFitModeChange(item._id, event.target.value as "cover" | "fit")}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                title="Image fit mode"
              >
                <option value="cover">Cover</option>
                <option value="fit">Fit</option>
              </select>
            </div>
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
  const [items, setItems] = useState(initialItems);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [loop, setLoop] = useState(initialLoop);
  const [stopOnLastItem, setStopOnLastItem] = useState(initialStopOnLastItem);
  const [fitModeOverride, setFitModeOverride] = useState<"cover" | "fit" | null>(initialFitModeOverride);
  const [backgroundColorOverride, setBackgroundColorOverride] = useState<string | null>(initialBackgroundColorOverride);
  const [transitionType, setTransitionType] = useState<"cut" | "fade">(initialTransitionType);
  const [transitionMs, setTransitionMs] = useState(Math.max(0, initialTransitionMs));

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
    setTransitionMs(Math.max(0, initialTransitionMs));
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
      return fallback;
    } catch {
      return fallback;
    }
  };

  const persistItems = async (
    nextItems: Array<{
      contentId: string;
      title: string;
      thumbnailUrl?: string;
      fitMode: "cover" | "fit";
      backgroundColor?: string | null;
      durationMs: number;
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
    nextFitModeOverride: "cover" | "fit" | null,
    nextBackgroundColorOverride: string | null,
    nextTransitionType: "cut" | "fade",
    nextTransitionMs: number,
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
          transitionMs: Math.max(0, Math.round(nextTransitionMs)),
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      setLastSavedAt(Date.now());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save playback settings";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  const toPayload = (sourceItems: PlaylistItem[]) =>
    sourceItems.map((item) => ({
      contentId: item.contentId,
      title: item.name,
      thumbnailUrl: item.thumbnailUrl,
      fitMode: item.fitMode ?? "cover",
      backgroundColor: item.backgroundColor ?? null,
      durationMs: item.durationSeconds * 1000,
    }));

  const handleLoopChange = async (checked: boolean) => {
    const prevLoop = loop;
    const prevStop = stopOnLastItem;

    setLoop(checked);
    if (checked) {
      setStopOnLastItem(false);
    }

    await persistPlaybackSettings(
      checked,
      checked ? false : stopOnLastItem,
      fitModeOverride,
      backgroundColorOverride,
      transitionType,
      transitionMs,
    );

    if (saveError) {
      setLoop(prevLoop);
      setStopOnLastItem(prevStop);
    }
  };

  const handleStopOnLastItemChange = async (checked: boolean) => {
    if (loop) return;

    const prevStop = stopOnLastItem;
    setStopOnLastItem(checked);

    await persistPlaybackSettings(
      loop,
      checked,
      fitModeOverride,
      backgroundColorOverride,
      transitionType,
      transitionMs,
    );

    if (saveError) {
      setStopOnLastItem(prevStop);
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
    void persistItems(toPayload(reordered));
  };

  const handleDurationChange = (id: string, durationSeconds: number) => {
    const safeDuration = Number.isFinite(durationSeconds) ? Math.max(1, durationSeconds) : 1;
    setItems((prev) => {
      const next = prev.map((item) => (item._id === id ? { ...item, durationSeconds: safeDuration } : item));
      void persistItems(toPayload(next));
      return next;
    });
  };

  const handleItemFitModeChange = (id: string, fitMode: "cover" | "fit") => {
    setItems((prev) => {
      const next = prev.map((item) => (item._id === id ? { ...item, fitMode } : item));
      void persistItems(toPayload(next));
      return next;
    });
  };

  const handleItemBackgroundColorChange = (id: string, backgroundColor: string | null) => {
    setItems((prev) => {
      const next = prev.map((item) => (item._id === id ? { ...item, backgroundColor } : item));
      void persistItems(toPayload(next));
      return next;
    });
  };

  const handleGlobalFitModeOverrideChange = async (value: "none" | "cover" | "fit") => {
    const nextOverride = value === "none" ? null : value;
    const prevOverride = fitModeOverride;

    setFitModeOverride(nextOverride);
    await persistPlaybackSettings(
      loop,
      stopOnLastItem,
      nextOverride,
      backgroundColorOverride,
      transitionType,
      transitionMs,
    );

    if (saveError) {
      setFitModeOverride(prevOverride);
    }
  };

  const handleGlobalBackgroundColorOverrideChange = async (value: string | null) => {
    const prev = backgroundColorOverride;
    setBackgroundColorOverride(value);

    await persistPlaybackSettings(
      loop,
      stopOnLastItem,
      fitModeOverride,
      value,
      transitionType,
      transitionMs,
    );

    if (saveError) {
      setBackgroundColorOverride(prev);
    }
  };

  const handleTransitionTypeChange = async (value: "cut" | "fade") => {
    const prev = transitionType;
    setTransitionType(value);

    await persistPlaybackSettings(
      loop,
      stopOnLastItem,
      fitModeOverride,
      backgroundColorOverride,
      value,
      transitionMs,
    );

    if (saveError) {
      setTransitionType(prev);
    }
  };

  const handleTransitionMsChange = async (value: number) => {
    const normalized = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    const prev = transitionMs;
    setTransitionMs(normalized);

    await persistPlaybackSettings(
      loop,
      stopOnLastItem,
      fitModeOverride,
      backgroundColorOverride,
      transitionType,
      normalized,
    );

    if (saveError) {
      setTransitionMs(prev);
    }
  };

  const handleRemove = (id: string) => {
    const filtered = items.filter((item) => item._id !== id);
    setItems(filtered);
    void persistItems(toPayload(filtered));
  };

  return (
    <div>
      {saving && <p className="text-xs text-muted-foreground mb-2">Saving...</p>}
      {!saving && saveError && <p className="text-xs text-destructive mb-2">{saveError}</p>}
      {!saving && !saveError && lastSavedAt && <p className="text-xs text-emerald-600 mb-2">Saved</p>}

      <div className="mb-4 rounded-lg border border-border bg-card p-3">
        <p className="text-sm font-medium">Playback behavior</p>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-2">
            <span>Loop</span>
            <M3Switch
              checked={loop}
              onChange={(value) => {
                void handleLoopChange(value);
              }}
              label="Loop"
            />
          </div>

          <div className={`flex items-center justify-between rounded-md border border-border bg-muted/40 p-2 ${loop ? "opacity-60" : ""}`}>
            <span>Stop on last item</span>
            <M3Switch
              checked={stopOnLastItem}
              disabled={loop}
              onChange={(value) => {
                void handleStopOnLastItemChange(value);
              }}
              label="Stop on last item"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-2">
            <div className="flex items-center gap-1">
              <Expand className="h-4 w-4 text-muted-foreground" />
              <span>Image fit override</span>
            </div>
            <select
              value={fitModeOverride ?? "none"}
              onChange={(event) => {
                void handleGlobalFitModeOverrideChange(event.target.value as "none" | "cover" | "fit");
              }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="none">Per-item</option>
              <option value="cover">Cover</option>
              <option value="fit">Fit</option>
            </select>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-2">
            <div className="flex items-center gap-1">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <span>Background override</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={backgroundColorOverride ?? "#000000"}
                onChange={(event) => {
                  void handleGlobalBackgroundColorOverrideChange(event.target.value);
                }}
                className="h-8 w-12 p-1"
                title="Global background color"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void handleGlobalBackgroundColorOverrideChange(null);
                }}
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-2">
            <div className="flex items-center gap-1">
              <Crop className="h-4 w-4 text-muted-foreground" />
              <span>Transition</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={transitionType}
                onChange={(event) => {
                  void handleTransitionTypeChange(event.target.value as "cut" | "fade");
                }}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="cut">Cut</option>
                <option value="fade">Fade ease-in-out</option>
              </select>
              <Input
                type="number"
                min={0}
                max={5000}
                value={transitionMs}
                onChange={(event) => {
                  void handleTransitionMsChange(Number(event.target.value));
                }}
                className="h-8 w-20 text-xs"
                title="Transition duration ms"
              />
            </div>
          </div>
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
              onFitModeChange={handleItemFitModeChange}
              onBackgroundColorChange={handleItemBackgroundColorChange}
              onRemove={handleRemove}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
