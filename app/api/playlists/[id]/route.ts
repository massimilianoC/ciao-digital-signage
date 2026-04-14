import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { ForceOverride } from "@/lib/db/models/ForceOverride";
import { GroupModel } from "@/lib/db/models/Group";
import { Schedule } from "@/lib/db/models/Schedule";
import { ScreenModel } from "@/lib/db/models/Screen";
import { emitManifestToScreen } from "@/lib/scheduling/emitter";
import { PlaylistService } from "@/lib/services/playlist.service";
import { ScheduleService } from "@/lib/services/schedule.service";
import { withErrorHandler, logger, getOrgIdFromSession } from "@/lib/api-utils";

type Params = { params: Promise<{ id: string }> };
const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  loop: z.boolean().optional(),
  stopOnLastItem: z.boolean().optional(),
  fitModeOverride: z.enum(["cover", "fit"]).nullable().optional(),
  backgroundColorOverride: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).nullable().optional(),
  transitionType: z.enum(["cut", "fade"]).optional(),
  transitionMs: z.number().int().min(0).max(5000).optional(),
});

const replaceItemsSchema = z.object({
  items: z.array(
    z.object({
      contentId: z.string().min(1),
      title: z.string().min(1).max(200).optional(),
      thumbnailUrl: z.string().min(1).optional(),
      fitMode: z.enum(["cover", "fit"]).optional(),
      backgroundColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).nullable().optional(),
      durationMs: z.number().int().min(500).nullable().optional(),
      durationOverride: z.boolean().optional(),
    }),
  ),
});

async function getAffectedScreenIdsByPlaylist(orgId: string, playlistId: string): Promise<string[]> {
  await ScheduleService.pruneInvalidSchedules(orgId);

  const orgObjectId = new Types.ObjectId(orgId);
  const playlistObjectId = new Types.ObjectId(playlistId);
  const affected = new Set<string>();

  const screensUsingDefault = await ScreenModel.find({
    orgId: orgObjectId,
    defaultPlaylistId: playlistObjectId,
  })
    .select({ _id: 1 })
    .lean<Array<{ _id: Types.ObjectId }>>();

  for (const screen of screensUsingDefault) {
    affected.add(screen._id.toString());
  }

  const groupsUsingDefault = await GroupModel.find({
    orgId: orgObjectId,
    defaultPlaylistId: playlistObjectId,
  })
    .select({ _id: 1 })
    .lean<Array<{ _id: Types.ObjectId }>>();

  if (groupsUsingDefault.length > 0) {
    const groupScreens = await ScreenModel.find({
      orgId: orgObjectId,
      groupId: { $in: groupsUsingDefault.map((group) => group._id) },
    })
      .select({ _id: 1 })
      .lean<Array<{ _id: Types.ObjectId }>>();

    for (const screen of groupScreens) {
      affected.add(screen._id.toString());
    }
  }

  const schedules = await Schedule.find({
    orgId: orgObjectId,
    playlistId: playlistObjectId,
    isActive: true,
  })
    .select({ scope: 1, scopeId: 1 })
    .lean<Array<{ scope: "org" | "group" | "screen"; scopeId: Types.ObjectId }>>();

  const hasOrgScope = schedules.some((schedule) => schedule.scope === "org");
  if (hasOrgScope) {
    const orgScreens = await ScreenModel.find({ orgId: orgObjectId })
      .select({ _id: 1 })
      .lean<Array<{ _id: Types.ObjectId }>>();
    for (const screen of orgScreens) {
      affected.add(screen._id.toString());
    }
  }

  const groupScopeIds = schedules
    .filter((schedule) => schedule.scope === "group")
    .map((schedule) => schedule.scopeId);

  if (groupScopeIds.length > 0) {
    const groupScreens = await ScreenModel.find({
      orgId: orgObjectId,
      groupId: { $in: groupScopeIds },
    })
      .select({ _id: 1 })
      .lean<Array<{ _id: Types.ObjectId }>>();

    for (const screen of groupScreens) {
      affected.add(screen._id.toString());
    }
  }

  for (const schedule of schedules) {
    if (schedule.scope === "screen") {
      affected.add(schedule.scopeId.toString());
    }
  }

  const activeOverride = await ForceOverride.findOne({
    orgId: orgObjectId,
    isActive: true,
    playlistId: playlistObjectId,
  })
    .select({ _id: 1 })
    .lean<{ _id: Types.ObjectId } | null>();

  if (activeOverride) {
    const orgScreens = await ScreenModel.find({ orgId: orgObjectId })
      .select({ _id: 1 })
      .lean<Array<{ _id: Types.ObjectId }>>();
    for (const screen of orgScreens) {
      affected.add(screen._id.toString());
    }
  }

  return Array.from(affected);
}

