/**
 * E2E Tests: Schedules
 *
 * Covers schedule explorer scale mode (SC-08) and baseline navigation.
 */
import { expect, test } from "@playwright/test";

test.describe("CMS - Schedules @auth", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("should render schedules explorer controls", async ({ page }) => {
        await page.goto("/schedules");
        await expect(page.getByRole("heading", { name: "Schedules", exact: true })).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText("Scale mode enabled (SC-08)")).toBeVisible();
        await expect(page.getByRole("button", { name: "All" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Groups" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Screens" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Grid" })).toBeVisible();
        await expect(page.getByRole("button", { name: "List" })).toBeVisible();
    });

    test("should open global schedule timeline from explorer", async ({ page }) => {
        await page.goto("/schedules");
        await page.getByRole("link", { name: /Edit Timeline/i }).first().click();
        await expect(page).toHaveURL(/\/schedules\/global\/org/);
        await expect(page.getByRole("heading", { name: "Global Schedule" })).toBeVisible({ timeout: 10_000 });
    });
});
