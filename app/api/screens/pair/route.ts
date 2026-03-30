import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { connectDB } from "@/lib/db/connection";
import { getIO } from "@/lib/socket";
import { ScreenService } from "@/lib/services/screen.service";
import { withErrorHandler, logger, getOrgIdFromSession } from "@/lib/api-utils";

const pairSchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/),
  name: z.string().min(1).max(200),
  timezone: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const sess = await getOrgIdFromSession(req);
  if (!sess) {
    logger.warn("Pair attempt without session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orgId } = sess;

  const body = await req.json().catch(() => null);
  const parsed = pairSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();

  try {
    const result = await ScreenService.claimPairingCode(
      parsed.data.code.toUpperCase(),
      orgId,
      parsed.data.name,
      parsed.data.timezone,
    );

    try {
      const io = getIO();
      io.of("/activation").to(`activation:${result.screenId}`).emit("activation:paired", {
        screenId: result.screenId,
        token: result.screenToken,
      });
    } catch {
      // Socket server may not be active in some local/test runs.
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "INVALID_CODE") {
      return NextResponse.json({ error: "Invalid or expired pairing code" }, { status: 404 });
    }

    if (message === "ALREADY_CLAIMED") {
      return NextResponse.json({ error: "This screen has already been paired" }, { status: 409 });
    }

    if (message === "SCREEN_NOT_FOUND") {
      return NextResponse.json({ error: "Screen not found" }, { status: 404 });
    }

    logger.error("Pair error", error);
    return NextResponse.json({ error: "Failed to pair screen" }, { status: 500 });
  }
});
