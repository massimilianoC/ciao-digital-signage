import fs from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";

import { connectDB } from "@/lib/db/connection";
import { type IContentItem } from "@/lib/db/models/Content";
import { PlaylistModel } from "@/lib/db/models/Playlist";
import { ContentService } from "@/lib/services/content.service";
import { withErrorHandler, logger, getOrgIdFromSession } from "@/lib/api-utils";

type ContentCreateInput = Omit<IContentItem, "_id" | "orgId" | "createdAt" | "updatedAt">;
type ContentCreateInputPayload = Omit<ContentCreateInput, "status"> & { status?: "active" | "suspended" };

function parseTags(rawTags: string | null): string[] | undefined {
  if (!rawTags) {
    return undefined;
  }

  const tags = rawTags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  return tags.length > 0 ? tags : undefined;
}

const urlSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.literal("url"),
  folder: z.string().default("/"),
  tags: z.array(z.string()).default([]),
  defaultDurationMs: z.number().int().min(1000).default(10000),
  config: z.object({
    url: z.url(),
    urlSubtype: z.enum(["youtube", "video", "image", "pdf", "webpage"]).default("webpage"),
    html: z.string().optional(),
  }),
});

const widgetSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.literal("widget"),
  folder: z.string().default("/"),
  tags: z.array(z.string()).default([]),
  defaultDurationMs: z.number().int().min(1000).default(10000),
  config: z.object({
    widgetType: z.enum(["weather", "rss", "datetime"]),
    params: z.record(z.string(), z.unknown()).default({}),
  }),
});

const createSchema = z.discriminatedUnion("type", [urlSchema, widgetSchema]);

export const GET = withErrorHandler(async (req: NextRequest) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  await connectDB();

  const { searchParams } = new URL(req.url);
  const folder = searchParams.get("folder") ?? undefined;
  const tags = parseTags(searchParams.get("tags"));
  const includeInternalWebappAssets = searchParams.get("includeInternalWebappAssets") === "true";

  const service = new ContentService(orgId);
  const items = await service.list(folder, tags, includeInternalWebappAssets);

  return NextResponse.json(items);
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

  const service = new ContentService(orgId);
  const payload: ContentCreateInputPayload = {
    name: parsed.data.name,
    type: parsed.data.type,
    folder: parsed.data.folder,
    tags: parsed.data.tags,
    defaultDurationMs: parsed.data.defaultDurationMs,
    config: parsed.data.config,
  };

  const item = await service.createContent(payload as ContentCreateInputPayload);

  logger.info("Content created", { contentId: item._id?.toString(), type: parsed.data.type });
  return NextResponse.json(item, { status: 201 });
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = sess;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id parameter" }, { status: 400 });
  }

  await connectDB();

  const service = new ContentService(orgId);
  const item = await service.getById(id);

  if (!item) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  const contentObjectId = new Types.ObjectId(id);
  const orgObjectId = new Types.ObjectId(orgId);

  const impactedPlaylists = await PlaylistModel.countDocuments({
    orgId: orgObjectId,
    "items.contentId": contentObjectId,
  });

  await PlaylistModel.updateMany(
    { orgId: orgObjectId },
    { $pull: { items: { contentId: contentObjectId } } },
  );

  // Delete physical file and thumbnail if they exist
  if (item.config?.fileUrl) {
    const filePath = path.join(process.cwd(), "public", item.config.fileUrl);
    await fs.unlink(filePath).catch(() => { });
  }

  if (item.thumbnailUrl) {
    const thumbPath = path.join(process.cwd(), "public", item.thumbnailUrl);
    await fs.unlink(thumbPath).catch(() => { });
  }

  await service.deleteContent(id);

  logger.info("Content deleted", { contentId: id, impactedPlaylists });
  return NextResponse.json({ deleted: true, impactedPlaylists }, { status: 200 });
});
