import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { CompositeLayoutModel, type LayoutZone } from "@/lib/db/models/CompositeLayout";
import { ContentModel, type IContentItem } from "@/lib/db/models/Content";
import { PlaylistModel, type IPlaylist } from "@/lib/db/models/Playlist";
import { ScreenModel } from "@/lib/db/models/Screen";
import {
  PLAYER_SESSION_COOKIE_NAME,
  isPlayerSessionId,
  validatePlayerSessionLock,
} from "@/lib/player/session-lock";
import { getOrgIdFromSession, withErrorHandler } from "@/lib/api-utils";

type ResolvedZoneContent =
  | {
    kind: "media";
    mediaType: "image" | "video" | "url" | "widget";
    url: string;
    urlSubtype?: "youtube" | "video" | "image" | "pdf" | "webpage";
    fitMode?: "cover" | "fit";
    backgroundColor?: string | null;
  }
  | {
    kind: "layout";
    layoutId: string;
  };

/**
 * Public endpoint for the player runtime to fetch a composite layout definition.
 * Authenticated via screen token (screenId + token query params).
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const layoutId = req.nextUrl.searchParams.get("layoutId")?.trim();
  const screenId = req.nextUrl.searchParams.get("screenId")?.trim();
  const token = req.nextUrl.searchParams.get("token")?.trim();

  if (!layoutId || !screenId || !token) {
    return NextResponse.json({ error: "layoutId, screenId, and token are required" }, { status: 400 });
  }

  if (!Types.ObjectId.isValid(layoutId) || !Types.ObjectId.isValid(screenId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const sessionId = req.cookies.get(PLAYER_SESSION_COOKIE_NAME)?.value;
  const hasPlayerSession = isPlayerSessionId(sessionId);
  const cmsSession = hasPlayerSession ? null : await getOrgIdFromSession(req);

  if (!hasPlayerSession && !cmsSession) {
    return NextResponse.json({ error: "Missing player session" }, { status: 401 });
  }

  if (hasPlayerSession) {
    const sessionValidation = await validatePlayerSessionLock(screenId, token, sessionId, {
      touch: true,
    });

    if (!sessionValidation.granted) {
      return NextResponse.json(
        {
          error:
            sessionValidation.code === "SESSION_LOCKED"
              ? "Player session already active on another browser"
              : "Unauthorized",
          code: sessionValidation.code,
        },
        { status: sessionValidation.code === "SESSION_LOCKED" ? 409 : 401 },
      );
    }
  }

  await connectDB();

  // Verify screen token
  const screen = await ScreenModel.findOne({ _id: screenId, screenToken: token })
    .select({ orgId: 1 })
    .lean();

  if (!screen?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (cmsSession && cmsSession.orgId !== screen.orgId.toString()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const layout = await CompositeLayoutModel.findOne({
    _id: layoutId,
    orgId: screen.orgId,
    status: "active",
  }).lean();

  if (!layout) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const zones = layout.zones as LayoutZone[];
  const directContentIds = zones
    .map((z) => (z.content?.type === "content" ? z.content.refId.toString() : null))
    .filter((value): value is string => Boolean(value));

  const playlistIds = zones
    .map((z) => (z.content?.type === "playlist" ? z.content.refId.toString() : null))
    .filter((value): value is string => Boolean(value));

  const directContents = await ContentModel.find({
    orgId: screen.orgId,
    _id: { $in: directContentIds.map((id) => new Types.ObjectId(id)) },
    status: "active",
  }).lean<IContentItem[]>();
  const directContentById = new Map(directContents.map((c) => [c._id.toString(), c]));

  const playlists = await PlaylistModel.find({
    orgId: screen.orgId,
    _id: { $in: playlistIds.map((id) => new Types.ObjectId(id)) },
    status: "active",
  }).lean<IPlaylist[]>();
  const playlistById = new Map(playlists.map((p) => [p._id.toString(), p]));

  const playlistFirstContentIds = playlists
    .map((playlist) => {
      const first = [...(playlist.items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
      return first?.contentId?.toString() ?? null;
    })
    .filter((value): value is string => Boolean(value));

  const playlistContents = await ContentModel.find({
    orgId: screen.orgId,
    _id: { $in: playlistFirstContentIds.map((id) => new Types.ObjectId(id)) },
    status: "active",
  }).lean<IContentItem[]>();
  const playlistContentById = new Map(playlistContents.map((c) => [c._id.toString(), c]));

  const resolveContent = (zone: LayoutZone): ResolvedZoneContent | undefined => {
    if (!zone.content) {
      return undefined;
    }

    if (zone.content.type === "layout") {
      return { kind: "layout", layoutId: zone.content.refId.toString() };
    }

    if (zone.content.type === "content") {
      const content = directContentById.get(zone.content.refId.toString());
      if (!content) {
        return undefined;
      }

      const url = content.config?.fileUrl ?? content.config?.url;
      if (!url) {
        return undefined;
      }

      return {
        kind: "media",
        mediaType: content.type,
        url,
        urlSubtype: content.config?.urlSubtype,
      };
    }

    const playlist = playlistById.get(zone.content.refId.toString());
    if (!playlist) {
      return undefined;
    }

    const firstItem = [...(playlist.items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
    if (!firstItem) {
      return undefined;
    }

    const content = playlistContentById.get(firstItem.contentId.toString());
    if (!content) {
      return undefined;
    }

    const url = content.config?.fileUrl ?? content.config?.url;
    if (!url) {
      return undefined;
    }

    return {
      kind: "media",
      mediaType: content.type,
      url,
      urlSubtype: content.config?.urlSubtype,
      fitMode: firstItem.fitMode ?? playlist.fitModeOverride ?? undefined,
      backgroundColor: firstItem.backgroundColor ?? playlist.backgroundColorOverride ?? null,
    };
  };

  return NextResponse.json({
    _id: layout._id.toString(),
    name: layout.name,
    resolution: layout.resolution,
    backgroundImage: layout.backgroundImage,
    zones: zones.map((z: LayoutZone) => ({
      id: z.id,
      x: z.x,
      y: z.y,
      width: z.width,
      height: z.height,
      label: z.label,
      backgroundImage: z.backgroundImage,
      padding: z.padding,
      borderRadius: z.borderRadius,
      borderColor: z.borderColor,
      borderSize: z.borderSize,
      dropShadow: z.dropShadow,
      content: z.content
        ? { type: z.content.type, refId: z.content.refId.toString(), label: z.content.label }
        : undefined,
      resolved: resolveContent(z),
    })),
  });
});
