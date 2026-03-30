import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
    claimPlayerSessionLock,
    generatePlayerSessionId,
    isPlayerSessionId,
    PLAYER_SESSION_COOKIE_NAME,
} from "@/lib/player/session-lock";
import { withErrorHandler } from "@/lib/api-utils";

const claimSchema = z.object({
    screenId: z.string().min(1),
    token: z.string().min(1),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
    const payload = await req.json().catch(() => null);
    const parsed = claimSchema.safeParse(payload);

    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const cookieValue = req.cookies.get(PLAYER_SESSION_COOKIE_NAME)?.value;
    const sessionId = isPlayerSessionId(cookieValue) ? cookieValue : generatePlayerSessionId();

    const result = await claimPlayerSessionLock(parsed.data.screenId, parsed.data.token, sessionId);

    if (!result.granted) {
        return NextResponse.json(
            {
                error:
                    result.code === "SESSION_LOCKED"
                        ? "Sessione monitor gia attiva in un altro browser"
                        : "Credenziali monitor non valide",
                code: result.code,
            },
            { status: result.code === "SESSION_LOCKED" ? 409 : 401 },
        );
    }

    const response = NextResponse.json({
        ok: true,
        allowMultiSession: result.allowMultiSession,
    });

    response.cookies.set({
        name: PLAYER_SESSION_COOKIE_NAME,
        value: sessionId,
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
    });

    return response;
});
