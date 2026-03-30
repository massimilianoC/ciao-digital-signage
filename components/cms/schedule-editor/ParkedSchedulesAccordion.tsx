"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ParkedWindow = {
  startHHMM: string;
  endHHMM: string;
  daysOfWeek: number[];
  timezone: string;
};

type ParkedSchedule = {
  _id: string;
  name: string;
  playlistName: string;
  isActive: boolean;
  updatedAt: string;
  windows: ParkedWindow[];
};

interface ParkedSchedulesAccordionProps {
  schedules: ParkedSchedule[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDays(days: number[]): string {
  if (!days || days.length === 0 || days.length === 7) {
    return "Every day";
  }
  return [...days].sort((a, b) => a - b).map((day) => DAY_NAMES[day]).join(", ");
}

export function ParkedSchedulesAccordion({ schedules }: ParkedSchedulesAccordionProps) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...schedules].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [schedules],
  );

  const activate = async (id: string) => {
    setSavingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });

      if (!response.ok) {
        throw new Error("Unable to activate parked schedule");
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to activate parked schedule");
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (id: string) => {
    const confirmed = window.confirm("Delete this parked schedule?");
    if (!confirmed) {
      return;
    }

    setSavingId(id);
    setError(null);
    try {
      const response = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Unable to delete parked schedule");
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to delete parked schedule");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <details className="rounded-lg border border-border bg-card p-4" open={ordered.length > 0}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Parking schedules</p>
            <p className="text-xs text-muted-foreground">Inactive rules ready to be reactivated (single-active policy).</p>
          </div>
          <Badge variant="outline">{ordered.length}</Badge>
        </div>
      </summary>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {ordered.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No parked schedules for this scope.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {ordered.map((schedule) => (
            <div key={schedule._id} className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{schedule.name}</p>
                  <p className="text-xs text-muted-foreground">Playlist: {schedule.playlistName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => void activate(schedule._id)}
                    disabled={savingId === schedule._id}
                  >
                    {savingId === schedule._id ? "Saving..." : "Activate"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void remove(schedule._id)}
                    disabled={savingId === schedule._id}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {schedule.windows.map((window, index) => (
                  <div key={`${schedule._id}-${index}`} className="rounded border border-border bg-background p-2">
                    <p className="text-xs font-semibold">{window.startHHMM} - {window.endHHMM}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDays(window.daysOfWeek)}</p>
                    <p className="text-[11px] text-muted-foreground">{window.timezone}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
