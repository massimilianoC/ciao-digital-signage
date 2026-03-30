import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { emitManifestToScreen } from "@/lib/scheduling/emitter";
import { getAffectedScreenIdsByScope, ScheduleService } from "@/lib/services/schedule.service";
import { getOrgIdFromSession, logger, withErrorHandler } from "@/lib/api-utils";

const publishSchema = z.object({
  scope: z.enum(["org", "group", "screen"]),
  scopeId: z.string().min(1, "scopeId is required"),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const scopeError = await ScheduleService.validateScopeTarget(
    sess.orgId,
    parsed.data.scope,
    parsed.data.scopeId,
  );
  if (scopeError) {
    return NextResponse.json({ error: scopeError }, { status: 400 });
  }

  const affectedScreenIds = await getAffectedScreenIdsByScope(
    sess.orgId,
    parsed.data.scope,
    parsed.data.scopeId,
  );

  await Promise.all(affectedScreenIds.map((screenId) => emitManifestToScreen(screenId)));

  logger.info("Schedules published", {
    orgId: sess.orgId,
    scope: parsed.data.scope,
    scopeId: parsed.data.scopeId,
    affectedScreens: affectedScreenIds.length,
  });

  return NextResponse.json({
    published: true,
    affectedScreens: affectedScreenIds.length,
  });
});
