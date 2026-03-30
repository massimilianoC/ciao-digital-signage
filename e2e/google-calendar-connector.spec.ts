import { expect, test } from "@playwright/test";

type ContentRecord = { _id: string; name: string; config?: { url?: string } };
type ScreenRecord = { _id: string; screenToken: string };
type PlaylistRecord = { _id: string };

test.describe("Google Calendar Connector @auth", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("creates connector from CMS and renders events in player", async ({ page }) => {
        const stamp = Date.now();
        const connectorName = `google-calendar-${stamp}`;
        const fixtureUrl = "http://localhost:3100/fixtures/google-calendar-sample.ics";

        await page.goto("/content/google-calendar/new");
        await page.getByLabel("Nome contenuto").fill(connectorName);
        await page.getByLabel("Titolo UI").fill("Calendario Demo");
        await page.getByLabel("Public ICS URL").fill(fixtureUrl);
        await page.getByRole("button", { name: "Crea connector" }).click();

        await expect(page.getByText("Connector creato correttamente.")).toBeVisible({ timeout: 15000 });

        const contentResp = await page.request.get("/api/content?includeInternalWebappAssets=true");
        expect(contentResp.ok()).toBe(true);
        const contents = (await contentResp.json()) as ContentRecord[];
        const content = contents.find((item) => item.name === connectorName);
        expect(content).toBeTruthy();
        expect(content?.config?.url).toContain("/webapps/google-calendar/");

        const playlistResp = await page.request.post("/api/playlists", {
            data: { name: `gcal-playlist-${stamp}` },
        });
        expect(playlistResp.ok()).toBe(true);
        const playlist = (await playlistResp.json()) as PlaylistRecord;

        const replaceItemsResp = await page.request.patch(`/api/playlists/${playlist._id}`, {
            data: {
                items: [{ contentId: content!._id, title: connectorName, durationMs: 60000 }],
            },
        });
        expect(replaceItemsResp.ok()).toBe(true);

        const screenResp = await page.request.post("/api/screens", {
            data: { name: `gcal-screen-${stamp}`, timezone: "UTC" },
        });
        expect(screenResp.ok()).toBe(true);
        const screen = (await screenResp.json()) as ScreenRecord;

        const scheduleResp = await page.request.post("/api/schedules", {
            data: {
                scope: "screen",
                scopeId: screen._id,
                priority: 3,
                playlistId: playlist._id,
                name: `gcal-schedule-${stamp}`,
                windows: [
                    {
                        startHHMM: "00:00",
                        endHHMM: "23:59",
                        daysOfWeek: [],
                        timezone: "UTC",
                    },
                ],
            },
        });
        expect(scheduleResp.ok()).toBe(true);

        const browser = page.context().browser();
        if (!browser) {
            throw new Error("Browser instance is not available");
        }

        const playerContext = await browser.newContext();
        const playerPage = await playerContext.newPage();
        await playerPage.goto(`/player/${screen._id}?token=${encodeURIComponent(screen.screenToken)}`);

        await expect(playerPage.getByTestId("player-root")).toBeVisible({ timeout: 15000 });
        const frame = playerPage.frameLocator('iframe[title="content"]').first();
        await expect(frame.getByTestId("google-calendar-app")).toBeVisible({ timeout: 15000 });

        await playerContext.close();
    });
});