import { Types } from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { connectDB } from "@/lib/db/connection";
import { GroupService } from "@/lib/services/group.service";
import { withErrorHandler, logger, getOrgIdFromSession } from "@/lib/api-utils";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  defaultPlaylistId: z.string().optional(),
  screenIds: z.array(z.string()).optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  await connectDB();

  const service = new GroupService(orgId);
  const groups = await service.list();

  return NextResponse.json(groups);
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();

  const service = new GroupService(orgId);
  const group = await service.createGroup({
    name: parsed.data.name,
    description: parsed.data.description,
    defaultPlaylistId: parsed.data.defaultPlaylistId
      ? new Types.ObjectId(parsed.data.defaultPlaylistId)
      : undefined,
  });

  const screenIds = parsed.data.screenIds ?? [];
  if (screenIds.length > 0) {
    await service.assignScreens(group._id.toString(), screenIds);
  }

  return NextResponse.json(
    {
      ...group,
      _id: group._id.toString(),
      screenIds,
    },
    { status: 201 },
  );
});
