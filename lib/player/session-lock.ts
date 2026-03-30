import { randomUUID } from "node:crypto";
import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { ScreenModel } from "@/lib/db/models/Screen";

export const PLAYER_SESSION_COOKIE_NAME = "ciao_player_session";

export type PlayerSessionClaimResult = {
    granted: boolean;
    code: "OK" | "INVALID_TOKEN" | "SESSION_LOCKED";
    allowMultiSession: boolean;
    lockHolderSessionId?: string | null;
};

const DEFAULT_SESSION_LOCK_TTL_MS = 45_000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return parsed;
}

export function getPlayerSessionLockTtlMs(): number {
    return parsePositiveInt(process.env.PLAYER_SESSION_LOCK_TTL_MS, DEFAULT_SESSION_LOCK_TTL_MS);
}

export function generatePlayerSessionId(): string {
    return randomUUID();
}

export function isPlayerSessionId(value: string | null | undefined): value is string {
    if (!value) {
        return false;
    }

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildClaimFilter(
    screenId: string,
    token: string,
    sessionId: string,
    staleBefore: Date,
): Record<string, unknown> {
    return {
        _id: new Types.ObjectId(screenId),
        screenToken: token,
        $or: [
            { allowMultiSession: true },
            { activePlayerSessionId: sessionId },
            { activePlayerSessionId: { $exists: false } },
            { activePlayerSessionId: null },
            { activePlayerSessionLastSeenAt: { $lt: staleBefore } },
            { status: { $ne: "online" } },
        ],
    };
}

export async function claimPlayerSessionLock(
    screenId: string,
    token: string,
    sessionId: string,
): Promise<PlayerSessionClaimResult> {
    await connectDB();

    const now = new Date();
    const staleBefore = new Date(now.getTime() - getPlayerSessionLockTtlMs());

    const claimed = await ScreenModel.findOneAndUpdate(
        buildClaimFilter(screenId, token, sessionId, staleBefore),
        {
            $set: {
                activePlayerSessionId: sessionId,
                activePlayerSessionBoundAt: now,
                activePlayerSessionLastSeenAt: now,
            },
        },
        {
            new: true,
        },
    )
        .select({ allowMultiSession: 1, activePlayerSessionId: 1 })
        .lean<{ allowMultiSession?: boolean; activePlayerSessionId?: string | null } | null>();

    if (claimed) {
        return {
            granted: true,
            code: "OK",
            allowMultiSession: claimed.allowMultiSession === true,
            lockHolderSessionId: claimed.activePlayerSessionId ?? null,
        };
    }

    const existing = await ScreenModel.findOne({ _id: screenId, screenToken: token })
        .select({ allowMultiSession: 1, activePlayerSessionId: 1, activePlayerSessionLastSeenAt: 1, status: 1 })
        .lean<{
            allowMultiSession?: boolean;
            activePlayerSessionId?: string | null;
            activePlayerSessionLastSeenAt?: Date | null;
            status?: "online" | "offline" | "pending";
        } | null>();

    if (!existing) {
        return {
            granted: false,
            code: "INVALID_TOKEN",
            allowMultiSession: false,
        };
    }

    const stale =
        !existing.activePlayerSessionLastSeenAt ||
        existing.activePlayerSessionLastSeenAt < staleBefore ||
        existing.status !== "online";

    if (existing.allowMultiSession || existing.activePlayerSessionId === sessionId || stale) {
        const retryClaim = await ScreenModel.findOneAndUpdate(
            buildClaimFilter(screenId, token, sessionId, staleBefore),
            {
                $set: {
                    activePlayerSessionId: sessionId,
                    activePlayerSessionBoundAt: now,
                    activePlayerSessionLastSeenAt: now,
                },
            },
            {
                new: true,
            },
        )
            .select({ allowMultiSession: 1, activePlayerSessionId: 1 })
            .lean<{ allowMultiSession?: boolean; activePlayerSessionId?: string | null } | null>();

        if (retryClaim) {
            return {
                granted: true,
                code: "OK",
                allowMultiSession: retryClaim.allowMultiSession === true,
                lockHolderSessionId: retryClaim.activePlayerSessionId ?? null,
            };
        }

        const finalLock = await ScreenModel.findOne({ _id: screenId, screenToken: token })
            .select({ activePlayerSessionId: 1, allowMultiSession: 1 })
            .lean<{ activePlayerSessionId?: string | null; allowMultiSession?: boolean } | null>();

        if (finalLock?.allowMultiSession) {
            return {
                granted: true,
                code: "OK",
                allowMultiSession: true,
                lockHolderSessionId: finalLock.activePlayerSessionId ?? null,
            };
        }

        if (finalLock?.activePlayerSessionId === sessionId) {
            return {
                granted: true,
                code: "OK",
                allowMultiSession: false,
                lockHolderSessionId: sessionId,
            };
        }
    }

    return {
        granted: false,
        code: "SESSION_LOCKED",
        allowMultiSession: false,
        lockHolderSessionId: existing.activePlayerSessionId ?? null,
    };
}

export async function validatePlayerSessionLock(
    screenId: string,
    token: string,
    sessionId: string,
    options?: { touch?: boolean },
): Promise<PlayerSessionClaimResult> {
    const claimResult = await claimPlayerSessionLock(screenId, token, sessionId);

    if (!claimResult.granted || !options?.touch) {
        return claimResult;
    }

    await ScreenModel.updateOne(
        {
            _id: new Types.ObjectId(screenId),
            screenToken: token,
            activePlayerSessionId: sessionId,
        },
        {
            $set: {
                activePlayerSessionLastSeenAt: new Date(),
            },
        },
    );

    return claimResult;
}
