import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { emitManifestToScreen } from "@/lib/scheduling/emitter";
import { getAffectedScreenIds, ScheduleService } from "@/lib/services/schedule.service";
import { withErrorHandler, logger, getOrgIdFromSession } from "@/lib/api-utils";

type Params = { params: Promise<{ id: string }> };

const updateScheduleSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
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
      .optional(),
    playlistId: z.string().min(1).optional(),
    layoutId: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => !(value.playlistId && value.layoutId), {
    message: "playlistId and layoutId are mutually exclusive",
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

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

export const GET = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { id } = await params;
  const schedule = await ScheduleService.findById(id, orgId);
  if (!schedule) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ schedule });
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const normalizedData = { ...parsed.data };
  if (normalizedData.windows) {
    const normalizedWindows = normalizeWindows(normalizedData.windows);
    if (!normalizedWindows.windows) {
      return NextResponse.json({ error: normalizedWindows.error ?? "Invalid schedule windows" }, { status: 400 });
    }
    normalizedData.windows = normalizedWindows.windows;
  }

  const schedule = await ScheduleService.update(id, orgId, normalizedData);
  if (!schedule) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (normalizedData.isActive === true) {
    await ScheduleService.enforceSingleActiveForTarget(
      orgId,
      schedule.scope,
      schedule.scopeId.toString(),
      schedule._id.toString(),
    );
  }

  const affectedScreenIds = await getAffectedScreenIds(orgId, schedule);
  await Promise.all(affectedScreenIds.map((screenId) => emitManifestToScreen(screenId)));

  logger.info("Schedule updated", { scheduleId: id });
  return NextResponse.json({ schedule });
});

export const PUT = withErrorHandler(async (req: NextRequest, context: Params) => {
  return PATCH(req, context);
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { id } = await params;
  const schedule = await ScheduleService.findById(id, orgId);
  if (!schedule) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const deleted = await ScheduleService.delete(id, orgId);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (schedule.isActive) {
    const parked = await ScheduleService.findMostRecentParkedForTarget(
      orgId,
      schedule.scope,
      schedule.scopeId.toString(),
      { excludeId: id },
    );

    if (parked) {
      await ScheduleService.enforceSingleActiveForTarget(
        orgId,
        parked.scope,
        parked.scopeId.toString(),
        parked._id.toString(),
      );
    }
  }

  const affectedScreenIds = await getAffectedScreenIds(orgId, schedule);
  await Promise.all(affectedScreenIds.map((screenId) => emitManifestToScreen(screenId)));

  logger.info("Schedule deleted", { scheduleId: id });
  return new NextResponse(null, { status: 204 });
});
