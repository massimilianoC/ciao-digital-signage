import { NextRequest, NextResponse } from "next/server";

import { getOrgIdFromSession, withErrorHandler } from "@/lib/api-utils";
import { listRegisteredApps } from "@/lib/sdk/webapp-registry";

/**
 * GET /api/webapps/catalog
 * Returns the list of registered webapp types (from static SDK registry).
 * No DB query — pure static manifest.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
    const sess = await getOrgIdFromSession(req);
    if (!sess) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apps = listRegisteredApps().map((entry) => ({
        appId: entry.appId,
        name: entry.name,
        description: entry.description,
        category: entry.category,
        icon: entry.icon,
        hasCustomConfig: entry.hasCustomConfig,
        displayModes: entry.displayModes,
        configSchema: entry.configSchema,
    }));

    return NextResponse.json({ apps });
});
