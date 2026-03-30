import { NextRequest, NextResponse } from "next/server";

import { getOrgIdFromSession, logger, withErrorHandler } from "@/lib/api-utils";
import { type WebAppId } from "@/lib/db/models/WebAppInstance";
import { validateDatasetForApp } from "@/lib/sdk/webapp-dataset.service";
import { getRegistryEntry } from "@/lib/sdk/webapp-registry";

/**
 * POST /api/webapps/datasets/[datasetId]/validate?appId=wordpress-link
 */
export const POST = withErrorHandler(
    async (
        req: NextRequest,
        { params }: { params: Promise<{ datasetId: string }> },
    ) => {
        const sess = await getOrgIdFromSession(req);
        if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const appId = req.nextUrl.searchParams.get("appId") as WebAppId | null;
        if (!appId) {
            return NextResponse.json({ error: "appId query param required" }, { status: 400 });
        }

        if (!getRegistryEntry(appId)) {
            return NextResponse.json({ error: `Unknown appId: ${appId}` }, { status: 400 });
        }

        const { datasetId } = await params;
        const result = await validateDatasetForApp(sess.orgId, appId, datasetId);

        logger.info("Dataset validation executed", {
            appId,
            datasetId,
            orgId: sess.orgId,
            valid: result.valid,
            issuesCount: result.issues?.length ?? 0,
        });

        return NextResponse.json(result);
    },
);
