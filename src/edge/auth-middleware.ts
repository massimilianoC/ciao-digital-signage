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

async function fetchSession(req: NextRequest, cookieHeader: string): Promise<unknown | null> {
    // Always resolve against the current request origin.
    // In production, forcing an internal http:// origin can invalidate
    // secure auth cookies (`__Secure-*`) and cause false unauthenticated redirects.
    const base = req.url;
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

    const rawCookieHeader = req.headers.get("cookie");
    const session = await fetchSession(req, sanitizeSessionCookies(rawCookieHeader)) as SessionLike | null;

    if (!session) {
        if (req.nextUrl.pathname.startsWith("/api/")) {
            if (isDev && debugAuthMiddleware) console.log(`[MW] ${method} ${path} -> 401 UNAUTH (${Date.now() - start}ms)`);
            const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            clearAuthCookies(response, rawCookieHeader);
            return response;
        }
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("from", req.nextUrl.pathname);
        if (isDev && debugAuthMiddleware) console.log(`[MW] ${method} ${path} -> REDIRECT /login (${Date.now() - start}ms)`);
        const response = NextResponse.redirect(loginUrl);
        clearAuthCookies(response, rawCookieHeader);
        return response;
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
