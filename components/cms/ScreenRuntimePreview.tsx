"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PresetRatio = "16:9" | "9:16" | "1:1" | "4:3" | "custom";

interface ScreenRuntimePreviewProps {
  screenId: string;
  title: string;
  previewUrl: string;
}

type RuntimeSnapshot = {
  resolvedAt: string;
  updatedAt: string | null;
  lastSeenAt: string | null;
  source: {
    layer: "global" | "group" | "screen" | "force_override" | "no_content";
    label: string;
    scope: "org" | "group" | "screen" | "override" | null;
    scheduleId: string | null;
    scheduleName: string | null;
    playlistId: string | null;
    playlistName: string | null;
  };
  content: {
    id: string;
    name: string;
    type: "image" | "video" | "url" | "widget";
  } | null;
  hasItems: boolean;
};

function ratioToValue(ratio: PresetRatio, customWidth: number, customHeight: number): number {
  switch (ratio) {
    case "16:9":
      return 16 / 9;
    case "9:16":
      return 9 / 16;
    case "1:1":
      return 1;
    case "4:3":
      return 4 / 3;
    case "custom":
      return customWidth > 0 && customHeight > 0 ? customWidth / customHeight : 16 / 9;
    default:
      return 16 / 9;
  }
}

export function ScreenRuntimePreview({ screenId, title, previewUrl }: ScreenRuntimePreviewProps) {
  const [enabled, setEnabled] = useState(false);
  const [ratio, setRatio] = useState<PresetRatio>("16:9");
  const [customWidth, setCustomWidth] = useState(16);
  const [customHeight, setCustomHeight] = useState(9);
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const ratioValue = useMemo(
    () => ratioToValue(ratio, customWidth, customHeight),
    [ratio, customWidth, customHeight],
  );

  const aspectRatioStyle = `${ratioValue}`;

  useEffect(() => {
    let cancelled = false;

    const fetchRuntime = async () => {
      try {
        const response = await fetch(`/api/screens/${screenId}/runtime`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Runtime fetch failed: ${response.status}`);
        }

        const payload = (await response.json()) as RuntimeSnapshot;
        if (!cancelled) {
          setRuntime(payload);
          setRuntimeError(null);
        }
      } catch {
        if (!cancelled) {
          setRuntimeError("Runtime data unavailable");
        }
      }
    };

    void fetchRuntime();
    const intervalId = window.setInterval(() => {
      void fetchRuntime();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [screenId]);

  const scopeBadgeVariant = runtime?.source.layer === "no_content" ? "secondary" : "outline";
  const scheduleValue = runtime?.source.scheduleName
    ?? (runtime?.source.layer === "screen" && runtime?.source.playlistName ? "Screen default" : "No active schedule");
  const playlistValue = runtime?.source.playlistName
    ?? (runtime?.hasItems ? "Resolved playlist" : "No playlist");

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-background/80 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "Preview on" : "Preview off"}</Badge>
            <Badge variant={scopeBadgeVariant}>{runtime?.source.label ?? "Loading"}</Badge>
          </div>
          {runtimeError ? <p className="text-xs text-muted-foreground">{runtimeError}</p> : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Playlist</p>
            <p className="mt-1 text-sm font-medium text-foreground">{playlistValue}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Schedule</p>
            <p className="mt-1 text-sm font-medium text-foreground">{scheduleValue}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Scope</p>
            <p className="mt-1 text-sm font-medium text-foreground">{runtime?.source.label ?? "Loading"}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Button onClick={() => setEnabled((previous) => !previous)}>
          {enabled ? "Stop" : "Play"}
        </Button>

        <label className="text-xs text-muted-foreground">
          Ratio
          <select
            value={ratio}
            onChange={(event) => setRatio(event.target.value as PresetRatio)}
            className="ml-2 h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
            <option value="4:3">4:3</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        {ratio === "custom" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>W</span>
            <Input
              type="number"
              min={1}
              value={customWidth}
              onChange={(event) => setCustomWidth(Math.max(1, Number(event.target.value) || 1))}
              className="h-9 w-20"
            />
            <span>H</span>
            <Input
              type="number"
              min={1}
              value={customHeight}
              onChange={(event) => setCustomHeight(Math.max(1, Number(event.target.value) || 1))}
              className="h-9 w-20"
            />
          </div>
        ) : null}

      </div>

      <div className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-muted/30 p-3">
        <div
          className="relative w-full overflow-hidden rounded-lg border border-border bg-black"
          style={{ aspectRatio: aspectRatioStyle }}
        >
          {enabled ? (
            <iframe
              src={previewUrl}
              title={title}
              className="absolute inset-0 h-full w-full border-0"
              allow="autoplay"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Preview off
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
