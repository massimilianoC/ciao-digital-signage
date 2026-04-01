import { NextRequest, NextResponse } from "next/server";

// Paths that the matcher sends here but should skip auth
const PUBLIC_PATHS = ["/api/screens/generate-code", "/api/screens/activation-status"];
const PUBLIC_PAGE_PREFIXES = ["/webapps/queue-plus/ticket/"];
const PLAYER_SESSION_COOKIE_NAME = "ciao_player_session";
const AUTH_COOKIE_BASE_NAMES = [
    "better-auth.session_token",
    "better-auth.session_data",
    "better-auth.dont_remember",
    "better-auth-session_token",
    "better-auth-session_data",
    "better-auth-dont_remember",
];

function sanitizeSessionCookies(rawCookieHeader: string | null): string {
    if (!rawCookieHeader) {
        return "";
    }

    return rawCookieHeader
        .split(";")
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0)
        .filter((chunk) => !chunk.startsWith(`${PLAYER_SESSION_COOKIE_NAME}=`))
        .join("; ");
}

function getAuthCookieNamesToClear(rawCookieHeader: string | null): string[] {
    const names = new Set<string>(AUTH_COOKIE_BASE_NAMES);

    if (!rawCookieHeader) {
        return [...names];
    }

    for (const chunk of rawCookieHeader.split(";")) {
        const [rawName] = chunk.trim().split("=", 1);
        const name = rawName?.trim();

        if (!name || name === PLAYER_SESSION_COOKIE_NAME) {
            continue;
        }

        if (
            name.startsWith("better-auth.")
            || name.startsWith("better-auth-")
            || name.startsWith("__Secure-better-auth.")
            || name.startsWith("__Secure-better-auth-")
            || name.startsWith("__Host-better-auth.")
            || name.startsWith("__Host-better-auth-")
        ) {
            names.add(name);
        }
    }

    return [...names];
}

function clearAuthCookies(res: NextResponse, rawCookieHeader: string | null) {
    for (const name of getAuthCookieNamesToClear(rawCookieHeader)) {
        const isSecurePrefixed = name.startsWith("__Secure-") || name.startsWith("__Host-");
        res.cookies.set({
            name,
            value: "",
            path: "/",
            expires: new Date(0),
            maxAge: 0,
            secure: isSecurePrefixed,
            sameSite: "lax",
        });
    }
}

function hasAuthSessionCookie(rawCookieHeader: string | null): boolean {
    if (!rawCookieHeader) {
        return false;
    }

    for (const chunk of rawCookieHeader.split(";")) {
        const [rawName] = chunk.trim().split("=", 1);
        const name = rawName?.trim();
        if (!name) {
            continue;
        }
        if (
            name.startsWith("better-auth.session_token")
            || name.startsWith("better-auth-session_token")
            || name.startsWith("__Secure-better-auth.session_token")
            || name.startsWith("__Secure-better-auth-session_token")
            || name.startsWith("__Host-better-auth.session_token")
            || name.startsWith("__Host-better-auth-session_token")
        ) {
            return true;
        }
    }

    return false;
}

async function fetchSession(req: NextRequest, cookieHeader: string): Promise<unknown | null> {
    if (!cookieHeader) {
        return null;
    }

    // Always resolve against the current request origin.
    // In production, forcing an internal http:// origin can invalidate
    // secure auth cookies (`__Secure-*`) and cause false unauthenticated redirects.
    const base = req.url;
    const candidates = ["/api/auth/get-session", "/api/auth/session"];
    const forwardedHeaders = new Headers(req.headers);
    forwardedHeaders.set("accept", "application/json");
    forwardedHeaders.set("cookie", cookieHeader);

    for (const endpoint of candidates) {
        try {
            const response = await fetch(new URL(endpoint, base), {
                method: "GET",
                headers: forwardedHeaders,
                cache: "no-store",
            });

            if (response.ok) {
                return await response.json();
            }

            // Fallback to next candidate only when endpoint is not found.
            if (response.status !== 404) {
                return null;
            }
        } catch {
            // Fail-closed: if session backend is unreachable, treat as unauthenticated.
            return null;
        }
    }

    return null;
}

type SessionLike = {
    user?: {
        role?: string;
        email?: string;
    };
};

export async function authMiddleware(req: NextRequest) {
    const start = Date.now();
    const method = req.method;
    const path = req.nextUrl.pathname;

    // Dev request logging
    const isDev = process.env.NODE_ENV !== "production";
    const debugAuthMiddleware = process.env.DEBUG_AUTH_MIDDLEWARE === "1";

    // Public exceptions (matched by config but intentionally open)
    if (PUBLIC_PATHS.includes(req.nextUrl.pathname)) {
        if (isDev && debugAuthMiddleware) console.log(`[MW] ${method} ${path} -> PUBLIC (${Date.now() - start}ms)`);
        return NextResponse.next();
    }

    if (PUBLIC_PAGE_PREFIXES.some((prefix) => req.nextUrl.pathname.startsWith(prefix))) {
        if (isDev && debugAuthMiddleware) console.log(`[MW] ${method} ${path} -> PUBLIC-PAGE (${Date.now() - start}ms)`);
        return NextResponse.next();
    }

    // Web app player pages are self-validating via their own ?token= query param.
    // The route handlers return 404/error if the token is absent or invalid.
    if (path.startsWith("/webapps/") && req.nextUrl.searchParams.has("token")) {
        if (isDev && debugAuthMiddleware) console.log(`[MW] ${method} ${path} -> PUBLIC-WEBAPP (${Date.now() - start}ms)`);
        return NextResponse.next();
    }

    // Temporary hard-stop for edge-side auth enforcement.
    // Session validation remains enforced in server layouts/pages and API handlers,
    // but disabling edge checks prevents false session invalidation loops in production.
    if (isDev && debugAuthMiddleware) {
        console.log(`[MW] ${method} ${path} -> BYPASS (${Date.now() - start}ms)`);
    }
    return NextResponse.next();
}

export const middlewareConfig = {
    matcher: [
        "/api/orgs/:path*",
        "/api/content/:path*",
        "/api/playlists/:path*",
        "/api/screens/:path*",
        "/api/schedules/:path*",
        "/api/groups/:path*",
        "/api/webapps/:path*",
        "/api/override/:path*",
        "/api/force-override/:path*",
    ],
};
