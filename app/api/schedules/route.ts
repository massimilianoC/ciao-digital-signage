import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { connectDB } from "@/lib/db/connection";
import { emitManifestToScreen } from "@/lib/scheduling/emitter";
import { ScheduleService, getAffectedScreenIds } from "@/lib/services/schedule.service";
import { withErrorHandler, logger, getOrgIdFromSession } from "@/lib/api-utils";

const scopes = ["org", "group", "screen"] as const;
const priorities = [1, 2, 3] as const;

const createScheduleSchema = z
  .object({
    scope: z.enum(scopes),
    scopeId: z.string().min(1, "scopeId is required"),
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    playlistId: z.string().min(1).optional(),
    layoutId: z.string().min(1).optional(),
    windows: z
      .array(
        z.object({
          startHHMM: z.string().regex(/^\d{2}:\d{2}$/),
          endHHMM: z.string().regex(/^\d{2}:\d{2}$/),
          daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
          rruleString: z.string().optional(),
          timezone: z.string().min(1, "timezone is required"),
        }),
      )
      .default([]),
    name: z.string().min(1).max(200),
  })
  .refine((value) => Boolean(value.playlistId) !== Boolean(value.layoutId), {
    message: "Exactly one of playlistId or layoutId is required",
  });

type Scope = (typeof scopes)[number];

const expectedPriorityByScope: Record<Scope, (typeof priorities)[number]> = {
  org: 1,
  group: 2,
  screen: 3,
};

function parseHHMM(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }

  if (hour < 0 || hour > 24 || minute < 0 || minute > 59) {
    return null;
  }

  if (hour === 24 && minute !== 0) {
    return null;
  }

  return { hour, minute };
}

function toMinutes(value: { hour: number; minute: number }): number {
  return value.hour * 60 + value.minute;
}

