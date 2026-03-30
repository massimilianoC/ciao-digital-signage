import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { CompositeLayoutModel } from "@/lib/db/models/CompositeLayout";
import { getOrgIdFromSession, withErrorHandler } from "@/lib/api-utils";

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

  // Count other layouts that reference this layout in a zone (nesting usage)
  const nestingCount = await CompositeLayoutModel.countDocuments({
    orgId,
    _id: { $ne: new Types.ObjectId(id) },
    "zones.content.type": "layout",
    "zones.content.refId": new Types.ObjectId(id),
  });

  return NextResponse.json({ count: nestingCount });
});
