/**
 * E2E Tests: REST API endpoints
 *
 * Tests the JSON API layer directly — no browser UI needed.
 * Uses Playwright's request context for API testing.
 */
import { test, expect } from "@playwright/test";

let authToken: string;
let authCookies: string;

test.describe("API - Health", () => {
    test("GET /api/health should return ok", async ({ request }) => {
        const resp = await request.get("/api/health");
        expect(resp.ok()).toBe(true);
        const body = await resp.json();
        expect(body.status).toBe("ok");
        expect(body.db).toBe("connected");
    });
});

test.describe("API - Auth", () => {
    test("POST /api/auth/sign-in/email should return token", async ({ request }) => {
        const resp = await request.post("/api/auth/sign-in/email", {
            data: { email: "admin@ciao.local", password: "Admin123!" },
        });
        expect(resp.ok()).toBe(true);
        const body = await resp.json();
        expect(body.token ?? body.session?.token).toBeTruthy();
        expect(body.user.email).toBe("admin@ciao.local");
        // role is set by the admin plugin — may be on user or session
        const role = body.user?.role ?? body.session?.user?.role;
        expect(role).toBe("super-admin");
        authToken = body.token ?? body.session?.token;
    });

    test("POST /api/auth/sign-in/email with wrong password → 401", async ({ request }) => {
        const resp = await request.post("/api/auth/sign-in/email", {
            data: { email: "admin@ciao.local", password: "wrong" },
        });
        expect(resp.ok()).toBe(false);
    });
});

test.describe("API - Protected endpoints (authenticated) @auth", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("GET /api/screens should return array", async ({ page }) => {
        const resp = await page.request.get("/api/screens");
        expect(resp.ok()).toBe(true);
        const body = await resp.json();
        expect(Array.isArray(body)).toBe(true);
    });

    test("GET /api/playlists should return array", async ({ page }) => {
        const resp = await page.request.get("/api/playlists");
        expect(resp.ok()).toBe(true);
        const body = await resp.json();
        expect(Array.isArray(body)).toBe(true);
    });

    test("GET /api/content should return array", async ({ page }) => {
        const resp = await page.request.get("/api/content");
        expect(resp.ok()).toBe(true);
        const body = await resp.json();
        expect(Array.isArray(body)).toBe(true);
    });

    test("GET /api/schedules should return array", async ({ page }) => {
        const resp = await page.request.get("/api/schedules");
        expect(resp.ok()).toBe(true);
        const body = await resp.json();
        // schedules API returns { schedules: [...] }
        const schedules = Array.isArray(body) ? body : body.schedules;
        expect(Array.isArray(schedules)).toBe(true);
    });

    test("GET /api/groups should return array", async ({ page }) => {
        const resp = await page.request.get("/api/groups");
        expect(resp.ok()).toBe(true);
        const body = await resp.json();
        expect(Array.isArray(body)).toBe(true);
    });

    test("POST /api/screens should create a screen", async ({ page }) => {
        const resp = await page.request.post("/api/screens", {
            data: { name: "E2E Test Screen", location: "Test Location" },
        });
        // Might be 200 or 201
        expect(resp.status()).toBeLessThan(300);
        const body = await resp.json();
        expect(body.name ?? body.screen?.name).toBeTruthy();
    });

    test("POST /api/playlists should create a playlist", async ({ page }) => {
        const resp = await page.request.post("/api/playlists", {
            data: { name: "E2E Test Playlist" },
        });
        expect(resp.status()).toBeLessThan(300);
        const body = await resp.json();
        expect(body.name ?? body.playlist?.name).toBeTruthy();
    });
});

test.describe("API - Protected endpoints (unauthenticated)", () => {
    test("GET /api/screens without auth → 401", async ({ request }) => {
        // Use raw request context (no cookies)
        const resp = await request.get("/api/screens");
        expect(resp.status()).toBe(401);
    });

    test("GET /api/playlists without auth → 401", async ({ request }) => {
        const resp = await request.get("/api/playlists");
        expect(resp.status()).toBe(401);
    });

    test("GET /api/content without auth → 401", async ({ request }) => {
        const resp = await request.get("/api/content");
        expect(resp.status()).toBe(401);
    });
});
