import { NextRequest, NextResponse } from "next/server";

// Paths that the matcher sends here but should skip auth
const PUBLIC_PATHS = ["/api/screens/generate-code", "/api/screens/activation-status"];
const PUBLIC_PAGE_PREFIXES = ["/webapps/queue-plus/ticket/"];
const PLAYER_SESSION_COOKIE_NAME = "ciao_player_session";

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

// Internal base URL for self-fetch in middleware (avoids looping through
// nginx HTTPS when the Node server only listens on plain HTTP).
const INTERNAL_ORIGIN =
    process.env.NODE_ENV === "production"
        ? `http://${process.env.HOSTNAME ?? "127.0.0.1"}:${process.env.PORT ?? "3000"}`
        : undefined; // dev: use req.url as-is

async function fetchSession(req: NextRequest, cookieHeader: string): Promise<unknown | null> {
    const base = INTERNAL_ORIGIN ?? req.url;
    const candidates = ["/api/auth/get-session", "/api/auth/session"];

    for (const endpoint of candidates) {
        try {
            const response = await fetch(new URL(endpoint, base), {
                method: "GET",
                headers: {
                    cookie: cookieHeader,
                    accept: "application/json",
                },
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

    const session = await fetchSession(req, sanitizeSessionCookies(req.headers.get("cookie"))) as SessionLike | null;

    if (!session) {
        if (req.nextUrl.pathname.startsWith("/api/")) {
            if (isDev && debugAuthMiddleware) console.log(`[MW] ${method} ${path} -> 401 UNAUTH (${Date.now() - start}ms)`);
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("from", req.nextUrl.pathname);
        if (isDev && debugAuthMiddleware) console.log(`[MW] ${method} ${path} -> REDIRECT /login (${Date.now() - start}ms)`);
        return NextResponse.redirect(loginUrl);
    }

    // /admin/* routes require role "super-admin" (set via better-auth admin plugin)
    if (req.nextUrl.pathname.startsWith("/admin")) {
        const role = (session.user as { role?: string }).role;
        if (role !== "super-admin" && role !== "admin") {
            if (isDev && debugAuthMiddleware) console.log(`[MW] ${method} ${path} -> REDIRECT /dashboard (role=${role}) (${Date.now() - start}ms)`);
            return NextResponse.redirect(new URL("/dashboard", req.url));
        }
    }

    if (isDev && debugAuthMiddleware) {
        const user = (session.user as { email?: string }).email ?? "?";
        console.log(`[MW] ${method} ${path} -> OK (user=${user}) (${Date.now() - start}ms)`);
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
