import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getIO } from "@/lib/socket";
import { ScheduleService } from "@/lib/services/schedule.service";
import { withErrorHandler, logger, getOrgIdFromSession } from "@/lib/api-utils";

/**
 * Unified override schema — supports both relative and absolute expiry:
 *  - expiryMinutes: relative offset (1–480), computed to an absolute Date
 *  - expiresAt: absolute ISO-8601 string, or null for "never expires"
 *  - If neither is provided, defaults to 30 minutes
 */
const overrideSchema = z
  .object({
    playlistId: z.string().min(1, "playlistId is required"),
    expiryMinutes: z.number().int().min(1).max(480).optional(),
    expiresAt: z.string().datetime().optional().nullable(),
  })
  .refine(
    (data) => !(data.expiryMinutes !== undefined && data.expiresAt !== undefined),
    { message: "Provide either expiryMinutes or expiresAt, not both" },
  );

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId, userId } = sess;

  const override = await ScheduleService.getActiveOverride(orgId);
  return NextResponse.json({ override: override ?? null });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId, userId } = sess;

  const body = await req.json().catch(() => null);
  const parsed = overrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Resolve expiry: explicit expiresAt > expiryMinutes > default 30 min
  let expiresAt: Date | null;
  if (parsed.data.expiresAt !== undefined) {
    // Absolute mode: ISO string or null (never expires)
    expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  } else {
    // Relative mode (or default)
    const minutes = parsed.data.expiryMinutes ?? 30;
    expiresAt = new Date(Date.now() + minutes * 60_000);
  }

  const override = await ScheduleService.publishOverride({
    orgId,
    playlistId: parsed.data.playlistId,
    publishedBy: userId,
    expiresAt,
  });

  try {
    const io = getIO();
    io.of("/player").to(`org:${orgId}`).emit("force_override", {
      playlistId: parsed.data.playlistId,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      publishedBy: userId,
    });
  } catch {
    // Socket server may not be active in unit/local builds.
  }

  logger.info("Override published", { orgId, playlistId: parsed.data.playlistId });
  return NextResponse.json({ override }, { status: 201 });
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  await ScheduleService.clearOverride(orgId);

  try {
    const io = getIO();
    io.of("/player").to(`org:${orgId}`).emit("override_clear", {
      orgId,
    });
  } catch {
    // Socket server may not be active in unit/local builds.
  }

  logger.info("Override cleared", { orgId });
  return NextResponse.json({ message: "Override cleared" });
});
