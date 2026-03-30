import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { ScreenModel } from "@/lib/db/models/Screen";
import {
    PLAYER_SESSION_COOKIE_NAME,
    isPlayerSessionId,
    validatePlayerSessionLock,
} from "@/lib/player/session-lock";
import { connectivityToLegacyStatus, deriveScreenConnectivity } from "@/lib/screens/connectivity";
import { withErrorHandler } from "@/lib/api-utils";

export const GET = withErrorHandler(async (req: NextRequest) => {
    const screenId = req.nextUrl.searchParams.get("screenId")?.trim();
    const token = req.nextUrl.searchParams.get("token")?.trim();

    if (!screenId || !token) {
        return NextResponse.json({ error: "screenId and token are required" }, { status: 400 });
    }

    if (!Types.ObjectId.isValid(screenId)) {
        return NextResponse.json({ error: "Invalid screenId" }, { status: 400 });
    }

    const sessionId = req.cookies.get(PLAYER_SESSION_COOKIE_NAME)?.value;
    if (!isPlayerSessionId(sessionId)) {
        return NextResponse.json({ error: "Missing player session" }, { status: 401 });
    }

    const sessionValidation = await validatePlayerSessionLock(screenId, token, sessionId, {
        touch: true,
    });
    if (!sessionValidation.granted) {
        return NextResponse.json(
            {
                error: sessionValidation.code === "SESSION_LOCKED"
                    ? "Player session already active on another browser"
                    : "Unauthorized",
                code: sessionValidation.code,
            },
            { status: sessionValidation.code === "SESSION_LOCKED" ? 409 : 401 },
        );
    }

    await connectDB();

    const screen = await ScreenModel.findOne({ _id: screenId, screenToken: token })
        .select({
            _id: 1,
            name: 1,
            status: 1,
            operatingMode: 1,
            disconnectPolicy: 1,
            lastSeenAt: 1,
            disconnectEvents: 1,
            lastErrorAt: 1,
            lastErrorCode: 1,
            lastErrorMessage: 1,
            updatedAt: 1,
        })
        .lean();

    if (!screen) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connectivity = deriveScreenConnectivity(screen);

    return NextResponse.json({
        screenId: screen._id.toString(),
        name: screen.name,
        status: connectivityToLegacyStatus(connectivity),
        connectivity,
        disconnectPolicy: screen.disconnectPolicy ?? (process.env.PLAYER_DISCONNECT_POLICY === "show_default" ? "show_default" : "keep_cache"),
        lastSeenAt: screen.lastSeenAt ?? null,
        updatedAt: screen.updatedAt ?? null,
        helpEmail: process.env.PLAYER_HELP_EMAIL ?? "support@ciao.local",
    });
});
