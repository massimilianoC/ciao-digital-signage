/**
 * E2E Tests: CMS Dashboard & Navigation
 *
 * Tests that all CMS pages load correctly after login.
 */
import { test, expect } from "@playwright/test";

test.describe("CMS - Dashboard @auth", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("should display dashboard with metrics", async ({ page }) => {
        await page.goto("/dashboard");
        await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible({ timeout: 10_000 });

        // Check metric cards are present
        await expect(page.getByText("Screens")).toBeVisible();
        await expect(page.getByText("Content Items")).toBeVisible();
        await expect(page.getByText("Playlists")).toBeVisible();
        await expect(page.getByText("Active Schedules")).toBeVisible();
    });

    test("should show quick actions", async ({ page }) => {
        await page.goto("/dashboard");
        await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText("Upload Content")).toBeVisible();
    });
});

test.describe("CMS - Navigation @auth", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("should show sidebar with navigation links", async ({ page }) => {
        await page.goto("/dashboard");
        await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible({ timeout: 10_000 });

        // Sidebar links
        await expect(page.getByRole("link", { name: "Content Library" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Playlists" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Schedules" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Screens" })).toBeVisible();
    });

    test("should navigate to Content Library page", async ({ page }) => {
        await page.goto("/dashboard");
        await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible({ timeout: 10_000 });
        await page.getByRole("link", { name: "Content Library" }).click();
        await expect(page).toHaveURL(/\/content/);
        await expect(page.getByRole("heading", { name: "Content Library" })).toBeVisible({ timeout: 10_000 });
    });

    test("should navigate to Playlists page", async ({ page }) => {
        await page.goto("/dashboard");
        await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible({ timeout: 10_000 });
        await page.getByRole("link", { name: "Playlists" }).click();
        await expect(page).toHaveURL(/\/playlists/);
        await expect(page.getByRole("heading", { name: "Playlists" })).toBeVisible({ timeout: 10_000 });
    });

    test("should navigate to Screens page", async ({ page }) => {
        await page.goto("/dashboard");
        await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible({ timeout: 10_000 });
        await page.getByRole("link", { name: "Screens" }).click();
        await expect(page).toHaveURL(/\/screens/);
        await expect(page.getByRole("heading", { name: "Screens" })).toBeVisible({ timeout: 10_000 });
    });

    test("should navigate to Schedules page", async ({ page }) => {
        await page.goto("/dashboard");
        await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible({ timeout: 10_000 });
        await page.getByRole("link", { name: "Schedules" }).click();
        await expect(page).toHaveURL(/\/schedules/);
    });
});
