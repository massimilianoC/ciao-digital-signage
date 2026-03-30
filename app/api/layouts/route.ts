import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { connectDB } from "@/lib/db/connection";
import { CompositeLayoutModel } from "@/lib/db/models/CompositeLayout";
import { getOrgIdFromSession, logger, withErrorHandler } from "@/lib/api-utils";

const zoneContentSchema = z.object({
  type: z.enum(["playlist", "content", "layout"]),
  refId: z.string().min(1),
  label: z.string().min(1),
});

const layoutZoneSchema = z.object({
  id: z.string().min(1),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
  label: z.string().optional(),
  content: zoneContentSchema.optional(),
  backgroundImage: z.string().url().optional().or(z.literal("")),
  padding: z.number().min(0).max(200).optional(),
  borderRadius: z.number().min(0).max(200).optional(),
  borderColor: z.string().min(1).max(80).optional(),
  borderSize: z.number().min(0).max(32).optional(),
  dropShadow: z.boolean().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  resolution: z
    .object({
      width: z.number().int().min(320).max(7680),
      height: z.number().int().min(240).max(4320),
    })
    .optional(),
  zones: z.array(layoutZoneSchema).default([]),
  backgroundImage: z.string().url().optional().or(z.literal("")),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  await connectDB();
  const layouts = await CompositeLayoutModel.find({ orgId, status: "active" })
    .sort({ updatedAt: -1 })
    .lean();

  return NextResponse.json(layouts);
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
  const layout = await CompositeLayoutModel.create({
    orgId,
    name: parsed.data.name,
    resolution: parsed.data.resolution ?? { width: 1920, height: 1080 },
    zones: parsed.data.zones,
    backgroundImage: parsed.data.backgroundImage || undefined,
  });

  logger.info("CompositeLayout created", { layoutId: layout._id?.toString() });
  return NextResponse.json(layout, { status: 201 });
});
