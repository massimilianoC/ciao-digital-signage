import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connection";
import { withErrorHandler, logger } from "@/lib/api-utils";

export const GET = withErrorHandler(async () => {
  try {
    await connectDB();
    return NextResponse.json({
      status: "ok",
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Health check failed: DB connection error", error);
    return NextResponse.json(
      {
        status: "error",
        db: "disconnected",
        error: "Database connection failed",
      },
      { status: 503 },
    );
  }
});
