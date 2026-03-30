import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { connectDB } from "@/lib/db/connection";
import { emitManifestToScreen } from "@/lib/scheduling/emitter";
import { GroupService } from "@/lib/services/group.service";
import { getAffectedScreenIdsByScope, ScheduleService } from "@/lib/services/schedule.service";
import { withErrorHandler, logger, getOrgIdFromSession } from "@/lib/api-utils";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  defaultPlaylistId: z.string().nullable().optional(),
  screenIds: z.array(z.string()).optional(),
});

export const GET = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { id } = await params;

  await connectDB();

  const service = new GroupService(orgId);
  const group = await service.getById(id);
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  return NextResponse.json(group);
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

  await connectDB();

  const service = new GroupService(orgId);
  await service.update(id, {
    name: parsed.data.name,
    description: parsed.data.description,
    defaultPlaylistId:
      parsed.data.defaultPlaylistId === undefined
        ? undefined
        : parsed.data.defaultPlaylistId === null
          ? null
          : new Types.ObjectId(parsed.data.defaultPlaylistId),
  });

  if (parsed.data.screenIds) {
    await service.assignScreens(id, parsed.data.screenIds);
  }

  const updated = await service.getById(id);
  if (!updated) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...updated,
    _id: updated._id.toString(),
    screenIds: parsed.data.screenIds ?? [],
  });
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

  const affectedScreenIds = await getAffectedScreenIdsByScope(orgId, "group", id);

  const service = new GroupService(orgId);
  await service.remove(id);
  await ScheduleService.deleteByScope(orgId, "group", id);

  if (affectedScreenIds.length > 0) {
    await Promise.all(affectedScreenIds.map((screenId) => emitManifestToScreen(screenId)));
  }

  logger.info("Group deleted", { groupId: id });
  return new NextResponse(null, { status: 204 });
});
