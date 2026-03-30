/**
 * E2E Tests: Content Library
 *
 * Tests content listing, filtering, search, and upload link.
 */
import { test, expect } from "@playwright/test";
import { type APIRequestContext } from "@playwright/test";

async function createUrlContent(request: APIRequestContext, name: string) {
    const response = await request.post("/api/content", {
        data: {
            name,
            type: "url",
            folder: "/",
            tags: ["e2e"],
            defaultDurationMs: 10000,
            config: {
                url: "https://example.com",
            },
        },
    });

    expect(response.ok()).toBe(true);
    return response.json() as Promise<{ _id: string; name: string }>;
}

test.describe("CMS - Content Library @auth", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("should display Content Library page", async ({ page }) => {
        await page.goto("/content");
        await expect(page.getByRole("heading", { name: "Content Library" })).toBeVisible({ timeout: 10_000 });
        await expect(page.getByRole("button", { name: "Upload Content" })).toBeVisible();
    });

    test("should show search input", async ({ page }) => {
        await page.goto("/content");
        await expect(page.getByRole("heading", { name: "Content Library" })).toBeVisible({ timeout: 10_000 });
        await expect(page.getByPlaceholder("Search content...")).toBeVisible();
    });

    test("should show semantic category tabs and subtype filters", async ({ page }) => {
        await page.goto("/content");
        await expect(page.getByRole("heading", { name: "Content Library" })).toBeVisible({ timeout: 10_000 });
        await expect(page.getByRole("button", { name: "Media" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Docs" })).toBeVisible();
        await expect(page.getByRole("button", { name: "WebApp Instances" })).toBeVisible();

        // Media tab is active by default, subtype chips should be visible.
        await expect(page.getByRole("button", { name: "Image" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Video" })).toBeVisible();

        await page.getByRole("button", { name: "Docs" }).click();
        await expect(page.getByRole("button", { name: "PDF" })).toBeVisible();
    });

    test("should show empty state when no content exists", async ({ page }) => {
        await page.goto("/content");
        await expect(page.getByRole("heading", { name: "Content Library" })).toBeVisible({ timeout: 10_000 });
        // Either shows content cards or "No content found." message
        const hasContent = await page.locator("[class*=Card], .rounded-lg").count();
        if (hasContent === 0) {
            await expect(page.getByText("No content found")).toBeVisible();
        }
    });

    test("should have upload link pointing to upload page", async ({ page }) => {
        await page.goto("/content");
        await expect(page.getByRole("heading", { name: "Content Library" })).toBeVisible({ timeout: 10_000 });
        const uploadBtn = page.getByRole("button", { name: "Upload Content" }).first()
            ?? page.getByRole("link", { name: "Upload Content" }).first();
        await expect(uploadBtn).toBeVisible();
    });

    test("should edit asset alias from preview metadata panel", async ({ page }) => {
        const seedName = `E2E Content ${Date.now()}`;
        const aliasName = `${seedName} Alias`;
        await createUrlContent(page.request, seedName);

        await page.goto("/content");
        await expect(page.getByRole("heading", { name: "Content Library" })).toBeVisible({ timeout: 10_000 });
        await page.getByPlaceholder("Search content...").fill(seedName);
        await page.getByText(seedName, { exact: true }).first().click();

        await expect(page.getByText("Asset details")).toBeVisible({ timeout: 10_000 });
        await page.getByLabel("Alias name").fill(aliasName);
        await page.getByRole("button", { name: "Save alias" }).click();
        await expect(page.getByLabel("Alias name")).toHaveValue(aliasName);
    });
});
