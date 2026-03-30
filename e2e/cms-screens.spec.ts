/**
 * E2E Tests: Screens management
 *
 * Tests screen listing, registration link, and empty states.
 */
import { test, expect } from "@playwright/test";
import { type APIRequestContext } from "@playwright/test";

async function createScreen(request: APIRequestContext, name: string) {
    const response = await request.post("/api/screens", {
        data: {
            name,
            timezone: "UTC",
        },
    });

    expect(response.ok()).toBe(true);
    return response.json() as Promise<{ _id: string; name: string }>;
}

test.describe("CMS - Screens @auth", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("should display Screens page", async ({ page }) => {
        await page.goto("/screens");
        await expect(page.getByRole("heading", { name: "Screens" })).toBeVisible({ timeout: 10_000 });
    });

    test("should show Register Screen button", async ({ page }) => {
        await page.goto("/screens");
        await expect(page.getByRole("heading", { name: "Screens" })).toBeVisible({ timeout: 10_000 });

        const registerBtn = page.getByRole("link", { name: "Register Screen", exact: true });
        await expect(registerBtn).toBeVisible();
    });

    test("should show empty state when no screens registered", async ({ page }) => {
        await page.goto("/screens");
        await expect(page.getByRole("heading", { name: "Screens" })).toBeVisible({ timeout: 10_000 });
        const noScreens = page.getByText("No screens registered");
        const hasEmptyState = await noScreens.isVisible().catch(() => false);
        if (hasEmptyState) {
            await expect(noScreens).toBeVisible({ timeout: 5_000 });
        } else {
            await expect(page.locator("a[href^='/screens/']").filter({ hasText: /.+/ }).first()).toBeVisible();
        }
    });

    test("should navigate to new screen page", async ({ page }) => {
        await page.goto("/screens");
        await expect(page.getByRole("heading", { name: "Screens" })).toBeVisible({ timeout: 10_000 });
        const registerLink = page.getByRole("link", { name: /Register Screen/i });
        if (await registerLink.isVisible()) {
            await registerLink.click();
            await expect(page).toHaveURL(/\/screens\/new/);
        }
    });

    test("should expose operations nav and disabled roadmap entries", async ({ page }) => {
        await page.goto("/screens");
        await expect(page.getByRole("link", { name: "Operations", exact: true })).toBeVisible({ timeout: 10_000 });
        await expect(page.getByRole("button", { name: "User Management" })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Eagle Eye" })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Statistics" })).toBeDisabled();
    });

    test("should open operations hub", async ({ page }) => {
        await page.goto("/operations");
        await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText("Global operational actions for emergency broadcast")).toBeVisible();
    });

    test("should show player access links on screen detail", async ({ page }) => {
        const screen = await createScreen(page.request, `E2E Screen ${Date.now()}`);

        await page.goto(`/screens/${screen._id}`);
        await expect(page.getByRole("heading", { name: screen.name })).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText("Player access")).toBeVisible();
        await expect(page.getByRole("button", { name: "Copy Player Link" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Copy Activation Link" })).toBeVisible();
    });
});
