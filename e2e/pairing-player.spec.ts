import { expect, test } from "@playwright/test";

test.describe("Pairing Activation - Public", () => {
    test("generate code and read pending activation status", async ({ request }) => {
        const generateResp = await request.post("/api/screens/generate-code");
        expect(generateResp.ok()).toBe(true);

        const generated = (await generateResp.json()) as { code: string; screenId: string };
        expect(generated.code).toMatch(/^\d{6}$/);
        expect(generated.screenId).toBeTruthy();

        const statusResp = await request.get(
            `/api/screens/activation-status?screenId=${generated.screenId}`,
        );
        expect(statusResp.ok()).toBe(true);

        const status = (await statusResp.json()) as {
            status: "pending" | "paired" | "expired";
            paired: boolean;
            screenId: string;
            code?: string;
        };

        expect(status.status).toBe("pending");
        expect(status.paired).toBe(false);
        expect(status.screenId).toBe(generated.screenId);
        expect(status.code).toBe(generated.code);
    });
});

test.describe("Pairing Activation - End to End @auth", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("pair screen then player goes online and offline", async ({ page }) => {
        const generateResp = await page.request.post("/api/screens/generate-code");
        expect(generateResp.ok()).toBe(true);
        const generated = (await generateResp.json()) as { code: string; screenId: string };

        const pairResp = await page.request.post("/api/screens/pair", {
            data: {
                code: generated.code,
                name: `E2E Screen ${Date.now()}`,
                timezone: "UTC",
            },
        });
        expect(pairResp.ok()).toBe(true);

        const pairBody = (await pairResp.json()) as {
            screenId: string;
            screenToken: string;
        };

        expect(pairBody.screenId).toBe(generated.screenId);
        expect(pairBody.screenToken).toBeTruthy();

        const statusResp = await page.request.get(
            `/api/screens/activation-status?screenId=${generated.screenId}`,
        );
        expect(statusResp.ok()).toBe(true);

        const statusBody = (await statusResp.json()) as {
            status: "pending" | "paired" | "expired";
            paired: boolean;
            token?: string;
        };

        expect(statusBody.status).toBe("paired");
        expect(statusBody.paired).toBe(true);
        expect(statusBody.token).toBe(pairBody.screenToken);

        const browser = page.context().browser();
        if (!browser) {
            throw new Error("Browser instance is not available in Playwright context");
        }

        const playerContext = await browser.newContext();
        const playerPage = await playerContext.newPage();
        await playerPage.goto(
            `/player/${generated.screenId}?token=${encodeURIComponent(pairBody.screenToken)}`,
        );
        await expect(playerPage.getByTestId("player-root")).toBeVisible();

        await expect.poll(async () => {
            const screensResp = await page.request.get("/api/screens");
            if (!screensResp.ok()) {
                return "request-failed";
            }

            const screens = (await screensResp.json()) as Array<{ _id: string; status: string }>;
            const current = screens.find((screen) => screen._id === generated.screenId);
            return current?.status ?? "missing";
        }, { timeout: 20_000 }).toBe("online");

        await playerContext.close();

        await expect.poll(async () => {
            const screensResp = await page.request.get("/api/screens");
            if (!screensResp.ok()) {
                return "request-failed";
            }

            const screens = (await screensResp.json()) as Array<{ _id: string; status: string }>;
            const current = screens.find((screen) => screen._id === generated.screenId);
            return current?.status ?? "missing";
        }, { timeout: 30_000 }).toBe("offline");
    });

    test("invalid pairing code is rejected", async ({ page }) => {
        const pairResp = await page.request.post("/api/screens/pair", {
            data: {
                code: "999999",
                name: "Invalid Pair",
                timezone: "UTC",
            },
        });

        expect(pairResp.status()).toBe(404);

        const body = (await pairResp.json()) as { error?: string };
        expect(body.error).toContain("Invalid or expired pairing code");
    });
});
