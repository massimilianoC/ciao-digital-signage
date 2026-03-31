import { NextRequest, NextResponse } from "next/server";

import { getQueuePublicStateForAccess } from "@/lib/services/queue-public-state";

/**
 * GET /api/public/webapps/queue/[instanceId]/state?token=...
 * Player-safe endpoint: no auth cookie required, token-gated.
 * Returns the current queue state for the display or remote app.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ instanceId: string }> },
) {
    const { instanceId } = await params;
    const token = req.nextUrl.searchParams.get("token");

    if (!token) {
        return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const snapshot = await getQueuePublicStateForAccess(instanceId, token);
    if (!snapshot) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(snapshot.state);
}
