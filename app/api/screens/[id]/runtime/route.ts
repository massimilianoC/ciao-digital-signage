import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import { withErrorHandler, getOrgIdFromSession } from "@/lib/api-utils";
import { connectDB } from "@/lib/db/connection";
import { ScreenModel } from "@/lib/db/models/Screen";
import { resolveManifestForScreen } from "@/lib/scheduling/runtime-resolver";

type Params = { params: Promise<{ id: string }> };

const scopeLabelByLayer = {
    global: "Global",
    group: "Group",
    screen: "Screen",
    force_override: "Override",
    no_content: "No content",
} as const;

export const GET = withErrorHandler(async (req: NextRequest, { params }: Params) => {
    const session = await getOrgIdFromSession(req);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ error: "Invalid screenId" }, { status: 400 });
    }

    await connectDB();

    const screen = await ScreenModel.findOne({
        _id: new Types.ObjectId(id),
        orgId: new Types.ObjectId(session.orgId),
    })
        .select({ _id: 1, currentItemId: 1, updatedAt: 1, lastSeenAt: 1 })
        .lean<{
            _id: Types.ObjectId;
            currentItemId?: string | null;
            updatedAt?: Date | null;
            lastSeenAt?: Date | null;
        } | null>();

    if (!screen) {
        return NextResponse.json({ error: "Screen not found" }, { status: 404 });
    }

    const manifest = await resolveManifestForScreen(id, new Date());
    const currentItem =
        manifest.items.find((item) => item.contentId === (screen.currentItemId ?? ""))
        ?? manifest.items[0]
        ?? null;

    return NextResponse.json({
        resolvedAt: manifest.validFrom,
        updatedAt: screen.updatedAt ?? null,
        lastSeenAt: screen.lastSeenAt ?? null,
        source: {
            layer: manifest.resolvedLayer,
            label: scopeLabelByLayer[manifest.resolvedLayer],
            scope: manifest.source.scope,
            scheduleId: manifest.source.scheduleId,
            scheduleName: manifest.source.scheduleName,
            playlistId: manifest.source.playlistId,
            playlistName: manifest.source.playlistName,
        },
        content: currentItem
            ? {
                id: currentItem.contentId,
                name: currentItem.title ?? "Content",
                type: currentItem.type,
            }
            : null,
        hasItems: manifest.items.length > 0,
    });
});