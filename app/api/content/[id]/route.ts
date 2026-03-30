import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOrgIdFromSession, withErrorHandler } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { ContentService } from "@/lib/services/content.service";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
    alias: z.string().max(200).optional().nullable(),
    status: z.enum(["active", "suspended"]).optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: Params) => {
    const session = await getOrgIdFromSession(req);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    await connectDB();
    const service = new ContentService(session.orgId);
    const existing = await service.getById(id);
    if (!existing) {
        return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    const alias = typeof parsed.data.alias === "string" ? parsed.data.alias.trim() : "";
    const updatePayload: { alias?: string; status?: "active" | "suspended" } = {};
    if (parsed.data.alias !== undefined) {
        updatePayload.alias = alias || undefined;
    }
    if (parsed.data.status) {
        updatePayload.status = parsed.data.status;
    }
    await service.updateContent(id, updatePayload);

    const updated = await service.getById(id);
    if (!updated) {
        return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    return NextResponse.json({
        _id: updated._id.toString(),
        name: updated.name,
        alias: updated.alias,
        status: updated.status ?? "active",
        type: updated.type,
        url:
            (typeof updated.config?.fileUrl === "string" ? updated.config.fileUrl : undefined) ??
            (typeof updated.config?.url === "string" ? updated.config.url : ""),
        urlSubtype: typeof updated.config?.urlSubtype === "string" ? updated.config.urlSubtype : undefined,
        thumbnailUrl: updated.thumbnailUrl,
        tags: updated.tags,
        folder: updated.folder,
        mimeType: typeof updated.config?.mimeType === "string" ? updated.config.mimeType : undefined,
        fileSizeBytes: typeof updated.config?.fileSizeBytes === "number" ? updated.config.fileSizeBytes : undefined,
        createdAt: new Date(updated.createdAt).toISOString(),
    });
});