/**
 * Playwright Global Setup
 *
 * Runs once before the entire test suite:
 *  1. Waits for the server to be ready (handled by webServer config)
 *  2. Logs in as super-admin
 *  3. Calls set-active-organization so server-rendered pages see orgId in session
 *  4. Saves the browser storage state (cookies + localStorage) to a file
 *
 * All test files that need a pre-authenticated context use:
 *   test.use({ storageState: "e2e/.auth/admin.json" })
 *
 * This avoids ~40 individual login calls across the test suite.
 */
import { chromium, type FullConfig, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const E2E_PORT = process.env.PLAYWRIGHT_PORT ?? "3100";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${E2E_PORT}`;
const STATE_PATH = path.join(process.cwd(), "e2e", ".auth", "admin.json");
const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL ?? process.env.SUPER_ADMIN_EMAIL ?? "admin@ciao.local";
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? process.env.SUPER_ADMIN_PASSWORD ?? "Admin123!";

async function signInWithRetry(page: Page) {
    const maxAttempts = 6;
    const delayMs = 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const response = await page.request.post(`${BASE_URL}/api/auth/sign-in/email`, {
            data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
        });

        if (response.ok()) {
            return response;
        }

        if (attempt < maxAttempts) {
            await page.waitForTimeout(delayMs);
            continue;
        }

        return response;
    }

    throw new Error("[global-setup] Unexpected retry flow state");
}

export default async function globalSetup(_config: FullConfig) {
    // Ensure output directory exists
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });

    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    if (process.env.E2E_BYPASS_AUTH === "1") {
        await context.storageState({ path: STATE_PATH });
        console.log(`[global-setup] Auth bypass enabled (E2E_BYPASS_AUTH=1) → ${STATE_PATH}`);
        await browser.close();
        return;
    }

    // ── 1. Sign in ───────────────────────────────────────────────────────────
    const signInResp = await signInWithRetry(page);
    if (!signInResp.ok()) {
        const status = signInResp.status();
        const errorBody = await signInResp.text().catch(() => "<response body unavailable>");
        await browser.close();
        throw new Error(
            `[global-setup] Login failed: ${status} — ${errorBody}`,
        );
    }

    // ── 2. Activate organization ─────────────────────────────────────────────
    // Calls the better-auth endpoint to set activeOrganizationId on the session.
    // The server-side getSessionAndOrg() no longer requires this (it queries MongoDB
    // directly as fallback), but calling it here makes sessions "clean" for future use.
    try {
        const orgsResp = await page.request.get(`${BASE_URL}/api/auth/organization/list`);
        if (orgsResp.ok()) {
            const body = await orgsResp.json();
            // better-auth may return an array or { data: [...] }
            const orgs: Array<{ id: string }> = Array.isArray(body)
                ? body
                : (body as { data?: Array<{ id: string }> }).data ?? [];
            if (orgs.length > 0) {
                await page.request.post(`${BASE_URL}/api/auth/organization/set-active`, {
                    data: { organizationId: orgs[0].id },
                });
            }
        }
    } catch {
        // Non-critical — getSessionAndOrg falls back to member collection
        console.warn("[global-setup] Could not set active organization — tests will use member-collection fallback");
    }

    // ── 3. Pre-warm the main routes so first test hits don't include compile time ─
    const routes = ["/dashboard", "/screens", "/content", "/playlists"];
    await Promise.all(routes.map((r) => page.goto(`${BASE_URL}${r}`).catch(() => null)));

    // ── 4. Save cookies / storage state ──────────────────────────────────────
    await context.storageState({ path: STATE_PATH });
    console.log(`[global-setup] Auth state saved → ${STATE_PATH}`);

    await browser.close();
}
