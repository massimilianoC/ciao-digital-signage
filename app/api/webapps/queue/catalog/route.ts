import { NextRequest, NextResponse } from "next/server";

import { getOrgIdFromSession, withErrorHandler } from "@/lib/api-utils";
import { listQueueCatalogForOrg } from "@/lib/services/queue-connector.service";

export const GET = withErrorHandler(async (req: NextRequest) => {
    const sess = await getOrgIdFromSession(req);
    if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const queues = await listQueueCatalogForOrg(sess.orgId);
    return NextResponse.json({ queues });
});