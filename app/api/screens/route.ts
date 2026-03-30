import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { connectDB } from "@/lib/db/connection";
import { ScreenModel } from "@/lib/db/models/Screen";
import { connectivityToLegacyStatus, deriveScreenConnectivity } from "@/lib/screens/connectivity";
import { ScreenService } from "@/lib/services/screen.service";
import { withErrorHandler, logger, getOrgIdFromSession } from "@/lib/api-utils";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  location: z.string().optional(),
  timezone: z.string().min(1).default("UTC"),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  await connectDB();

  const service = new ScreenService(orgId);
  const screens = await service.list();

  const payload = screens.map((screen) => {
    const connectivity = deriveScreenConnectivity(screen);
    return {
      ...screen,
      status: connectivityToLegacyStatus(connectivity),
      connectivity,
    };
  });

  return NextResponse.json(payload);
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

  const screen = await ScreenModel.create({
    orgId,
    name: parsed.data.name,
    location: parsed.data.location,
    timezone: parsed.data.timezone,
    status: "offline",
    screenToken: randomUUID(),
  });

  logger.info("Screen created", { screenId: screen._id?.toString() });
  return NextResponse.json(screen, { status: 201 });
});
