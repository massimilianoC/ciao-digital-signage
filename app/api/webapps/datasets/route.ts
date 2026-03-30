import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getOrgIdFromSession, logger, withErrorHandler } from "@/lib/api-utils";
import { type WebAppId } from "@/lib/db/models/WebAppInstance";
import {
    createDatasetForApp,
    listDatasetsForApp,
} from "@/lib/sdk/webapp-dataset.service";
import { getWebappDatasetSandboxContract } from "@/lib/sdk/webapp-host.service";
import { getRegistryEntry } from "@/lib/sdk/webapp-registry";

const createDatasetSchema = z.object({
    name: z.string().min(1).max(200),
    datasetKind: z.string().min(1).max(120),
    storageMode: z.enum(["inline", "asset-ref", "app-collection", "remote-mirror"]).optional(),
    editorMode: z.enum(["json-schema", "custom-react", "raw-json"]).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    summary: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
});

/**
 * GET /api/webapps/datasets?appId=wordpress-link
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
    const sess = await getOrgIdFromSession(req);
    if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const appId = req.nextUrl.searchParams.get("appId") as WebAppId | null;
    if (!appId) {
        return NextResponse.json({ error: "appId query param required" }, { status: 400 });
    }

    const registryEntry = getRegistryEntry(appId);
    if (!registryEntry) {
        return NextResponse.json({ error: `Unknown appId: ${appId}` }, { status: 400 });
    }

    const datasets = await listDatasetsForApp(sess.orgId, appId);
    logger.info("Datasets listed", { orgId: sess.orgId, appId, count: datasets.length });
    return NextResponse.json({ datasets });
});

/**
 * POST /api/webapps/datasets?appId=wordpress-link
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
    const sess = await getOrgIdFromSession(req);
    if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const appId = req.nextUrl.searchParams.get("appId") as WebAppId | null;
    if (!appId) {
        return NextResponse.json({ error: "appId query param required" }, { status: 400 });
    }

    const registryEntry = getRegistryEntry(appId);
    if (!registryEntry) {
        return NextResponse.json({ error: `Unknown appId: ${appId}` }, { status: 400 });
    }

    const sandboxContract = getWebappDatasetSandboxContract(appId);
    if (!sandboxContract.dataset.supportsCrud) {
        return NextResponse.json(
            {
                error:
                    "Dataset creation for this app is managed by dedicated app APIs.",
            },
            { status: 400 },
        );
    }

    const body = await req.json().catch(() => null);
    const parsed = createDatasetSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const created = await createDatasetForApp(sess.orgId, sess.userId ?? "", {
        appId,
        ...parsed.data,
    });

    logger.info("Dataset created", {
        orgId: sess.orgId,
        appId,
        datasetId: created.datasetId,
        datasetKind: created.datasetKind,
    });

    return NextResponse.json({ dataset: created }, { status: 201 });
});
