import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { connectDB } from "@/lib/db/connection";
import { getIO } from "@/lib/socket";
import { connectivityToLegacyStatus, deriveScreenConnectivity } from "@/lib/screens/connectivity";
import { ScheduleService } from "@/lib/services/schedule.service";
import { ScreenService } from "@/lib/services/screen.service";
import { withErrorHandler, logger, getOrgIdFromSession } from "@/lib/api-utils";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  location: z.string().optional(),
  timezone: z.string().optional(),
  operatingMode: z.enum(["managed", "offline"]).optional(),
  disconnectPolicy: z.enum(["keep_cache", "show_default"]).optional(),
  allowMultiSession: z.boolean().optional(),
  groupId: z.string().nullable().optional(),
  defaultPlaylistId: z.string().nullable().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { id } = await params;

  await connectDB();

  const service = new ScreenService(orgId);
  const screen = await service.getById(id);

  if (!screen) {
    return NextResponse.json({ error: "Screen not found" }, { status: 404 });
  }

  const connectivity = deriveScreenConnectivity(screen);
  return NextResponse.json({
    ...screen,
    status: connectivityToLegacyStatus(connectivity),
    connectivity,
  });
});

async function handleUpdate(req: NextRequest, { params }: Params) {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updatePayload: {
    name?: string;
    location?: string;
    timezone?: string;
    operatingMode?: "managed" | "offline";
    disconnectPolicy?: "keep_cache" | "show_default";
    allowMultiSession?: boolean;
    groupId?: Types.ObjectId | null;
    defaultPlaylistId?: Types.ObjectId | null;
  } = {
    name: parsed.data.name,
    location: parsed.data.location,
    timezone: parsed.data.timezone,
    operatingMode: parsed.data.operatingMode,
    disconnectPolicy: parsed.data.disconnectPolicy,
    allowMultiSession: parsed.data.allowMultiSession,
  };

  if (parsed.data.groupId !== undefined) {
    updatePayload.groupId = parsed.data.groupId ? new Types.ObjectId(parsed.data.groupId) : null;
  }

  if (parsed.data.defaultPlaylistId !== undefined) {
    updatePayload.defaultPlaylistId = parsed.data.defaultPlaylistId
      ? new Types.ObjectId(parsed.data.defaultPlaylistId)
      : null;
  }

  await connectDB();

  const service = new ScreenService(orgId);
  await service.update(id, updatePayload);

  const updated = await service.getById(id);
  if (!updated) {
    return NextResponse.json({ error: "Screen not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export const PUT = withErrorHandler(async (req: NextRequest, context: Params) => {
  return handleUpdate(req, context);
});

export const PATCH = withErrorHandler(async (req: NextRequest, context: Params) => {
  return handleUpdate(req, context);
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { id } = await params;

  await connectDB();

  const service = new ScreenService(orgId);
  const screen = await service.getById(id);
  if (!screen) {
    return NextResponse.json({ error: "Screen not found" }, { status: 404 });
  }

  try {
    const io = getIO();
    const playerRoom = `screen:${id}`;
    io.of("/player").to(playerRoom).emit("override_clear");
    io.of("/player").to(playerRoom).emit("remote_refresh");
    io.of("/player").in(playerRoom).disconnectSockets(true);
  } catch {
    // Socket server may be unavailable during tests or cold start.
  }

  await service.remove(id);
  await ScheduleService.deleteByScope(orgId, "screen", id);

  logger.info("Screen deleted", { screenId: id });
  return new NextResponse(null, { status: 204 });
});
