import { expect, test } from "@playwright/test";

type ScreenResponse = { _id: string; groupId?: string | null };
type GroupResponse = { _id: string; name: string; screenIds?: string[] };
type PlaylistResponse = { _id: string; name: string };
type ScheduleResponse = { _id: string; isActive?: boolean };

const defaultWindow = [
    {
        startHHMM: "00:00",
        endHHMM: "23:59",
        daysOfWeek: [],
        timezone: "UTC",
    },
];

test.describe("Groups + Scheduling Regressions @auth", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("SG-01: moving a screen to another group keeps single membership", async ({ page }) => {
        const stamp = Date.now();

        const createScreen = await page.request.post("/api/screens", {
            data: { name: `sg01-screen-${stamp}`, timezone: "UTC" },
        });
        expect(createScreen.ok()).toBe(true);
        const screen = (await createScreen.json()) as ScreenResponse;

        const createGroupA = await page.request.post("/api/groups", {
            data: { name: `sg01-group-a-${stamp}`, screenIds: [screen._id] },
        });
        expect(createGroupA.ok()).toBe(true);
        const groupA = (await createGroupA.json()) as GroupResponse;

        const createGroupB = await page.request.post("/api/groups", {
            data: { name: `sg01-group-b-${stamp}` },
        });
        expect(createGroupB.ok()).toBe(true);
        const groupB = (await createGroupB.json()) as GroupResponse;

        const moveToB = await page.request.patch(`/api/groups/${groupB._id}`, {
            data: { screenIds: [screen._id] },
        });
        expect(moveToB.ok()).toBe(true);

        const groupsResp = await page.request.get("/api/groups");
        expect(groupsResp.ok()).toBe(true);
        const groups = (await groupsResp.json()) as GroupResponse[];

        const a = groups.find((g) => g._id === groupA._id);
        const b = groups.find((g) => g._id === groupB._id);
        expect(a).toBeTruthy();
        expect(b).toBeTruthy();
        expect(a?.screenIds?.includes(screen._id) ?? false).toBe(false);
        expect(b?.screenIds?.includes(screen._id) ?? false).toBe(true);

        const screensResp = await page.request.get("/api/screens");
        expect(screensResp.ok()).toBe(true);
        const screens = (await screensResp.json()) as ScreenResponse[];
        const moved = screens.find((s) => s._id === screen._id);
        expect(String(moved?.groupId ?? "")).toBe(groupB._id);
    });

    test("Scheduling lifecycle: single-active, activate parked, delete promotes parked", async ({ page }) => {
        const stamp = Date.now();

        const groupResp = await page.request.post("/api/groups", {
            data: { name: `sched-group-${stamp}` },
        });
        expect(groupResp.ok()).toBe(true);
        const group = (await groupResp.json()) as GroupResponse;

        const playlistAResp = await page.request.post("/api/playlists", {
            data: { name: `sched-playlist-a-${stamp}` },
        });
        expect(playlistAResp.ok()).toBe(true);
        const playlistA = (await playlistAResp.json()) as PlaylistResponse;

        const playlistBResp = await page.request.post("/api/playlists", {
            data: { name: `sched-playlist-b-${stamp}` },
        });
        expect(playlistBResp.ok()).toBe(true);
        const playlistB = (await playlistBResp.json()) as PlaylistResponse;

        const createA = await page.request.post("/api/schedules", {
            data: {
                scope: "group",
                scopeId: group._id,
                priority: 2,
                playlistId: playlistA._id,
                name: `sched-a-${stamp}`,
                windows: [
                    {
                        startHHMM: "00:00",
                        endHHMM: "06:00",
                        daysOfWeek: [],
                        timezone: "UTC",
                    },
                ],
            },
        });
        expect(createA.ok()).toBe(true);
        const scheduleA = ((await createA.json()) as { schedule: ScheduleResponse }).schedule;

        const createB = await page.request.post("/api/schedules", {
            data: {
                scope: "group",
                scopeId: group._id,
                priority: 2,
                playlistId: playlistB._id,
                name: `sched-b-${stamp}`,
                windows: [
                    {
                        startHHMM: "12:00",
                        endHHMM: "18:00",
                        daysOfWeek: [],
                        timezone: "UTC",
                    },
                ],
            },
        });
        expect(createB.ok()).toBe(true);
        const scheduleB = ((await createB.json()) as { schedule: ScheduleResponse }).schedule;

        const list1Resp = await page.request.get(`/api/schedules?scope=group&scopeId=${group._id}&includeInactive=1`);
        expect(list1Resp.ok()).toBe(true);
        const list1 = (await list1Resp.json()) as { schedules: ScheduleResponse[] };
        const afterCreateA = list1.schedules.find((s) => s._id === scheduleA._id);
        const afterCreateB = list1.schedules.find((s) => s._id === scheduleB._id);
        expect(afterCreateA?.isActive).toBe(false);
        expect(afterCreateB?.isActive).toBe(true);

        const activateA = await page.request.patch(`/api/schedules/${scheduleA._id}`, {
            data: { isActive: true },
        });
        expect(activateA.ok()).toBe(true);

        const list2Resp = await page.request.get(`/api/schedules?scope=group&scopeId=${group._id}&includeInactive=1`);
        expect(list2Resp.ok()).toBe(true);
        const list2 = (await list2Resp.json()) as { schedules: ScheduleResponse[] };
        const afterActivateA = list2.schedules.find((s) => s._id === scheduleA._id);
        const afterActivateB = list2.schedules.find((s) => s._id === scheduleB._id);
        expect(afterActivateA?.isActive).toBe(true);
        expect(afterActivateB?.isActive).toBe(false);

        const deleteA = await page.request.delete(`/api/schedules/${scheduleA._id}`);
        expect(deleteA.status()).toBe(204);

        const list3Resp = await page.request.get(`/api/schedules?scope=group&scopeId=${group._id}&includeInactive=1`);
        expect(list3Resp.ok()).toBe(true);
        const list3 = (await list3Resp.json()) as { schedules: ScheduleResponse[] };
        const remainingB = list3.schedules.find((s) => s._id === scheduleB._id);
        expect(remainingB?.isActive).toBe(true);
    });
});
