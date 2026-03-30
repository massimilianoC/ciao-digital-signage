import { NextRequest, NextResponse } from "next/server";

import { getOrgIdFromSession, withErrorHandler } from "@/lib/api-utils";
import { type WebAppId } from "@/lib/db/models/WebAppInstance";
import { listInstancesForApp } from "@/lib/sdk/webapp-instance.service";
import { getRegistryEntry } from "@/lib/sdk/webapp-registry";

/**
 * GET /api/webapps/instances?appId=queue
 * Lists all instances for the current org, filtered by appId.
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

    const instances = await listInstancesForApp(sess.orgId, appId);

    const enriched = instances.map((inst) => ({
        ...inst,
        playerUrl: registryEntry.playerPath(inst.instanceId, inst.publicToken),
    }));

    return NextResponse.json({ instances: enriched });
});
