import { expect, test } from "@playwright/test";

test.describe("Webapp dataset bindings UI @auth", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("binds a Wordpress dataset from the instance configurator modal", async ({ page }) => {
        const stamp = Date.now();
        const instanceName = `wp-binding-${stamp}`;
        const datasetName = `wp-dataset-${stamp}`;

        const createDatasetRes = await page.request.post("/api/webapps/datasets?appId=wordpress-link", {
            data: {
                name: datasetName,
                datasetKind: "wordpress-catalog-source",
                storageMode: "remote-mirror",
                editorMode: "custom-react",
                config: {
                    sourceKind: "wordpress-posts",
                    authMode: "none",
                    baseUrl: "http://localhost:3111",
                    itemsPerPage: 12,
                    refreshSeconds: 180,
                },
            },
        });
        expect(createDatasetRes.ok()).toBe(true);
        const datasetBody = (await createDatasetRes.json()) as { dataset?: { datasetId?: string } };
        const datasetId = datasetBody.dataset?.datasetId;
        expect(datasetId).toBeTruthy();

        await page.goto("/content/wordpress-link/new");
        await page.getByLabel("Nome istanza").fill(instanceName);
        await page.getByLabel("Titolo player").fill("WP Binding Demo");
        await page.getByLabel("Base URL").fill("http://localhost:3111");
        await page.getByLabel("Sorgente").selectOption("wordpress-posts");
        await page.getByRole("button", { name: "Crea connector" }).click();
        await expect(page.getByText("WordpressLink creato correttamente.")).toBeVisible({ timeout: 20000 });

        const playerUrlText = await page.getByText(/^URL player:/).textContent();
        const playerUrl = playerUrlText?.replace(/^URL player:\s*/, "") ?? "";
        const parsedPlayerUrl = new URL(playerUrl, "http://localhost:3100");
        const instanceId = parsedPlayerUrl.pathname.split("/").filter(Boolean).at(-1);
        expect(instanceId).toBeTruthy();

        await page.goto(`/webapps/wordpress-link/instances/${encodeURIComponent(instanceId || "")}`);
        await expect(page.getByRole("button", { name: "Configurazione" })).toBeVisible({ timeout: 15000 });
        await page.getByRole("button", { name: "Dataset" }).click();
        await expect(page.getByTestId("add-dataset-binding")).toBeVisible();

        const rows = page.getByTestId("dataset-binding-row");
        const beforeCount = await rows.count();
        await page.getByTestId("add-dataset-binding").click();
        await expect(rows).toHaveCount(beforeCount + 1);

        const newRow = rows.nth(beforeCount);
        await newRow.locator("select").first().selectOption(datasetId || "");

        await page.getByTestId("save-dataset-bindings").click();

        await expect.poll(async () => {
            const bindingsRes = await page.request.get(`/api/webapps/instances/${encodeURIComponent(instanceId || "")}/datasets`);
            if (!bindingsRes.ok()) return false;
            const bindingsBody = (await bindingsRes.json()) as { bindings?: Array<{ datasetId: string; role: string }> };
            return (bindingsBody.bindings ?? []).some((binding) => binding.datasetId === datasetId && binding.role === "primary");
        }, { timeout: 10000 }).toBe(true);
    });
});