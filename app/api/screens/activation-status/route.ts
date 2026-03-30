import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { ScreenService } from "@/lib/services/screen.service";
import { logger, withErrorHandler } from "@/lib/api-utils";

export const GET = withErrorHandler(async (req: NextRequest) => {
    const screenId = req.nextUrl.searchParams.get("screenId")?.trim();

    if (!screenId) {
        return NextResponse.json({ error: "screenId is required" }, { status: 400 });
    }

    if (!Types.ObjectId.isValid(screenId)) {
        return NextResponse.json({ error: "Invalid screenId" }, { status: 400 });
    }

    await connectDB();

    try {
        const status = await ScreenService.getActivationStatus(screenId);
        if (status.status === "expired") {
            logger.warn("Activation status expired without org claim", { screenId });
        }

        return NextResponse.json(status);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message === "SCREEN_NOT_FOUND") {
            return NextResponse.json({ error: "Screen not found" }, { status: 404 });
        }

        throw error;
    }
});
