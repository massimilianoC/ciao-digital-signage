import { NextRequest, NextResponse } from "next/server";

import { getOrgIdFromSession, logger, withErrorHandler } from "@/lib/api-utils";
import { validateGoogleCalendarSourceForOrg } from "@/lib/services/google-calendar-sources.service";

type Params = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (req: NextRequest, { params }: Params) => {
    const sess = await getOrgIdFromSession(req);
    if (!sess) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await validateGoogleCalendarSourceForOrg(sess.orgId, id);

    logger.info("Google Calendar source validation completed", {
        sourceId: id,
        valid: result.valid,
        orgId: sess.orgId,
        error: result.error ?? null,
    });

    if (!result.valid) {
        return NextResponse.json({ valid: false, error: result.error ?? "SOURCE_VALIDATION_FAILED" }, { status: 400 });
    }

    return NextResponse.json({
        valid: true,
        checksum: result.checksum,
        eventCount: result.eventCount ?? 0,
    });
});