function toHHMM(totalMinutes: number): string {
  const bounded = Math.max(0, Math.min(24 * 60, totalMinutes));
  const hour = Math.floor(bounded / 60);
  const minute = bounded % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeEndBoundary(totalMinutes: number): number {
  // Legacy UI paths often save HH:59 as inclusive end of the selected hour.
  // Normalize to exclusive full-hour boundary (HH+1:00).
  if (totalMinutes % 60 === 59) {
    return Math.min(24 * 60, totalMinutes + 1);
  }

  return totalMinutes;
}

function normalizeWindows(
  windows: Array<{
    startHHMM: string;
    endHHMM: string;
    daysOfWeek: number[];
    rruleString?: string;
    timezone: string;
  }>,
): {
  windows:
  | Array<{
    startHHMM: string;
    endHHMM: string;
    daysOfWeek: number[];
    rruleString?: string;
    timezone: string;
  }>
  | null;
  error?: string;
} {
  const normalized = [] as Array<{
    startHHMM: string;
    endHHMM: string;
    daysOfWeek: number[];
    rruleString?: string;
    timezone: string;
  }>;

  for (const [index, window] of windows.entries()) {
    const start = parseHHMM(window.startHHMM);
    const end = parseHHMM(window.endHHMM);
    if (!start || !end) {
      return { windows: null, error: `Invalid time format in windows[${index}]` };
    }

    const startMinutes = toMinutes(start);
    const endMinutes = normalizeEndBoundary(toMinutes(end));
    if (endMinutes <= startMinutes) {
      return { windows: null, error: `endHHMM must be after startHHMM in windows[${index}]` };
    }

    normalized.push({
      ...window,
      startHHMM: toHHMM(startMinutes),
      endHHMM: toHHMM(endMinutes),
    });
  }

  return { windows: normalized };
}

function expandDays(days: number[]): number[] {
  if (!days || days.length === 0) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  return [...new Set(days)].sort((a, b) => a - b);
}

function windowsOverlap(
  left: { startHHMM: string; endHHMM: string; daysOfWeek: number[] },
  right: { startHHMM: string; endHHMM: string; daysOfWeek: number[] },
): boolean {
  const leftStart = parseHHMM(left.startHHMM);
  const leftEnd = parseHHMM(left.endHHMM);
  const rightStart = parseHHMM(right.startHHMM);
  const rightEnd = parseHHMM(right.endHHMM);

  if (!leftStart || !leftEnd || !rightStart || !rightEnd) {
    return false;
  }

  const leftStartMinutes = toMinutes(leftStart);
  const leftEndMinutes = normalizeEndBoundary(toMinutes(leftEnd));
  const rightStartMinutes = toMinutes(rightStart);
  const rightEndMinutes = normalizeEndBoundary(toMinutes(rightEnd));

  if (leftEndMinutes <= leftStartMinutes || rightEndMinutes <= rightStartMinutes) {
    return false;
  }

  const timeIntersects = leftStartMinutes < rightEndMinutes && rightStartMinutes < leftEndMinutes;
  if (!timeIntersects) {
    return false;
  }

  const leftDays = new Set(expandDays(left.daysOfWeek));
  const rightDays = expandDays(right.daysOfWeek);
  return rightDays.some((day) => leftDays.has(day));
}

function hasOverlappingWindow(
  incoming: Array<{ startHHMM: string; endHHMM: string; daysOfWeek: number[] }>,
  existing: Array<{ startHHMM: string; endHHMM: string; daysOfWeek: number[] }>,
): boolean {
  for (const left of incoming) {
    for (const right of existing) {
      if (windowsOverlap(left, right)) {
        return true;
      }
    }
  }
  return false;
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { searchParams } = req.nextUrl;
  const scope = searchParams.get("scope");
  const scopeId = searchParams.get("scopeId");
  const includeInactive = searchParams.get("includeInactive") === "1";

  if ((scope && !scopeId) || (!scope && scopeId)) {
    return NextResponse.json({ error: "scope and scopeId must be provided together" }, { status: 400 });
  }

  if (scope && scopeId) {
    if (!scopes.includes(scope as Scope)) {
      return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    }

    const scopeError = await ScheduleService.validateScopeTarget(orgId, scope as Scope, scopeId);
    if (scopeError) {
      return NextResponse.json({ error: scopeError }, { status: 400 });
    }

    const schedules = await ScheduleService.listByScope(orgId, scope as Scope, scopeId, { includeInactive });
    return NextResponse.json({ schedules });
  }

  const schedules = await ScheduleService.listByOrg(orgId, { includeInactive });
  return NextResponse.json({ schedules });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const body = await req.json().catch(() => null);
  const parsed = createScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const expectedPriority = expectedPriorityByScope[parsed.data.scope];
  if (parsed.data.priority !== expectedPriority) {
    return NextResponse.json(
      { error: `Invalid priority for scope ${parsed.data.scope}. Expected ${expectedPriority}.` },
      { status: 400 },
    );
  }

  const normalizedWindows = normalizeWindows(parsed.data.windows);
  if (!normalizedWindows.windows) {
    return NextResponse.json({ error: normalizedWindows.error ?? "Invalid schedule windows" }, { status: 400 });
  }

  const scopeError = await ScheduleService.validateScopeTarget(orgId, parsed.data.scope, parsed.data.scopeId);
  if (scopeError) {
    return NextResponse.json({ error: scopeError }, { status: 400 });
  }

  const existingSchedules = await ScheduleService.listByScope(orgId, parsed.data.scope, parsed.data.scopeId);
  const overlappingSchedules = existingSchedules.filter((schedule) =>
    hasOverlappingWindow(normalizedWindows.windows!, schedule.windows),
  );

  if (overlappingSchedules.length > 0) {
    const sorted = overlappingSchedules.slice().sort((a, b) => {
      const createdDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (createdDiff !== 0) {
        return createdDiff;
      }
      return b._id.toString().localeCompare(a._id.toString());
    });

    const winner = sorted[0];
    const overwritten = sorted.slice(1);

    const updated = await ScheduleService.update(winner._id.toString(), orgId, {
      name: parsed.data.name,
      playlistId: parsed.data.playlistId,
      layoutId: parsed.data.layoutId,
      windows: normalizedWindows.windows,
      isActive: true,
    });

    if (!updated) {
      return NextResponse.json({ error: "Failed to overwrite existing schedule" }, { status: 500 });
    }

    await Promise.all(
      overwritten.map((schedule) =>
        ScheduleService.update(schedule._id.toString(), orgId, { isActive: false }),
      ),
    );

    await ScheduleService.enforceSingleActiveForTarget(
      orgId,
      updated.scope,
      updated.scopeId.toString(),
      updated._id.toString(),
    );

    const affectedScreenIds = await getAffectedScreenIds(orgId, updated);
    await Promise.all(affectedScreenIds.map((screenId) => emitManifestToScreen(screenId)));

    logger.info("Schedule overwritten", {
      scheduleId: updated._id?.toString(),
      scope: parsed.data.scope,
      overwrittenCount: overwritten.length,
    });

    return NextResponse.json(
      {
        schedule: updated,
        mode: "overwritten",
        overwrittenScheduleIds: overwritten.map((schedule) => schedule._id.toString()),
      },
      { status: 200 },
    );
  }

  const schedule = await ScheduleService.create({
    orgId,
    scope: parsed.data.scope,
    scopeId: parsed.data.scopeId,
    priority: parsed.data.priority,
    name: parsed.data.name,
    playlistId: parsed.data.playlistId,
    layoutId: parsed.data.layoutId,
    windows: normalizedWindows.windows,
    isActive: true,
  });

  await ScheduleService.enforceSingleActiveForTarget(
    orgId,
    schedule.scope,
    schedule.scopeId.toString(),
    schedule._id.toString(),
  );

  const affectedScreenIds = await getAffectedScreenIds(orgId, schedule);
  await Promise.all(affectedScreenIds.map((screenId) => emitManifestToScreen(screenId)));

  logger.info("Schedule created", { scheduleId: schedule._id?.toString(), scope: parsed.data.scope });
  return NextResponse.json({ schedule }, { status: 201 });
});
