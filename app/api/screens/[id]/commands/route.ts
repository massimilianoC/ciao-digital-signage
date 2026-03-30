import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { connectDB } from "@/lib/db/connection";
import { ScreenService } from "@/lib/services/screen.service";
import { getOrgIdFromSession } from "@/lib/api-utils";

const commandSchema = z.object({
  command: z.enum(["refresh"]),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const sess = await getOrgIdFromSession(req);
  if (!sess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orgId } = sess;

  const body = await req.json().catch(() => null);
  const parsed = commandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;

  await connectDB();

  const service = new ScreenService(orgId);
  const screen = await service.getById(id);
  if (!screen) {
    return NextResponse.json({ error: "Screen not found" }, { status: 404 });
  }

  console.log(`[commands] Screen ${id} command: ${parsed.data.command} (Socket.IO emit - Phase 4)`);

  return NextResponse.json(
    { accepted: true, command: parsed.data.command, screenId: id },
    { status: 202 },
  );
}
