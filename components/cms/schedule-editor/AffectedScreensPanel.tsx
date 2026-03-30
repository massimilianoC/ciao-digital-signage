"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, List, Monitor } from "lucide-react";

import { Button } from "@/components/ui/button";

type EffectiveLayer = "global" | "group" | "screen" | "force_override" | "no_content";

type AffectedScreen = {
  screenId: string;
  name: string;
  location?: string;
  groupName?: string;
  effectiveLayer: EffectiveLayer;
  sourceScheduleName?: string | null;
  sourcePlaylistName?: string | null;
};

interface AffectedScreensPanelProps {
  title: string;
  description: string;
  screens: AffectedScreen[];
}

type ViewMode = "list" | "grid";

const LAYER_LABEL: Record<EffectiveLayer, string> = {
  global: "Global",
  group: "Group",
  screen: "Screen",
  force_override: "Override",
  no_content: "No content",
};

const LAYER_BADGE_CLASS: Record<EffectiveLayer, string> = {
  global: "border-sky-300 bg-sky-50 text-sky-900",
  group: "border-emerald-300 bg-emerald-50 text-emerald-900",
  screen: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900",
  force_override: "border-amber-300 bg-amber-50 text-amber-900",
  no_content: "border-slate-300 bg-slate-50 text-slate-800",
};

export function AffectedScreensPanel({ title, description, screens }: AffectedScreensPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const sortedScreens = useMemo(
    () =>
      screens
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [screens],
  );

  return (
    <details className="rounded-lg border border-border bg-card" open>
      <summary className="cursor-pointer list-none px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
            {screens.length} monitor{screens.length === 1 ? "" : "s"}
          </span>
        </div>
      </summary>

      <div className="border-t border-border px-4 py-3">
        <div className="mb-3 flex items-center justify-end gap-1">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "list" ? "default" : "outline"}
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
            List
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "grid" ? "default" : "outline"}
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
            Grid
          </Button>
        </div>

        {sortedScreens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun monitor coinvolto.</p>
        ) : (
          <div className={viewMode === "grid" ? "grid gap-2 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>
            {sortedScreens.map((screen) => (
              <article key={screen.screenId} className="rounded-md border border-border bg-background px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{screen.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {screen.location?.trim() || "Posizione non impostata"}
                    </p>
                    {screen.groupName ? (
                      <p className="truncate text-[11px] text-muted-foreground">Gruppo: {screen.groupName}</p>
                    ) : null}
                  </div>
                  <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${LAYER_BADGE_CLASS[screen.effectiveLayer]}`}
                  >
                    {LAYER_LABEL[screen.effectiveLayer]}
                  </span>

                  {screen.sourceScheduleName ? (
                    <span className="truncate rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      Regola: {screen.sourceScheduleName}
                    </span>
                  ) : null}

                  {screen.sourcePlaylistName ? (
                    <span className="truncate rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      Playlist: {screen.sourcePlaylistName}
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
