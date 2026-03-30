import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOrgIdFromSession, withErrorHandler } from "@/lib/api-utils";
import { type WebAppId } from "@/lib/db/models/WebAppInstance";
import {
    deleteDatasetForApp,
    getDatasetDetail,
    updateDatasetForApp,
} from "@/lib/sdk/webapp-dataset.service";
import { getRegistryEntry } from "@/lib/sdk/webapp-registry";

const updateDatasetSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    status: z.enum(["active", "disabled", "draft"]).optional(),
    datasetKind: z.string().min(1).max(120).optional(),
    storageMode: z.enum(["inline", "asset-ref", "app-collection", "remote-mirror"]).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    summary: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
});

function getAppIdOrError(req: NextRequest): WebAppId | null {
    return req.nextUrl.searchParams.get("appId") as WebAppId | null;
}

/**
 * GET /api/webapps/datasets/[datasetId]?appId=wordpress-link
 */
export const GET = withErrorHandler(
    async (
        req: NextRequest,
        { params }: { params: Promise<{ datasetId: string }> },
    ) => {
        const sess = await getOrgIdFromSession(req);
        if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const appId = getAppIdOrError(req);
        if (!appId) {
            return NextResponse.json({ error: "appId query param required" }, { status: 400 });
        }
        if (!getRegistryEntry(appId)) {
            return NextResponse.json({ error: `Unknown appId: ${appId}` }, { status: 400 });
        }

        const { datasetId } = await params;
        const dataset = await getDatasetDetail(sess.orgId, appId, datasetId);
        if (!dataset) {
            return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
        }

        return NextResponse.json({ dataset });
    },
);

/**
 * PATCH /api/webapps/datasets/[datasetId]?appId=wordpress-link
 */
export const PATCH = withErrorHandler(
    async (
        req: NextRequest,
        { params }: { params: Promise<{ datasetId: string }> },
    ) => {
        const sess = await getOrgIdFromSession(req);
        if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const appId = getAppIdOrError(req);
        if (!appId) {
            return NextResponse.json({ error: "appId query param required" }, { status: 400 });
        }
        if (!getRegistryEntry(appId)) {
            return NextResponse.json({ error: `Unknown appId: ${appId}` }, { status: 400 });
        }

        const body = await req.json().catch(() => null);
        const parsed = updateDatasetSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
        }

        const { datasetId } = await params;
        await updateDatasetForApp(sess.orgId, sess.userId ?? "", appId, datasetId, parsed.data);

        return NextResponse.json({ ok: true });
    },
);

/**
 * DELETE /api/webapps/datasets/[datasetId]?appId=wordpress-link
 */
export const DELETE = withErrorHandler(
    async (
        req: NextRequest,
        { params }: { params: Promise<{ datasetId: string }> },
    ) => {
        const sess = await getOrgIdFromSession(req);
        if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const appId = getAppIdOrError(req);
        if (!appId) {
            return NextResponse.json({ error: "appId query param required" }, { status: 400 });
        }
        if (!getRegistryEntry(appId)) {
            return NextResponse.json({ error: `Unknown appId: ${appId}` }, { status: 400 });
        }

        const { datasetId } = await params;
        await deleteDatasetForApp(sess.orgId, appId, datasetId);

        return NextResponse.json({ ok: true });
    },
);
