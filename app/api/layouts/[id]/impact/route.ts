import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import { getOrgIdFromSession, withErrorHandler } from "@/lib/api-utils";
import { getLayoutImpact } from "@/lib/services/layout-impact.service";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (req: NextRequest, ctx: RouteContext) => {
    const session = await getOrgIdFromSession(req);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    if (!Types.ObjectId.isValid(id)) {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    try {
        const impact = await getLayoutImpact(session.orgId, id);
        return NextResponse.json(impact);
    } catch (error) {
        if (error instanceof Error && error.message === "LAYOUT_NOT_FOUND") {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        throw error;
    }
});
