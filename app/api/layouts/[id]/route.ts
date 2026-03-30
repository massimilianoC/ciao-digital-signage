import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { CompositeLayoutModel } from "@/lib/db/models/CompositeLayout";
import { Schedule } from "@/lib/db/models/Schedule";
import { getOrgIdFromSession, logger, withErrorHandler } from "@/lib/api-utils";
import { emitManifestToScreen } from "@/lib/scheduling/emitter";
import { getLayoutImpact } from "@/lib/services/layout-impact.service";

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

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  resolution: z
    .object({
      width: z.number().int().min(320).max(7680),
      height: z.number().int().min(240).max(4320),
    })
    .optional(),
  zones: z.array(layoutZoneSchema).optional(),
  backgroundImage: z.string().url().optional().or(z.literal("")),
});

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await connectDB();
  const layout = await CompositeLayoutModel.findOne({ _id: id, orgId }).lean();
  if (!layout) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(layout);
});

export const PATCH = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();
  const layout = await CompositeLayoutModel.findOneAndUpdate(
    { _id: id, orgId },
    { $set: parsed.data },
    { new: true },
  ).lean();

  if (!layout) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const impact = await getLayoutImpact(orgId, id);
  await Promise.all(impact.screens.map((screen) => emitManifestToScreen(screen.id)));

  logger.info("CompositeLayout updated", { layoutId: id });
  return NextResponse.json(layout);
});

export const DELETE = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await connectDB();
  const impact = await getLayoutImpact(orgId, id).catch((error) => {
    if (error instanceof Error && error.message === "LAYOUT_NOT_FOUND") {
      return null;
    }
    throw error;
  });

  const layout = await CompositeLayoutModel.findOneAndDelete({ _id: id, orgId }).lean();
  if (!layout) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const orgObjectId = new Types.ObjectId(orgId);
  const layoutObjectId = new Types.ObjectId(id);

  await Promise.all([
    Schedule.deleteMany({ orgId: orgObjectId, layoutId: layoutObjectId }),
    CompositeLayoutModel.updateMany(
      {
        orgId: orgObjectId,
        "zones.content.type": "layout",
        "zones.content.refId": layoutObjectId,
      },
      {
        $unset: {
          "zones.$[zone].content": "",
        },
      },
      {
        arrayFilters: [
          {
            "zone.content.type": "layout",
            "zone.content.refId": layoutObjectId,
          },
        ],
      },
    ),
  ]);

  const impactedScreenIds = impact?.screens.map((screen) => screen.id) ?? [];
  if (impactedScreenIds.length > 0) {
    await Promise.all(impactedScreenIds.map((screenId) => emitManifestToScreen(screenId)));
  }

  logger.info("CompositeLayout deleted", { layoutId: id });
  return NextResponse.json({ ok: true, impactedScreens: impactedScreenIds.length });
});