async function emitPlaylistUpdateToScreens(orgId: string, playlistId: string): Promise<void> {
  const affectedScreens = await getAffectedScreenIdsByPlaylist(orgId, playlistId);
  if (affectedScreens.length === 0) {
    return;
  }

  await Promise.all(affectedScreens.map((screenId) => emitManifestToScreen(screenId)));
}

export const GET = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { id } = await params;

  await connectDB();
  const service = new PlaylistService(orgId);
  await service.backfillPlaybackFlags();
  const playlist = await service.getByIdPopulated(id);
  if (!playlist) {
    return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  }

  return NextResponse.json(playlist);
});

export const PUT = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.loop === true && parsed.data.stopOnLastItem === true) {
    return NextResponse.json(
      { error: "stopOnLastItem cannot be enabled when loop is enabled" },
      { status: 400 },
    );
  }

  await connectDB();
  const service = new PlaylistService(orgId);
  await service.backfillPlaybackFlags();

  const normalizedUpdate = { ...parsed.data };
  if (normalizedUpdate.loop === true) {
    normalizedUpdate.stopOnLastItem = false;
  }

  await service.update(id, normalizedUpdate);
  await emitPlaylistUpdateToScreens(orgId, id);

  const updated = await service.getByIdPopulated(id);
  if (!updated) {
    return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  }

  logger.info("Playlist updated", { playlistId: id });
  return NextResponse.json(updated);
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = replaceItemsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();
  const service = new PlaylistService(orgId);
  await service.backfillPlaybackFlags();
  const updated = await service.replaceItems(
    id,
    parsed.data.items.map((item, index) => ({
      contentId: item.contentId,
      title: item.title,
      thumbnailUrl: item.thumbnailUrl,
      fitMode: item.fitMode,
      backgroundColor: item.backgroundColor,
      durationMs: item.durationMs,
      durationOverride: item.durationOverride,
      order: index,
    })),
  );

  await emitPlaylistUpdateToScreens(orgId, id);

  if (!updated) {
    return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  }

  logger.info("Playlist items replaced", { playlistId: id });
  return NextResponse.json(updated);
});

export const DELETE = withErrorHandler(async (req: NextRequest, { params }: Params) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { id } = await params;

  await connectDB();
  const affectedScreenIds = await getAffectedScreenIdsByPlaylist(orgId, id);

  const orgObjectId = new Types.ObjectId(orgId);
  const playlistObjectId = new Types.ObjectId(id);

  await Promise.all([
    ScreenModel.updateMany(
      { orgId: orgObjectId, defaultPlaylistId: playlistObjectId },
      { $unset: { defaultPlaylistId: 1 } },
    ),
    GroupModel.updateMany(
      { orgId: orgObjectId, defaultPlaylistId: playlistObjectId },
      { $unset: { defaultPlaylistId: 1 } },
    ),
    Schedule.deleteMany({ orgId: orgObjectId, playlistId: playlistObjectId }),
    ForceOverride.deleteMany({ orgId: orgObjectId, playlistId: playlistObjectId }),
  ]);

  const service = new PlaylistService(orgId);
  await service.backfillPlaybackFlags();
  await service.remove(id);

  await Promise.all(affectedScreenIds.map((screenId) => emitManifestToScreen(screenId)));

  logger.info("Playlist deleted", { playlistId: id });
  return new NextResponse(null, { status: 204 });
});
