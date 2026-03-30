import { NextRequest, NextResponse } from "next/server";

import { connectDB } from "@/lib/db/connection";
import { ScreenService } from "@/lib/services/screen.service";
import { withErrorHandler, logger } from "@/lib/api-utils";

async function handleGenerateCode(_req: NextRequest) {
  await connectDB();

  const result = await ScreenService.generatePairingCode();
  logger.info("Pairing code generated");
  return NextResponse.json(result, { status: 201 });
}

export const POST = withErrorHandler(handleGenerateCode);
