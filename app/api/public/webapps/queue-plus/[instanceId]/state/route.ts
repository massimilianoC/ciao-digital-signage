import { NextRequest, NextResponse } from "next/server";

import { getQueuePlusPublicStateForAccess } from "@/lib/services/queue-plus-public-state";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ instanceId: string }> },
) {
    const { instanceId } = await params;
    const token = req.nextUrl.searchParams.get("token");
    const datasetId = req.nextUrl.searchParams.get("datasetId") ?? undefined;

    if (!token) {
        return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const snapshot = await getQueuePlusPublicStateForAccess(instanceId, token, datasetId);
    if (!snapshot) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(snapshot.state);
}
