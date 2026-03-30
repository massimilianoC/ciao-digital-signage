'use client';

import { useEffect, useMemo, useState } from "react";

import type { TimelineRule } from "./ScheduleBlock";

type Layer = "global" | "group" | "screen";

type Playlist = {
  _id: string;
  name: string;
};

type Layout = {
  _id: string;
  name: string;
};

type ContentType = "playlist" | "layout";

type RuleFormValues = {
  layer: Layer;
  scopeId: string;
  playlistId?: string;
  layoutId?: string;
  days: number[];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

interface TimeRuleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: Partial<RuleFormValues>;
  playlists: Playlist[];
  layouts: Layout[];
  scopeId: string;
  layer: Layer;
  orgTimezone: string;
  onSaved: (rule: TimelineRule) => void;
  editingRuleId?: string;
  onPersistStateChange?: (state: { saving: boolean; error?: string | null; savedAt?: number | null }) => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SCOPE_BY_LAYER: Record<Layer, "org" | "group" | "screen"> = {
  global: "org",
  group: "group",
  screen: "screen",
};

const PRIORITY_BY_LAYER: Record<Layer, 1 | 2 | 3> = {
  global: 1,
  group: 2,
  screen: 3,
};

function buildTimeString(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTimeString(value: string): { hour: number; minute: number } {
  const [hourString = "0", minuteString = "0"] = value.split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

export function TimeRuleForm({
  open,
  onOpenChange,
  initialValues,
  playlists,
  layouts,
  scopeId,
  layer,
  orgTimezone,
  onSaved,
  editingRuleId,
  onPersistStateChange,
}: TimeRuleFormProps) {
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");
  const [contentType, setContentType] = useState<ContentType>("playlist");
  const [playlistId, setPlaylistId] = useState("");
  const [layoutId, setLayoutId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [initialSnapshot, setInitialSnapshot] = useState<{
    days: number[];
    startTime: string;
    endTime: string;
    contentType: ContentType;
    playlistId: string;
    layoutId: string;
  } | null>(null);

  const playlistNameById = useMemo(
    () => new Map(playlists.map((playlist) => [playlist._id, playlist.name])),
    [playlists],
  );

  const layoutNameById = useMemo(
    () => new Map(layouts.map((layout) => [layout._id, layout.name])),
    [layouts],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const initialStartHour = initialValues?.startHour ?? 8;
    const initialStartMinute = initialValues?.startMinute ?? 0;
    const defaultEndHour = initialStartHour >= 23 ? 23 : initialStartHour + 1;
    const defaultEndMinute = initialStartHour >= 23 ? 59 : 0;
    const initialEndHour = initialValues?.endHour ?? defaultEndHour;
    const initialEndMinute = initialValues?.endMinute ?? defaultEndMinute;

    const safeEndHour = initialEndHour >= 24 ? 23 : initialEndHour;
    const safeEndMinute = initialEndHour >= 24 ? 59 : initialEndMinute;

    const detectedContentType: ContentType = initialValues?.layoutId ? "layout" : "playlist";

    setDays(initialValues?.days ?? [1, 2, 3, 4, 5]);
    setStartTime(buildTimeString(initialStartHour, initialStartMinute));
    setEndTime(buildTimeString(safeEndHour, safeEndMinute));
    setContentType(detectedContentType);
    setPlaylistId(initialValues?.playlistId ?? "");
    setLayoutId(initialValues?.layoutId ?? "");
    setError("");
    setSaving(false);
    setInitialSnapshot({
      days: (initialValues?.days ?? [1, 2, 3, 4, 5]).slice().sort((a, b) => a - b),
      startTime: buildTimeString(initialStartHour, initialStartMinute),
      endTime: buildTimeString(safeEndHour, safeEndMinute),
      contentType: detectedContentType,
      playlistId: initialValues?.playlistId ?? "",
      layoutId: initialValues?.layoutId ?? "",
    });
  }, [initialValues, open]);

  const isDirty = useMemo(() => {
    if (!initialSnapshot) {
      return false;
    }

    const currentDays = days.slice().sort((a, b) => a - b);
    return (
      JSON.stringify(currentDays) !== JSON.stringify(initialSnapshot.days) ||
      startTime !== initialSnapshot.startTime ||
      endTime !== initialSnapshot.endTime ||
      contentType !== initialSnapshot.contentType ||
      playlistId !== initialSnapshot.playlistId ||
      layoutId !== initialSnapshot.layoutId
    );
  }, [days, endTime, initialSnapshot, playlistId, layoutId, contentType, startTime]);

  useEffect(() => {
    if (!open || !isDirty) {
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, open]);

  const requestClose = () => {
    if (!saving && isDirty) {
      const confirmed = window.confirm(
        "Hai modifiche non salvate. Vuoi davvero chiudere e perdere questa configurazione?",
      );
      if (!confirmed) {
        return;
      }
    }

    onOpenChange(false);
  };

  const toggleDay = (day: number) => {
    setDays((previous) =>
      previous.includes(day) ? previous.filter((item) => item !== day) : [...previous, day],
    );
  };

  const handleSave = async () => {
    if (contentType === "playlist" && !playlistId) {
      setError("Seleziona una playlist");
      return;
    }

    if (contentType === "layout" && !layoutId) {
      setError("Seleziona un layout composito");
      return;
    }

    if (days.length === 0) {
      setError("Seleziona almeno un giorno");
      return;
    }

    const start = parseTimeString(startTime);
    const end = parseTimeString(endTime);

    if (end.hour < start.hour || (end.hour === start.hour && end.minute <= start.minute)) {
      setError("L'orario di fine deve essere successivo all'inizio");
      return;
    }

    setError("");
    setSaving(true);
    onPersistStateChange?.({ saving: true, error: null, savedAt: null });

    const basePayload = {
      scope: SCOPE_BY_LAYER[layer],
      scopeId,
      priority: PRIORITY_BY_LAYER[layer],
      windows: [
        {
          startHHMM: buildTimeString(start.hour, start.minute),
          endHHMM: buildTimeString(end.hour, end.minute),
          daysOfWeek: days.slice().sort((a, b) => a - b),
          timezone: orgTimezone,
        },
      ],
      name: `${layer.toUpperCase()} ${buildTimeString(start.hour, start.minute)}-${buildTimeString(end.hour, end.minute)}`,
    };

    const contentPayload =
      contentType === "layout"
        ? { layoutId }
        : { playlistId };

    const payload = { ...basePayload, ...contentPayload };

    try {
      const method = editingRuleId ? "PUT" : "POST";
      const endpoint = editingRuleId ? `/api/schedules/${editingRuleId}` : "/api/schedules";

      const bodyData = editingRuleId
        ? { ...contentPayload, windows: payload.windows, name: payload.name }
        : payload;

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to save rule");
      }

      const result = (await response.json()) as { schedule?: { _id: string } };
      const scheduleId = result.schedule?._id ?? editingRuleId;
      if (!scheduleId) {
        throw new Error("Schedule API response did not include an id");
      }

      const savedRule: TimelineRule =
        contentType === "layout"
          ? {
              _id: scheduleId,
              layer,
              scopeId,
              layoutId,
              layoutName: layoutNameById.get(layoutId) ?? "Layout",
              startHour: start.hour,
              startMinute: start.minute,
              endHour: end.hour,
              endMinute: end.minute,
              days: days.slice().sort((a, b) => a - b),
            }
          : {
              _id: scheduleId,
              layer,
              scopeId,
              playlistId,
              playlistName: playlistNameById.get(playlistId) ?? "Playlist",
              startHour: start.hour,
              startMinute: start.minute,
              endHour: end.hour,
              endMinute: end.minute,
              days: days.slice().sort((a, b) => a - b),
            };

      onSaved(savedRule);
      onPersistStateChange?.({ saving: false, error: null, savedAt: Date.now() });
      setInitialSnapshot({
        days: days.slice().sort((a, b) => a - b),
        startTime,
        endTime,
        contentType,
        playlistId,
        layoutId,
      });
      onOpenChange(false);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Failed to save rule";
      setError(message);
      onPersistStateChange?.({ saving: false, error: message, savedAt: null });
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg border border-border bg-card text-card-foreground shadow-xl">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-base font-semibold">
            {editingRuleId ? "Edit Schedule Rule" : "New Schedule Rule"}
          </h3>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div>
            <p className="text-xs text-muted-foreground">Layer</p>
            <p className="text-sm font-medium capitalize">{layer}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Drag/resize sulla timeline salva automaticamente. In questa finestra premi Save per confermare.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Days of Week</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {DAY_NAMES.map((name, index) => {
                const selected = days.includes(index);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleDay(index)}
                    className={`h-8 w-12 rounded border text-xs ${
                      selected
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-foreground hover:bg-accent"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Start Time</span>
              <input
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-1.5"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium">End Time</span>
              <input
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-1.5"
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Tipo contenuto</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setContentType("playlist")}
                className={`rounded border px-3 py-1.5 text-xs ${
                  contentType === "playlist"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-foreground hover:bg-accent"
                }`}
              >
                Playlist
              </button>
              <button
                type="button"
                onClick={() => setContentType("layout")}
                className={`rounded border px-3 py-1.5 text-xs ${
                  contentType === "layout"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-foreground hover:bg-accent"
                }`}
              >
                Layout composito
              </button>
            </div>
          </div>

          {contentType === "playlist" ? (
            <label className="text-sm">
              <span className="mb-1 block font-medium">Playlist</span>
              <select
                value={playlistId}
                onChange={(event) => setPlaylistId(event.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-2"
              >
                <option value="">Seleziona una playlist...</option>
                {playlists.map((playlist) => (
                  <option key={playlist._id} value={playlist._id}>
                    {playlist.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="text-sm">
              <span className="mb-1 block font-medium">Layout composito</span>
              <select
                value={layoutId}
                onChange={(event) => setLayoutId(event.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-2"
              >
                <option value="">Seleziona un layout...</option>
                {layouts.map((layout) => (
                  <option key={layout._id} value={layout._id}>
                    {layout.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-accent"
            onClick={requestClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Rule"}
          </button>
        </div>
      </div>
    </div>
  );
}
