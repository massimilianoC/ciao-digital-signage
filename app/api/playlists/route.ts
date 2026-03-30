import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { connectDB } from "@/lib/db/connection";
import { PlaylistService } from "@/lib/services/playlist.service";
import { withErrorHandler, logger, getOrgIdFromSession } from "@/lib/api-utils";

const playlistItemSchema = z.object({
  contentId: z.string().min(1, "contentId required"),
  title: z.string().min(1).max(200).optional(),
  thumbnailUrl: z.string().min(1).optional(),
  fitMode: z.enum(["cover", "fit"]).optional(),
  backgroundColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).nullable().optional(),
  durationMs: z.number().int().min(500).nullable().optional(),
  order: z.number().int().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  status: z.enum(["active", "suspended"]).optional(),
  fitModeOverride: z.enum(["cover", "fit"]).nullable().optional(),
  backgroundColorOverride: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).nullable().optional(),
  transitionType: z.enum(["cut", "fade"]).optional(),
  transitionMs: z.number().int().min(0).max(5000).optional(),
  items: z.array(playlistItemSchema).default([]),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  await connectDB();
  const service = new PlaylistService(orgId);
  await service.backfillPlaybackFlags();
  const playlists = await service.list();

  return NextResponse.json(playlists);
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
  const service = new PlaylistService(orgId);
  await service.backfillPlaybackFlags();
  const playlist = await service.createPlaylist(parsed.data);

  logger.info("Playlist created", { playlistId: playlist._id?.toString() });
  return NextResponse.json(playlist, { status: 201 });
});
