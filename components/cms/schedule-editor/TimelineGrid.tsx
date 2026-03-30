'use client';

import { formatDistanceToNow } from "date-fns";
import { useMemo, useRef, useState } from "react";

import { ScheduleBlock, type TimelineRule } from "./ScheduleBlock";
import { TimeRuleForm } from "./TimeRuleForm";

type Layer = "global" | "group" | "screen";

type Playlist = {
  _id: string;
  name: string;
};

type Layout = {
  _id: string;
  name: string;
};

interface TimelineGridProps {
  initialRules: TimelineRule[];
  playlists: Playlist[];
  layouts: Layout[];
  scopeId: string;
  orgTimezone: string;
  editableLayer: Layer;
  visibleLayers?: Layer[];
}

const LAYERS: Array<{ id: Layer; label: string; rowClass: string }> = [
  { id: "screen", label: "Screen", rowClass: "bg-fuchsia-500/10" },
  { id: "group", label: "Group", rowClass: "bg-emerald-500/10" },
  { id: "global", label: "Global", rowClass: "bg-sky-500/10" },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function sortRules(rules: TimelineRule[]): TimelineRule[] {
  return rules.slice().sort((a, b) => a.startHour - b.startHour || a.startMinute - b.startMinute);
}

function getEffectiveEndHour(rule: TimelineRule): number {
  if (rule.endMinute > 0) {
    return Math.min(rule.endHour + 1, 24);
  }
  return rule.endHour;
}

export function TimelineGrid({
  initialRules,
  playlists,
  layouts,
  scopeId,
  orgTimezone,
  editableLayer,
  visibleLayers,
}: TimelineGridProps) {
  const [rules, setRules] = useState<TimelineRule[]>(sortRules(initialRules));
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<
    | {
        layer: Layer;
        playlistId?: string;
        layoutId?: string;
        days?: number[];
        startHour: number;
        startMinute: number;
        endHour: number;
        endMinute: number;
      }
    | undefined
  >();
  const [editingRule, setEditingRule] = useState<TimelineRule | undefined>();
  const [interactionMessage, setInteractionMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const suppressClickUntilRef = useRef(0);
  const pointerInteractionActiveRef = useRef(false);

  const isClickSuppressed = () => {
    if (pointerInteractionActiveRef.current) {
      return true;
    }
    return Date.now() < suppressClickUntilRef.current;
  };
  const suppressClicksForInteraction = () => {
    suppressClickUntilRef.current = Date.now() + 900;
  };

  const applyRuleWindow = (
    targetRuleId: string,
    startMinutes: number,
    endMinutes: number,
  ) => {
    const nextStartHour = Math.floor(startMinutes / 60);
    const nextStartMinute = startMinutes % 60;
    const nextEndHour = Math.floor(endMinutes / 60);
    const nextEndMinute = endMinutes % 60;

    setRules((previous) =>
      previous.map((currentRule) =>
        currentRule._id === targetRuleId
          ? {
              ...currentRule,
              startHour: nextStartHour,
              startMinute: nextStartMinute,
              endHour: nextEndHour,
              endMinute: nextEndMinute,
            }
          : currentRule,
      ),
    );
  };

  const parseApiError = async (response: Response): Promise<string> => {
    try {
      const payload = await response.json().catch(() => null) as { error?: unknown } | null;
      if (typeof payload?.error === "string" && payload.error.trim()) {
        return payload.error;
      }
      return `Request failed (${response.status})`;
    } catch {
      return `Request failed (${response.status})`;
    }
  };

  const persistRuleWindow = async (
    rule: TimelineRule,
    startMinutes: number,
    endMinutes: number,
  ): Promise<boolean> => {
    const startHour = Math.floor(startMinutes / 60);
    const startMinute = startMinutes % 60;
    const endHour = Math.floor(endMinutes / 60);
    const endMinute = endMinutes % 60;

    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/schedules/${rule._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${rule.layer.toUpperCase()} ${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}-${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`,
          windows: [
            {
              startHHMM: `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}`,
              endHHMM: `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`,
              daysOfWeek: rule.days,
              timezone: orgTimezone,
            },
          ],
        }),
      });

      if (!response.ok) {
        const message = await parseApiError(response);
        setSaveError(message);
        return false;
      }

      setLastSavedAt(Date.now());
      return true;
    } catch {
      setSaveError("Unable to save scheduling changes");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const rulesByLayer = useMemo(() => {
    return {
      screen: sortRules(rules.filter((rule) => rule.layer === "screen")),
      group: sortRules(rules.filter((rule) => rule.layer === "group")),
      global: sortRules(rules.filter((rule) => rule.layer === "global")),
    } as const;
  }, [rules]);

  const layersToRender = useMemo(() => {
    if (!visibleLayers || visibleLayers.length === 0) {
      return LAYERS;
    }
    const allowed = new Set(visibleLayers);
    return LAYERS.filter((layer) => allowed.has(layer.id));
  }, [visibleLayers]);

  const handleCellClick = (layer: Layer, hour: number) => {
    if (isClickSuppressed()) {
      return;
    }

    if (layer !== editableLayer) {
      return;
    }

    setEditingRule(undefined);
    const defaultEndHour = hour >= 23 ? 23 : hour + 1;
    const defaultEndMinute = hour >= 23 ? 59 : 0;
    setFormInitial({
      layer,
      startHour: hour,
      startMinute: 0,
      endHour: defaultEndHour,
      endMinute: defaultEndMinute,
    });
    setFormOpen(true);
  };

  const handleBlockEdit = (rule: TimelineRule) => {
    if (isClickSuppressed()) {
      return;
    }

    if (rule.layer !== editableLayer) {
      return;
    }

    setEditingRule(rule);
    setFormInitial({
      layer: rule.layer,
      playlistId: rule.playlistId,
      layoutId: rule.layoutId,
      days: rule.days,
      startHour: rule.startHour,
      startMinute: rule.startMinute,
      endHour: rule.endHour,
      endMinute: rule.endMinute,
    });
    setFormOpen(true);
  };

  const handleBlockDelete = async (ruleId: string) => {
    const confirmed = window.confirm("Confermi l'eliminazione di questa regola scheduling?");
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/schedules/${ruleId}`, { method: "DELETE" });
      if (!response.ok) {
        const message = await parseApiError(response);
        setSaveError(message);
        return;
      }

      setRules((previous) => previous.filter((rule) => rule._id !== ruleId));
      setLastSavedAt(Date.now());
    } catch {
      setSaveError("Unable to delete schedule rule");
    } finally {
      setSaving(false);
    }
  };

  const handleRuleSaved = (savedRule: TimelineRule) => {
    setRules((previous) => {
      const index = previous.findIndex((rule) => rule._id === savedRule._id);
      if (index >= 0) {
        const next = previous.slice();
        next[index] = savedRule;
        return sortRules(next);
      }
      return sortRules([...previous, savedRule]);
    });
    setSaveError(null);
    setLastSavedAt(Date.now());
  };

  const handleResizeStart = (
    event: React.MouseEvent<HTMLButtonElement>,
    rule: TimelineRule,
    direction: "start" | "end",
  ) => {
    if (rule.layer !== editableLayer) {
      return;
    }

    const gridRect = gridRef.current?.getBoundingClientRect();
    if (!gridRect) {
      return;
    }

    const trackLeft = gridRect.left + 80;
    const trackWidth = Math.max(1, gridRect.width - 80);
    const minuteWidth = trackWidth / (24 * 60);
    const originalStartMinutes = rule.startHour * 60 + rule.startMinute;
    const originalEndMinutes = rule.endHour * 60 + rule.endMinute;
    let latestStartMinutes = originalStartMinutes;
    let latestEndMinutes = originalEndMinutes;
    let didMove = false;
    pointerInteractionActiveRef.current = true;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const relativeX = Math.max(0, Math.min(trackWidth, moveEvent.clientX - trackLeft));
      const rawMinutes = Math.round(relativeX / minuteWidth);
      const snappedMinutes = Math.round(rawMinutes / 15) * 15;

      if (direction === "end") {
        const minEndMinutes = latestStartMinutes + 15;
        const boundedEndMinutes = Math.max(minEndMinutes, Math.min(24 * 60, snappedMinutes));
        latestEndMinutes = boundedEndMinutes;
        if (latestEndMinutes !== originalEndMinutes) {
          didMove = true;
        }
      } else {
        const maxStartMinutes = latestEndMinutes - 15;
        const boundedStartMinutes = Math.max(0, Math.min(maxStartMinutes, snappedMinutes));
        latestStartMinutes = boundedStartMinutes;
        if (latestStartMinutes !== originalStartMinutes) {
          didMove = true;
        }
      }

      applyRuleWindow(rule._id, latestStartMinutes, latestEndMinutes);

      if (latestEndMinutes >= 24 * 60) {
        setInteractionMessage("Rule trimmed at 00:00 to avoid overflow.");
      } else {
        setInteractionMessage(null);
      }
    };

    const onMouseUp = async () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      pointerInteractionActiveRef.current = false;
      if (didMove) {
        suppressClicksForInteraction();
      }

      if (!didMove) {
        return;
      }

      const saved = await persistRuleWindow(rule, latestStartMinutes, latestEndMinutes);

      if (!saved) {
        applyRuleWindow(rule._id, originalStartMinutes, originalEndMinutes);
        setInteractionMessage("Failed to save resized rule. Restored previous duration.");
      } else {
        setInteractionMessage("Rule updated and saved.");
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp, { once: true });
    event.preventDefault();
  };

  const handleMoveStart = (event: React.MouseEvent<HTMLDivElement>, rule: TimelineRule) => {
    if (rule.layer !== editableLayer) {
      return;
    }

    const gridRect = gridRef.current?.getBoundingClientRect();
    if (!gridRect) {
      return;
    }

    const trackLeft = gridRect.left + 80;
    const trackWidth = Math.max(1, gridRect.width - 80);
    const minuteWidth = trackWidth / (24 * 60);

    const originalStartMinutes = rule.startHour * 60 + rule.startMinute;
    const originalEndMinutes = rule.endHour * 60 + rule.endMinute;
    const durationMinutes = Math.max(15, originalEndMinutes - originalStartMinutes);
    const pointerStartX = event.clientX;
    const pointerStartMinutes = originalStartMinutes;
    let latestStartMinutes = originalStartMinutes;
    let latestEndMinutes = originalEndMinutes;
    let didMove = false;
    pointerInteractionActiveRef.current = true;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPixels = moveEvent.clientX - pointerStartX;
      const deltaMinutesRaw = deltaPixels / minuteWidth;
      const deltaMinutesSnapped = Math.round(deltaMinutesRaw / 15) * 15;
      const boundedStart = Math.max(0, Math.min(24 * 60 - durationMinutes, pointerStartMinutes + deltaMinutesSnapped));
      const boundedEnd = boundedStart + durationMinutes;

      latestStartMinutes = boundedStart;
      latestEndMinutes = boundedEnd;
      if (latestStartMinutes !== originalStartMinutes) {
        didMove = true;
      }

      applyRuleWindow(rule._id, latestStartMinutes, latestEndMinutes);
    };

    const onMouseUp = async () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      pointerInteractionActiveRef.current = false;

      if (didMove) {
        suppressClicksForInteraction();
      }

      if (!didMove) {
        return;
      }

      const saved = await persistRuleWindow(rule, latestStartMinutes, latestEndMinutes);
      if (!saved) {
        applyRuleWindow(rule._id, originalStartMinutes, originalEndMinutes);
        setInteractionMessage("Failed to move rule. Restored previous position.");
      } else {
        setInteractionMessage("Rule moved and saved.");
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp, { once: true });
    event.preventDefault();
  };

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Timezone: {orgTimezone}</span>
        <span className="mx-2 text-muted-foreground/60">|</span>
        <span>
          Click an empty slot in the <strong className="capitalize">{editableLayer}</strong> row to add a
          rule.
        </span>
        <span className="mx-2 text-muted-foreground/60">|</span>
        <span>Drag/resize saves immediately and players apply priority automatically.</span>
        <span className="mx-2 text-muted-foreground/60">|</span>
        {saving ? <span>Saving...</span> : null}
        {!saving && saveError ? <span className="text-red-500">Save failed: {saveError}</span> : null}
        {!saving && !saveError && lastSavedAt ? (
          <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">
            Saved {formatDistanceToNow(new Date(lastSavedAt), { addSuffix: true })}
          </span>
        ) : null}
      </div>

      {interactionMessage ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          {interactionMessage}
        </p>
      ) : null}

      <div className="w-full overflow-x-auto rounded-lg border border-border bg-card" ref={gridRef}>
        <div className="min-w-[1120px]">
          <div className="grid" style={{ gridTemplateColumns: "80px repeat(24, minmax(42px, 1fr))" }}>
            <div className="border-b border-r border-border bg-muted p-2 text-xs font-medium text-muted-foreground">Layer</div>
            {HOURS.map((hour) => (
              <div
                key={`header-${hour}`}
                className="border-b border-l border-border bg-muted py-2 text-center font-mono text-xs text-muted-foreground"
              >
                {String(hour).padStart(2, "0")}
              </div>
            ))}
          </div>

          {layersToRender.map(({ id: layer, label, rowClass }) => {
            const layerRules = rulesByLayer[layer];
            const readOnly = layer !== editableLayer;
            return (
              <div
                key={layer}
                className="relative grid h-[52px] overflow-hidden"
                style={{
                  gridTemplateColumns: "80px repeat(24, minmax(42px, 1fr))",
                  gridTemplateRows: "52px",
                }}
              >
                <div
                  className={`${rowClass} flex flex-col items-center justify-center border-b border-r border-border p-2 ${
                    readOnly ? "opacity-70" : "ring-1 ring-inset ring-primary/20"
                  }`}
                  style={{ gridRow: 1 }}
                >
                  <span className="text-xs font-medium">{label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {readOnly ? "Read only" : "Editable"}
                  </span>
                </div>

                {HOURS.map((hour) => {
                  const blocked = layerRules.some(
                    (rule) => hour >= rule.startHour && hour < getEffectiveEndHour(rule),
                  );
                  const clickable = layer === editableLayer && !blocked;

                  return (
                    <div
                      key={`${layer}-cell-${hour}`}
                      className={`${rowClass} h-full border-b border-l border-border ${
                        clickable ? "cursor-pointer hover:bg-accent/70" : "cursor-default"
                      }`}
                      style={{
                        gridRow: 1,
                        gridColumn: hour + 2,
                        backgroundImage: readOnly
                          ? "repeating-linear-gradient(135deg, transparent, transparent 10px, rgba(255,255,255,0.2) 10px, rgba(255,255,255,0.2) 20px)"
                          : undefined,
                      }}
                      onClick={() => {
                        if (!blocked) {
                          handleCellClick(layer, hour);
                        }
                      }}
                    />
                  );
                })}

                {layerRules.map((rule) => (
                  <div
                    key={rule._id}
                    className="relative z-10 h-full border-b border-border"
                    style={{
                      gridColumn: `${rule.startHour + 2} / ${getEffectiveEndHour(rule) + 2}`,
                      gridRow: 1,
                    }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <ScheduleBlock
                      rule={rule}
                      orgTimezone={orgTimezone}
                      readOnly={readOnly}
                      onEdit={handleBlockEdit}
                      onDelete={handleBlockDelete}
                      onResizeStart={handleResizeStart}
                      onMoveStart={handleMoveStart}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <TimeRuleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initialValues={formInitial}
        playlists={playlists}
        layouts={layouts}
        scopeId={scopeId}
        layer={formInitial?.layer ?? editableLayer}
        orgTimezone={orgTimezone}
        onSaved={handleRuleSaved}
        editingRuleId={editingRule?._id}
        onPersistStateChange={({ saving: nextSaving, error, savedAt }) => {
          setSaving(nextSaving);
          if (typeof error !== "undefined") {
            setSaveError(error ?? null);
          }
          if (savedAt) {
            setLastSavedAt(savedAt);
          }
        }}
      />
    </section>
  );
}
