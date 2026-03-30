import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getQueuePlusAggregateForPublicAccess } from "@/lib/services/queue-plus.service";
import { listQueuePlusDisplayTargets } from "@/lib/services/queue-plus.service";
import {
    acquireQueuePlusDisplayLock,
    getQueuePlusDisplayLockStatus,
    QueuePlusDisplayLockError,
    releaseQueuePlusDisplayLock,
    renewQueuePlusDisplayLock,
} from "@/lib/services/queue-plus-display-lock.service";

const lockSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("acquire"), datasetId: z.string().min(1).optional(), displayId: z.string().min(1), leaseSeconds: z.number().int().min(10).max(120).optional() }),
    z.object({ action: z.literal("renew"), datasetId: z.string().min(1).optional(), displayId: z.string().min(1), leaseSeconds: z.number().int().min(10).max(120).optional() }),
    z.object({ action: z.literal("release"), datasetId: z.string().min(1).optional(), displayId: z.string().min(1) }),
    z.object({ action: z.literal("status"), datasetId: z.string().min(1).optional(), displayId: z.string().min(1) }),
]);

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ instanceId: string }> },
) {
    const { instanceId } = await params;
    const token = req.nextUrl.searchParams.get("token");

    if (!token) {
        return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const agg = await getQueuePlusAggregateForPublicAccess(instanceId, token);
    if (!agg) {
        return NextResponse.json({ error: "Instance not found" }, { status: 404 });
    }

    const payload = await req.json().catch(() => null);
    const parsed = lockSchema.safeParse(payload);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
    }

    const orgId = String(agg.instance.orgId);
    const datasetId = parsed.data.datasetId ?? agg.config.datasetId;
    const displayId = parsed.data.displayId;

    const configuredAllowedDisplayIds = Array.isArray(agg.config.allowedDisplayIds)
        ? agg.config.allowedDisplayIds.map((entry) => String(entry).toLowerCase())
        : [];
    const discoveredDisplayIds = configuredAllowedDisplayIds.length === 0
        ? (await listQueuePlusDisplayTargets(orgId, datasetId)).map((entry) => entry.displayId.toLowerCase())
        : [];
    const effectiveAllowedDisplayIds = configuredAllowedDisplayIds.length > 0
        ? configuredAllowedDisplayIds
        : discoveredDisplayIds;

    if (!effectiveAllowedDisplayIds.includes(displayId.toLowerCase())) {
        return NextResponse.json({ error: "DISPLAY_NOT_ALLOWED" }, { status: 403 });
    }

    try {
        switch (parsed.data.action) {
            case "acquire":
                return NextResponse.json(await acquireQueuePlusDisplayLock({
                    orgId,
                    datasetId,
                    displayId,
                    ownerInstanceId: instanceId,
                    leaseSeconds: parsed.data.leaseSeconds,
                }));
            case "renew":
                return NextResponse.json(await renewQueuePlusDisplayLock({
                    orgId,
                    datasetId,
                    displayId,
                    ownerInstanceId: instanceId,
                    leaseSeconds: parsed.data.leaseSeconds,
                }));
            case "release":
                return NextResponse.json(await releaseQueuePlusDisplayLock({
                    orgId,
                    datasetId,
                    displayId,
                    ownerInstanceId: instanceId,
                }));
            case "status":
                return NextResponse.json(await getQueuePlusDisplayLockStatus({
                    orgId,
                    datasetId,
                    displayId,
                    ownerInstanceId: instanceId,
                }));
        }
    } catch (error) {
        if (error instanceof QueuePlusDisplayLockError) {
            return NextResponse.json({ error: error.code, message: error.message }, { status: error.httpStatus });
        }

        return NextResponse.json({ error: error instanceof Error ? error.message : "Lock operation failed" }, { status: 400 });
    }
}
