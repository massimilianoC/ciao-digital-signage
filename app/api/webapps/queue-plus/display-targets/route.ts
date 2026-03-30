import { NextRequest, NextResponse } from "next/server";

import { getOrgIdFromSession, withErrorHandler } from "@/lib/api-utils";
import { listQueuePlusDisplayInstancesForOrg } from "@/lib/services/queue-plus.service";

export const GET = withErrorHandler(async (req: NextRequest) => {
    const sess = await getOrgIdFromSession(req);
    if (!sess) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const displays = await listQueuePlusDisplayInstancesForOrg(sess.orgId);
    return NextResponse.json({ displays });
});
