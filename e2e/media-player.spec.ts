import { expect, test, type Page } from "@playwright/test";

type ContentResponse = { _id: string };
type PlaylistResponse = { _id: string };
type ScreenResponse = { _id: string; screenToken: string };

const activeWindow = [
    {
        startHHMM: "00:00",
        endHHMM: "23:59",
        daysOfWeek: [],
        timezone: "UTC",
    },
];

async function createScreenSchedule(
    page: Page,
    screenId: string,
    playlistId: string,
    name: string,
) {
    const scheduleResp = await page.request.post("/api/schedules", {
        data: {
            scope: "screen",
            scopeId: screenId,
            priority: 3,
            playlistId,
            name,
            windows: activeWindow,
        },
    });
    expect(scheduleResp.ok()).toBe(true);
}

test.describe("Player media smoke @auth", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("PDF urlSubtype renders PdfRenderer", async ({ page }) => {
        const stamp = Date.now();

        const contentResp = await page.request.post("/api/content", {
            data: {
                name: `pdf-content-${stamp}`,
                type: "url",
                config: {
                    url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
                    urlSubtype: "pdf",
                },
            },
        });
        expect(contentResp.ok()).toBe(true);
        const content = (await contentResp.json()) as ContentResponse;

        const playlistResp = await page.request.post("/api/playlists", {
            data: { name: `pdf-playlist-${stamp}` },
        });
        expect(playlistResp.ok()).toBe(true);
        const playlist = (await playlistResp.json()) as PlaylistResponse;

        const replaceItemsResp = await page.request.patch(`/api/playlists/${playlist._id}`, {
            data: {
                items: [
                    {
                        contentId: content._id,
                        title: "PDF item",
                        durationMs: 10000,
                    },
                ],
            },
        });
        expect(replaceItemsResp.ok()).toBe(true);

        const screenResp = await page.request.post("/api/screens", {
            data: { name: `pdf-screen-${stamp}`, timezone: "UTC" },
        });
        expect(screenResp.ok()).toBe(true);
        const screen = (await screenResp.json()) as ScreenResponse;

        await createScreenSchedule(page, screen._id, playlist._id, `pdf-schedule-${stamp}`);

        const player = await page.context().browser()?.newContext();
        expect(player).toBeTruthy();
        const playerPage = await player!.newPage();
        await playerPage.goto(`/player/${screen._id}?token=${encodeURIComponent(screen.screenToken)}`);

        await expect(playerPage.getByTestId("player-root")).toBeVisible();
        await expect(playerPage.getByTitle("pdf-content")).toBeVisible({ timeout: 15000 });

        await player!.close();
    });

    test("YouTube urlSubtype renders embed iframe URL", async ({ page }) => {
        const stamp = Date.now();

        const contentResp = await page.request.post("/api/content", {
            data: {
                name: `yt-content-${stamp}`,
                type: "url",
                config: {
                    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    urlSubtype: "youtube",
                },
            },
        });
        expect(contentResp.ok()).toBe(true);
        const content = (await contentResp.json()) as ContentResponse;

        const playlistResp = await page.request.post("/api/playlists", {
            data: { name: `yt-playlist-${stamp}` },
        });
        expect(playlistResp.ok()).toBe(true);
        const playlist = (await playlistResp.json()) as PlaylistResponse;

        const replaceItemsResp = await page.request.patch(`/api/playlists/${playlist._id}`, {
            data: {
                items: [
                    {
                        contentId: content._id,
                        title: "YouTube item",
                        durationMs: 10000,
                    },
                ],
            },
        });
        expect(replaceItemsResp.ok()).toBe(true);

        const screenResp = await page.request.post("/api/screens", {
            data: { name: `yt-screen-${stamp}`, timezone: "UTC" },
        });
        expect(screenResp.ok()).toBe(true);
        const screen = (await screenResp.json()) as ScreenResponse;

        await createScreenSchedule(page, screen._id, playlist._id, `yt-schedule-${stamp}`);

        const player = await page.context().browser()?.newContext();
        expect(player).toBeTruthy();
        const playerPage = await player!.newPage();
        await playerPage.goto(`/player/${screen._id}?token=${encodeURIComponent(screen.screenToken)}`);

        await expect(playerPage.getByTestId("player-root")).toBeVisible();

        const iframe = playerPage.locator('iframe[title="content"]').first();
        await expect(iframe).toBeVisible({ timeout: 15000 });
        await expect.poll(async () => (await iframe.getAttribute("src")) ?? "").toContain("youtube.com/embed/");

        await player!.close();
    });

    test("Video item advances on ended event without waiting full duration", async ({ page }) => {
        const stamp = Date.now();

        const videoContentResp = await page.request.post("/api/content", {
            data: {
                name: `video-ended-content-${stamp}`,
                type: "url",
                config: {
                    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
                    urlSubtype: "video",
                },
            },
        });
        expect(videoContentResp.ok()).toBe(true);
        const videoContent = (await videoContentResp.json()) as ContentResponse;

        const imageContentResp = await page.request.post("/api/content", {
            data: {
                name: `post-video-image-content-${stamp}`,
                type: "url",
                config: {
                    url: "https://picsum.photos/seed/ciao-video-ended/1280/720",
                    urlSubtype: "image",
                },
            },
        });
        expect(imageContentResp.ok()).toBe(true);
        const imageContent = (await imageContentResp.json()) as ContentResponse;

        const playlistResp = await page.request.post("/api/playlists", {
            data: { name: `video-ended-playlist-${stamp}` },
        });
        expect(playlistResp.ok()).toBe(true);
        const playlist = (await playlistResp.json()) as PlaylistResponse;

        const replaceItemsResp = await page.request.patch(`/api/playlists/${playlist._id}`, {
            data: {
                items: [
                    {
                        contentId: videoContent._id,
                        title: "Video first",
                        // Long duration to ensure the transition is driven by "ended".
                        durationMs: 120000,
                    },
                    {
                        contentId: imageContent._id,
                        title: "Image second",
                        durationMs: 10000,
                    },
                ],
            },
        });
        expect(replaceItemsResp.ok()).toBe(true);

        const screenResp = await page.request.post("/api/screens", {
            data: { name: `video-ended-screen-${stamp}`, timezone: "UTC" },
        });
        expect(screenResp.ok()).toBe(true);
        const screen = (await screenResp.json()) as ScreenResponse;

        await createScreenSchedule(page, screen._id, playlist._id, `video-ended-schedule-${stamp}`);

        const player = await page.context().browser()?.newContext();
        expect(player).toBeTruthy();
        const playerPage = await player!.newPage();
        await playerPage.goto(`/player/${screen._id}?token=${encodeURIComponent(screen.screenToken)}`);

        await expect(playerPage.getByTestId("player-root")).toBeVisible();
        await expect(playerPage.locator("video").first()).toBeVisible({ timeout: 20000 });

        const imageLocator = playerPage.locator('img[src*="picsum.photos/seed/ciao-video-ended"]').first();
        await expect(imageLocator).toBeVisible({ timeout: 30000 });

        await player!.close();
    });
});
