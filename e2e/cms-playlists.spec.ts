/**
 * E2E Tests: Playlists
 *
 * Tests playlist listing and governance flows.
 */
import { test, expect } from "@playwright/test";
import { type APIRequestContext } from "@playwright/test";

async function createPlaylist(request: APIRequestContext, name: string) {
    const response = await request.post("/api/playlists", {
        data: { name },
    });

    expect(response.ok()).toBe(true);
    return response.json() as Promise<{ _id: string; name: string }>;
}

test.describe("CMS - Playlists @auth", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("should display Playlists page", async ({ page }) => {
        await page.goto("/playlists");
        await expect(page.getByRole("heading", { name: "Playlists" })).toBeVisible({ timeout: 10_000 });
    });

    test("should show New Playlist button", async ({ page }) => {
        await page.goto("/playlists");
        await expect(page.getByRole("heading", { name: "Playlists" })).toBeVisible({ timeout: 10_000 });

        const newBtn = page.getByRole("button", { name: "New Playlist", exact: true });
        await expect(newBtn).toBeVisible();
    });

    test("should show empty state when no playlists exist", async ({ page }) => {
        await page.goto("/playlists");
        await expect(page.getByRole("heading", { name: "Playlists" })).toBeVisible({ timeout: 10_000 });
        const empty = page.getByText("No playlists yet");
        const hasPlaylists = await page.locator("a[href*='/playlists/']").count();
        if (hasPlaylists === 0) {
            await expect(empty).toBeVisible({ timeout: 5_000 });
        }
    });

    test("should rename and suspend a playlist from the editor", async ({ page }) => {
        const seedName = `E2E Playlist ${Date.now()}`;
        const playlist = await createPlaylist(page.request, seedName);

        await page.goto(`/playlists/${playlist._id}`);
        await expect(page.getByRole("button", { name: "Rename playlist" })).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText("Active").first()).toBeVisible();

        await page.getByRole("button", { name: "Rename playlist" }).click();
        await page.getByLabel("Playlist name").fill(`${seedName} Updated`);
        await page.getByRole("button", { name: "Save" }).click();
        await expect(page.getByRole("heading", { name: `${seedName} Updated` })).toBeVisible({ timeout: 10_000 });

        await page.getByRole("button", { name: "Suspend playlist" }).click();
        await expect(page.getByText("Suspended").first()).toBeVisible({ timeout: 10_000 });
    });

    test("should expose upload flow inside add content dialog", async ({ page }) => {
        const playlist = await createPlaylist(page.request, `E2E Picker ${Date.now()}`);

        await page.goto(`/playlists/${playlist._id}`);
        await page.getByRole("button", { name: /Add Content/i }).click();

        await expect(page.getByRole("heading", { name: "Add Content to Playlist" })).toBeVisible({ timeout: 10_000 });
        await page.getByRole("button", { name: "Upload files" }).click();
        await expect(page.getByText("Drag & drop files here")).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText("Newly uploaded items are selected automatically")).toBeVisible();
    });
});
