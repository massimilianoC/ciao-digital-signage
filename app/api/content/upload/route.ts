import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

import { withErrorHandler, logger, getOrgIdFromSession } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { ContentService } from "@/lib/services/content.service";

export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const THUMB_DIR = path.join(process.cwd(), "public", "thumbnails");

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];
const ALLOWED_PDF_TYPES = ["application/pdf"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_PDF_TYPES];

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;
const MAX_PDF_SIZE = 100 * 1024 * 1024;

async function ensureDirectories(): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  await mkdir(THUMB_DIR, { recursive: true });
}

async function generateThumbnail(buffer: Buffer): Promise<string> {
  const thumbName = `thumb_${randomUUID()}.webp`;
  const thumbPath = path.join(THUMB_DIR, thumbName);

  await sharp(buffer)
    .resize(320, 180, { fit: "cover" })
    .webp({ quality: 80 })
    .toFile(thumbPath);

  return `/thumbnails/${thumbName}`;
}

function parseTags(tagsRaw: FormDataEntryValue | null): string[] {
  if (typeof tagsRaw !== "string" || !tagsRaw.trim()) {
    return [];
  }

  return tagsRaw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseDuration(rawValue: FormDataEntryValue | null): number {
  if (typeof rawValue !== "string") {
    return 10000;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1000) {
    return 10000;
  }

  return parsed;
}

function resolveExt(fileName: string, mediaKind: "image" | "video" | "pdf"): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext) {
    return ext;
  }

  if (mediaKind === "image") return ".jpg";
  if (mediaKind === "pdf") return ".pdf";
  return ".mp4";
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) {
    logger.warn("Upload attempt without session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orgId } = sess;

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Failed to parse form data" }, { status: 400 });
  }

  const formFile = formData.get("file");
  if (!(formFile instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(formFile.type)) {
    return NextResponse.json(
      {
        error: `Unsupported file type: ${formFile.type}. Allowed: ${ALLOWED_TYPES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const isImage = ALLOWED_IMAGE_TYPES.includes(formFile.type);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(formFile.type);
  const isPdf = ALLOWED_PDF_TYPES.includes(formFile.type);
  const mediaKind: "image" | "video" | "pdf" = isImage ? "image" : isPdf ? "pdf" : "video";
  const maxSize = isImage ? MAX_IMAGE_SIZE : isPdf ? MAX_PDF_SIZE : MAX_VIDEO_SIZE;

  if (formFile.size > maxSize) {
    return NextResponse.json(
      { error: `File too large. Max: ${maxSize / 1024 / 1024}MB` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await formFile.arrayBuffer());
  await ensureDirectories();

  const filename = `${randomUUID()}${resolveExt(formFile.name, mediaKind)}`;
  const filePath = path.join(UPLOAD_DIR, filename);

  await writeFile(filePath, buffer);

  let thumbnailUrl: string | undefined;
  if (isImage) {
    thumbnailUrl = await generateThumbnail(buffer);
  }

  const nameField = formData.get("name");
  const folderField = formData.get("folder");

  const name = typeof nameField === "string" && nameField.trim() ? nameField.trim() : formFile.name;
  const folder = typeof folderField === "string" && folderField.trim() ? folderField.trim() : "/";
  const tags = parseTags(formData.get("tags"));
  const defaultDurationMs = parseDuration(formData.get("defaultDurationMs"));

  await connectDB();

  const service = new ContentService(orgId);
  const item = await service.createContent({
    name,
    type: isPdf ? "url" : isImage ? "image" : "video",
    folder,
    tags,
    defaultDurationMs,
    thumbnailUrl,
    config: {
      fileUrl: `/uploads/${filename}`,
      url: isPdf ? `/uploads/${filename}` : undefined,
      urlSubtype: isPdf ? "pdf" : undefined,
      mimeType: formFile.type,
      fileSizeBytes: formFile.size,
    },
  });

  logger.info("File uploaded", { contentId: item._id?.toString(), type: isPdf ? "url/pdf" : isImage ? "image" : "video", size: formFile.size });
  return NextResponse.json(item, { status: 201 });
});
