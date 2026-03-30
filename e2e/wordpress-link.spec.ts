import { expect, test } from "@playwright/test";

type ContentRecord = { _id: string; name: string; config?: { url?: string } };

test.describe("WordpressLink Connector @auth", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("creates connector from CMS and renders WordPress items in player", async ({ page }) => {
        const stamp = Date.now();
        const connectorName = `wordpress-link-${stamp}`;
        const baseUrl = "http://localhost:3111";

        await page.goto("/content/wordpress-link/new");
        await page.getByLabel("Nome istanza").fill(connectorName);
        await page.getByLabel("Titolo player").fill("WordPress News Demo");
        await page.getByLabel("Base URL").fill(baseUrl);
        await page.getByLabel("Sorgente").selectOption("wordpress-posts");

        await page.getByRole("button", { name: "Crea connector" }).click();
        await expect(page.getByText("WordpressLink creato correttamente.")).toBeVisible({ timeout: 20_000 });

        const contentResp = await page.request.get("/api/content?includeInternalWebappAssets=true");
        expect(contentResp.ok()).toBe(true);
        const contents = (await contentResp.json()) as ContentRecord[];
        const content = contents.find((item) => item.name === `[WordpressLink] ${connectorName}`);
        expect(content).toBeTruthy();
        expect(content?.config?.url).toContain("/webapps/wordpress-link/");

        const playerUrl = content!.config?.url;
        expect(playerUrl).toBeTruthy();
        await page.goto(playerUrl!);

        await expect(page.getByTestId("wordpress-link-app")).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText("WordPress News Demo")).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText("Fixture WordPress Post 101")).toBeVisible({ timeout: 20_000 });

        // Fetch should return at least one catalog item from source.
        await expect(page.getByText("Nessun elemento disponibile", { exact: false })).not.toBeVisible({ timeout: 20_000 });
    });
});
