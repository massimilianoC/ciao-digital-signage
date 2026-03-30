import { NextRequest, NextResponse } from "next/server";

import { connectDB } from "@/lib/db/connection";
import { getIO } from "@/lib/socket";
import { ScreenService } from "@/lib/services/screen.service";
import { withErrorHandler, logger, getOrgIdFromSession } from "@/lib/api-utils";

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) {
    logger.warn("Refresh attempt without session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orgId } = sess;

  const { id } = await params;

  await connectDB();
  const screen = await new ScreenService(orgId).getById(id);
  if (!screen) {
    return NextResponse.json({ error: "Screen not found" }, { status: 404 });
  }

  try {
    const io = getIO();
    io.of("/player").to(`screen:${id}`).emit("remote_refresh", {
      requestedAt: new Date().toISOString(),
    });
  } catch {
    // Socket server may not be active in unit/local builds.
  }

  logger.info("Screen refresh requested", { screenId: id });
  return NextResponse.json({ accepted: true, screenId: id }, { status: 202 });
});
