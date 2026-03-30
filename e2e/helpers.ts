/**
 * Shared helpers for Playwright E2E tests.
 */
import { type Page, expect } from "@playwright/test";

export const ADMIN_EMAIL =
    process.env.PLAYWRIGHT_ADMIN_EMAIL ?? process.env.SUPER_ADMIN_EMAIL ?? "admin@ciao.local";
export const ADMIN_PASSWORD =
    process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? process.env.SUPER_ADMIN_PASSWORD ?? "Admin123!";

/**
 * Sign in via the UI login form.
 * Waits for the dashboard to load after successful login.
 */
export async function login(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Wait for redirect to dashboard
    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible({ timeout: 10_000 });
}

/**
 * Sign in via the API (faster, no browser navigation).
 * Sets the session cookie for subsequent page visits.
 * Also activates the first organization to mirror the browser login flow.
 */
export async function loginViaAPI(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
    const resp = await page.request.post("/api/auth/sign-in/email", {
        data: { email, password },
    });
    expect(resp.ok()).toBe(true);
    // The response sets a session cookie via Set-Cookie header
    // Playwright automatically retains cookies in the browser context

    // Activate the first organization so server-rendered pages get orgId
    // (mirrors what the browser login page does via authClient.organization.setActive)
    try {
        const orgsResp = await page.request.get("/api/auth/organization/list");
        if (orgsResp.ok()) {
            const orgs = await orgsResp.json();
            if (Array.isArray(orgs) && orgs.length > 0) {
                await page.request.post("/api/auth/organization/set-active", {
                    data: { organizationId: orgs[0].id },
                });
            }
        }
    } catch {
        // Non-blocking — API routes will still work via getOrgIdFromSession fallback
    }
}
