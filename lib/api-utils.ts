import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth/auth";
import { mongoClient } from "@/lib/db/connection";

/* ------------------------------------------------------------------ */
/*  Structured logger                                                  */
/* ------------------------------------------------------------------ */

const isDev = process.env.NODE_ENV !== "production";

export const logger = {
    info(message: string, meta?: Record<string, unknown>) {
        if (isDev) {
            const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
            console.log(`[API] ℹ ${message}${metaStr}`);
        } else {
            console.log(
                JSON.stringify({
                    level: "info",
                    message,
                    timestamp: new Date().toISOString(),
                    ...meta,
                }),
            );
        }
    },

    warn(message: string, meta?: Record<string, unknown>) {
        if (isDev) {
            const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
            console.warn(`[API] ⚠ ${message}${metaStr}`);
        } else {
            console.warn(
                JSON.stringify({
                    level: "warn",
                    message,
                    timestamp: new Date().toISOString(),
                    ...meta,
                }),
            );
        }
    },

    error(message: string, error?: unknown, meta?: Record<string, unknown>) {
        const errorInfo =
            error instanceof Error
                ? {
                    errorName: error.name,
                    errorMessage: error.message,
                    stack:
                        process.env.NODE_ENV === "development" ? error.stack : undefined,
                }
                : { errorMessage: String(error) };

        if (isDev) {
            const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
            console.error(`[API] ❌ ${message} — ${errorInfo.errorMessage ?? errorInfo}${metaStr}`);
            if (error instanceof Error && error.stack) {
                console.error(error.stack);
            }
        } else {
            console.error(
                JSON.stringify({
                    level: "error",
                    message,
                    timestamp: new Date().toISOString(),
                    ...errorInfo,
                    ...meta,
                }),
            );
        }
    },
};

/* ------------------------------------------------------------------ */
/*  Route-handler error boundary                                       */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (req: NextRequest, context?: any) => Promise<NextResponse>;

export function withErrorHandler(handler: RouteHandler): RouteHandler {
    return async (req, context) => {
        const start = Date.now();
        const method = req.method;
        const path = req.nextUrl.pathname;
        try {
            const res = await handler(req, context);
            if (isDev) {
                console.log(`[API] ${method} ${path} → ${res.status} (${Date.now() - start}ms)`);
            }
            return res;
        } catch (error) {
            logger.error(
                `Unhandled error in ${method} ${path} (${Date.now() - start}ms)`,
                error,
            );
            return NextResponse.json(
                { error: "Internal server error" },
                { status: 500 },
            );
        }
    };
}

/* ------------------------------------------------------------------ */
/*  Session + org helpers                                              */
/* ------------------------------------------------------------------ */

/** Shape returned by getSessionAndOrg */
export type SessionAndOrg = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
    orgId: string;
};

/**
 * Core helper for server components: returns the verified session + resolved orgId.
 *
 * Resolution order for orgId:
 *   1. session.session.activeOrganizationId  (set after client calls setActive)
 *   2. first member document for this user in MongoDB  (always works for seeded users)
 *
 * Returns null when unauthenticated OR when the user has no org membership.
 */
export async function getSessionAndOrg(hdrs: Headers): Promise<SessionAndOrg | null> {
    const session = await auth.api.getSession({ headers: hdrs });
    if (!session) return null;

    const userId = session.user?.id;
    if (!userId) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let orgId: string | null | undefined = (session as any).session?.activeOrganizationId;

    if (!orgId) {
        try {
            const db = mongoClient.db();
            const member = await db.collection("member").findOne({ userId });
            if (member?.organizationId) {
                orgId = member.organizationId as string;
            }
        } catch {
            // MongoDB unreachable — fall through to null
        }
    }

    if (!orgId) return null;
    return { session, orgId };
}

/**
 * Helper for API route handlers (NextRequest context).
 * Thin wrapper around getSessionAndOrg.
 */
export async function getOrgIdFromSession(req?: NextRequest): Promise<{
    orgId: string;
    userId: string;
} | null> {
    const hdrs = req ? req.headers : await headers();
    const result = await getSessionAndOrg(hdrs);
    if (!result) return null;
    return { orgId: result.orgId, userId: result.session.user.id };
}
