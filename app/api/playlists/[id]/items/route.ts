import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { connectDB } from "@/lib/db/connection";
import { PlaylistService } from "@/lib/services/playlist.service";
import { getOrgIdFromSession } from "@/lib/api-utils";

type Params = { params: Promise<{ id: string }> };

const itemSchema = z.object({
  contentId: z.string().min(1, "contentId required"),
  durationMs: z.number().int().min(500).nullable().optional(),
  order: z.number().int().optional(),
});

const replaceSchema = z.object({
  items: z.array(itemSchema),
});

export async function PUT(req: NextRequest, { params }: Params) {
  const sess = await getOrgIdFromSession(req);
  if (!sess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orgId } = sess;

  const body = await req.json().catch(() => null);
  const parsed = replaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;

  await connectDB();
  const service = new PlaylistService(orgId);
  const updated = await service.replaceItems(id, parsed.data.items);
  if (!updated) {
    return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
