'use client';

import type { MouseEvent } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { Trash2 } from "lucide-react";

export type TimelineRule = {
  _id: string;
  layer: "global" | "group" | "screen";
  scopeId: string;
  /** Playlist assigned to this rule (mutually exclusive with layoutId) */
  playlistId?: string;
  playlistName?: string;
  /** Composite layout assigned to this rule (mutually exclusive with playlistId) */
  layoutId?: string;
  layoutName?: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  days: number[];
  startUtc?: Date | string;
  endUtc?: Date | string;
};

interface ScheduleBlockProps {
  rule: TimelineRule;
  orgTimezone: string;
  readOnly?: boolean;
  onEdit: (rule: TimelineRule) => void;
  onDelete: (ruleId: string) => void;
  onResizeStart?: (event: MouseEvent<HTMLButtonElement>, rule: TimelineRule, direction: "start" | "end") => void;
  onMoveStart?: (event: MouseEvent<HTMLDivElement>, rule: TimelineRule) => void;
}

const LAYER_COLORS: Record<TimelineRule["layer"], string> = {
  global: "bg-blue-100 border-blue-300 text-blue-900 hover:bg-blue-200",
  group: "bg-green-100 border-green-300 text-green-900 hover:bg-green-200",
  screen: "bg-purple-100 border-purple-300 text-purple-900 hover:bg-purple-200",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatHourMinute(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatFromUtcOrFallback(
  utcValue: Date | string | undefined,
  orgTimezone: string,
  fallbackHour: number,
  fallbackMinute: number,
): string {
  if (!utcValue) {
    return formatHourMinute(fallbackHour, fallbackMinute);
  }

  const utcDate = new Date(utcValue);
  if (Number.isNaN(utcDate.getTime())) {
    return formatHourMinute(fallbackHour, fallbackMinute);
  }

  return formatInTimeZone(utcDate, orgTimezone, "HH:mm");
}

export function ScheduleBlock({
  rule,
  orgTimezone,
  readOnly = false,
  onEdit,
  onDelete,
  onResizeStart,
  onMoveStart,
}: ScheduleBlockProps) {
  const colorClass = LAYER_COLORS[rule.layer];
  const contentLabel = rule.layoutName ?? rule.playlistName ?? "—";
  const contentTypeLabel = rule.layoutId ? "Layout" : "Playlist";
  const startLabel = formatFromUtcOrFallback(
    rule.startUtc,
    orgTimezone,
    rule.startHour,
    rule.startMinute,
  );
  const endLabel = formatFromUtcOrFallback(rule.endUtc, orgTimezone, rule.endHour, rule.endMinute);
  const daysLabel =
    rule.days.length === 7
      ? "Every day"
      : rule.days
          .slice()
          .sort((a, b) => a - b)
          .map((day) => DAY_NAMES[day])
          .join(", ");

  return (
    <div
      className={`group relative h-full overflow-hidden rounded border p-1 text-xs leading-tight transition-colors ${colorClass} ${
        readOnly ? "cursor-default opacity-80 ring-1 ring-white/60" : "cursor-pointer"
      }`}
      onMouseDown={(event) => {
        if (readOnly || event.button !== 0) {
          return;
        }

        const target = event.target as HTMLElement;
        if (target.closest("button")) {
          return;
        }

        onMoveStart?.(event, rule);
      }}
      onClick={() => {
        if (!readOnly) {
          onEdit(rule);
        }
      }}
      title={`${contentTypeLabel}: ${contentLabel} - ${startLabel}-${endLabel} (${orgTimezone}) - ${daysLabel}`}
    >
      {readOnly ? null : (
        <button
          type="button"
          className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l bg-black/10 hover:bg-black/20"
          aria-label="Resize rule start"
          onMouseDown={(event) => {
            event.stopPropagation();
            onResizeStart?.(event, rule, "start");
          }}
        />
      )}

      {readOnly ? null : (
        <button
          type="button"
          className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r bg-black/10 hover:bg-black/20"
          aria-label="Resize rule end"
          onMouseDown={(event) => {
            event.stopPropagation();
            onResizeStart?.(event, rule, "end");
          }}
        />
      )}

      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate font-medium">{contentLabel}</p>
          <p className="text-xs opacity-75">
            {startLabel}-{endLabel}
          </p>
          {rule.layoutId ? <p className="text-[10px] uppercase tracking-wide opacity-70">Layout</p> : null}
          {readOnly ? <p className="text-[10px] uppercase tracking-wide opacity-70">Read only</p> : null}
        </div>

        {readOnly ? null : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(rule._id);
            }}
            className="shrink-0 rounded p-0.5 opacity-0 hover:bg-black/10 group-hover:opacity-100"
            aria-label="Delete rule"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
