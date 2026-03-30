import mongoose from "mongoose";
import { describe, expect, it, vi } from "vitest";

import { type IForceOverride } from "../../lib/db/models/ForceOverride";
import { type ISchedule, type IScheduleWindow } from "../../lib/db/models/Schedule";
import { isWindowActiveAt } from "../../lib/scheduling/clock";
import { resolveManifest, type SchedulingDb } from "../../lib/scheduling/resolver";

const oid = (n: number) => {
  const hex = n.toString(16).padStart(24, "0");
  return new mongoose.Types.ObjectId(hex);
};

const orgId = oid(1).toString();
const groupId = oid(2).toString();
const secondGroupId = oid(3).toString();
const screenId = "screen-abc";

const mockScreen = {
  orgId,
  timezone: "Europe/Rome",
  groupIds: [groupId],
  defaultPlaylistId: null,
};

const playlistItems = [
  {
    contentId: "content-1",
    type: "image" as const,
    fileUrl: "https://cdn.example.com/content-1.webp",
    durationMs: 5000,
  },
];

const alwaysActiveWindow: IScheduleWindow = {
  startHHMM: "00:00",
  endHHMM: "23:59",
  daysOfWeek: [],
  timezone: "Europe/Rome",
};

const neverActiveWindow: IScheduleWindow = {
  startHHMM: "02:00",
  endHHMM: "03:00",
  daysOfWeek: [6],
  timezone: "Europe/Rome",
};

const testTs = new Date("2026-03-10T09:30:00.000Z");

const toSchedule = (value: {
  id: number;
  scope: "org" | "group" | "screen";
  scopeId: string;
  priority: 1 | 2 | 3;
  playlistId: string;
  windows?: IScheduleWindow[];
  name?: string;
  createdAt?: Date;
}): ISchedule => {
  const scheduleLike = {
    _id: oid(value.id),
    orgId: oid(1),
    scope: value.scope,
    scopeId: new mongoose.Types.ObjectId(value.scopeId),
    priority: value.priority,
    playlistId: new mongoose.Types.ObjectId(value.playlistId),
    windows: value.windows ?? [alwaysActiveWindow],
    name: value.name ?? "Schedule",
    isActive: true,
    createdAt: value.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  return scheduleLike as unknown as ISchedule;
};

const toForceOverride = (value: {
  playlistId: string;
  isActive?: boolean;
  expiresAt?: Date | null;
}): IForceOverride => {
  const overrideLike = {
    _id: oid(7),
    orgId: oid(1),
    playlistId: new mongoose.Types.ObjectId(value.playlistId),
    publishedBy: oid(8),
    expiresAt: value.expiresAt ?? null,
    isActive: value.isActive ?? true,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
  };

  return overrideLike as unknown as IForceOverride;
};

const makeMockDb = (schedules: ISchedule[], override: IForceOverride | null = null): SchedulingDb => ({
  getScreen: vi.fn().mockResolvedValue(mockScreen),
  getSchedulesForScreen: vi.fn().mockResolvedValue(schedules),
  getForceOverride: vi.fn().mockResolvedValue(override),
  isPlaylistActive: vi.fn().mockResolvedValue(true),
  getPlaylistMetadata: vi.fn().mockResolvedValue({ name: "Playlist" }),
  getPlaylistItems: vi.fn().mockResolvedValue(playlistItems),
  getPlaylistPlayback: vi.fn().mockResolvedValue({ loop: true, stopOnLastItem: false }),
  getLayoutDirect: vi.fn().mockResolvedValue({ name: "Layout", active: true }),
  deactivateOverride: vi.fn().mockResolvedValue(undefined),
});

describe("isWindowActiveAt", () => {
  it("returns true when UTC maps to active Rome local window", () => {
    const utcTime = new Date("2026-03-10T09:30:00.000Z");
    expect(
      isWindowActiveAt(
        {
          startHHMM: "09:00",
          endHHMM: "18:00",
          daysOfWeek: [2],
          timezone: "Europe/Rome",
        },
        utcTime,
      ),
    ).toBe(true);
  });

  it("returns false when local time is before window start", () => {
    const utcTime = new Date("2026-03-10T07:00:00.000Z");
    expect(
      isWindowActiveAt(
        {
          startHHMM: "09:00",
          endHHMM: "18:00",
          daysOfWeek: [2],
          timezone: "Europe/Rome",
        },
        utcTime,
      ),
    ).toBe(false);
  });

  it("returns false when day-of-week does not match", () => {
    const utcTime = new Date("2026-03-10T09:30:00.000Z");
    expect(
      isWindowActiveAt(
        {
          startHHMM: "09:00",
          endHHMM: "18:00",
          daysOfWeek: [6],
          timezone: "Europe/Rome",
        },
        utcTime,
      ),
    ).toBe(false);
  });

  it("returns true when daysOfWeek is empty", () => {
    const utcTime = new Date("2026-03-10T09:30:00.000Z");
    expect(
      isWindowActiveAt(
        {
          startHHMM: "09:00",
          endHHMM: "18:00",
          daysOfWeek: [],
          timezone: "Europe/Rome",
        },
        utcTime,
      ),
    ).toBe(true);
  });

  it("handles DST spring-forward in Rome", () => {
    const utcTime = new Date("2026-03-29T01:30:00.000Z");
    expect(
      isWindowActiveAt(
        {
          startHHMM: "03:00",
          endHHMM: "04:00",
          daysOfWeek: [0],
          timezone: "Europe/Rome",
        },
        utcTime,
      ),
    ).toBe(true);
  });

  it("returns false at exact endHHMM because end is exclusive", () => {
    const utcTime = new Date("2026-03-10T08:00:00.000Z");
    expect(
      isWindowActiveAt(
        {
          startHHMM: "08:00",
          endHHMM: "09:00",
          daysOfWeek: [2],
          timezone: "Europe/Rome",
        },
        utcTime,
      ),
    ).toBe(false);
  });
});

describe("resolveManifest priority", () => {
  it("returns no_content when no schedules are active", async () => {
    const db = makeMockDb([]);
    const manifest = await resolveManifest(screenId, testTs, db);
    expect(manifest.resolvedLayer).toBe("no_content");
    expect(manifest.items).toHaveLength(0);
  });

  it("returns global when only org-level schedule is active", async () => {
    const db = makeMockDb([
      toSchedule({
        id: 11,
        scope: "org",
        scopeId: orgId,
        priority: 1,
        playlistId: oid(20).toString(),
      }),
    ]);
    const manifest = await resolveManifest(screenId, testTs, db);
    expect(manifest.resolvedLayer).toBe("global");
  });

  it("group schedule wins over global when both active", async () => {
    const db = makeMockDb([
      toSchedule({
        id: 12,
        scope: "org",
        scopeId: orgId,
        priority: 1,
        playlistId: oid(21).toString(),
      }),
      toSchedule({
        id: 13,
        scope: "group",
        scopeId: groupId,
        priority: 2,
        playlistId: oid(22).toString(),
      }),
    ]);
    const manifest = await resolveManifest(screenId, testTs, db);
    expect(manifest.resolvedLayer).toBe("group");
  });

  it("group still wins over global when legacy priorities are malformed", async () => {
    const db = makeMockDb([
      toSchedule({
        id: 121,
        scope: "org",
        scopeId: orgId,
        priority: 3,
        playlistId: oid(221).toString(),
      }),
      toSchedule({
        id: 131,
        scope: "group",
        scopeId: groupId,
        priority: 1,
        playlistId: oid(222).toString(),
      }),
    ]);
    const manifest = await resolveManifest(screenId, testTs, db);
    expect(manifest.resolvedLayer).toBe("group");
  });

  it("screen schedule wins over group and global when all active", async () => {
    const db = makeMockDb([
      toSchedule({
        id: 14,
        scope: "org",
        scopeId: orgId,
        priority: 1,
        playlistId: oid(23).toString(),
      }),
      toSchedule({
        id: 15,
        scope: "group",
        scopeId: groupId,
        priority: 2,
        playlistId: oid(24).toString(),
      }),
      toSchedule({
        id: 16,
        scope: "screen",
        scopeId: oid(30).toString(),
        priority: 3,
        playlistId: oid(25).toString(),
      }),
    ]);
    const manifest = await resolveManifest(screenId, testTs, db);
    expect(manifest.resolvedLayer).toBe("screen");
  });

  it("ignores schedules with no active window", async () => {
    const db = makeMockDb([
      toSchedule({
        id: 17,
        scope: "org",
        scopeId: orgId,
        priority: 1,
        playlistId: oid(26).toString(),
      }),
      toSchedule({
        id: 18,
        scope: "group",
        scopeId: groupId,
        priority: 2,
        playlistId: oid(27).toString(),
        windows: [neverActiveWindow],
      }),
    ]);
    const manifest = await resolveManifest(screenId, testTs, db);
    expect(manifest.resolvedLayer).toBe("global");
  });

  it("deterministic tie-breaker picks most recently created for same priority", async () => {
    const olderPlaylistId = oid(28).toString();
    const newerPlaylistId = oid(29).toString();

    const db = makeMockDb([
      toSchedule({
        id: 19,
        scope: "group",
        scopeId: groupId,
        priority: 2,
        playlistId: olderPlaylistId,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      toSchedule({
        id: 20,
        scope: "group",
        scopeId: groupId,
        priority: 2,
        playlistId: newerPlaylistId,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      }),
    ]);

    const manifest = await resolveManifest(screenId, testTs, db);
    expect(manifest.resolvedLayer).toBe("group");
    expect(db.getPlaylistItems).toHaveBeenLastCalledWith(newerPlaylistId);
  });

  it("uses current group membership when resolving group schedules", async () => {
    const groupAPlaylistId = oid(70).toString();
    const groupBPlaylistId = oid(71).toString();
    const db = makeMockDb([]);

    const getScreenMock = db.getScreen as ReturnType<typeof vi.fn>;
    getScreenMock
      .mockResolvedValueOnce({
        orgId,
        timezone: "Europe/Rome",
        groupIds: [groupId],
        defaultPlaylistId: null,
      })
      .mockResolvedValueOnce({
        orgId,
        timezone: "Europe/Rome",
        groupIds: [secondGroupId],
        defaultPlaylistId: null,
      });

    const getSchedulesForScreenMock = db.getSchedulesForScreen as ReturnType<typeof vi.fn>;
    getSchedulesForScreenMock
      .mockResolvedValueOnce([
        toSchedule({
          id: 72,
          scope: "group",
          scopeId: groupId,
          priority: 2,
          playlistId: groupAPlaylistId,
        }),
      ])
      .mockResolvedValueOnce([
        toSchedule({
          id: 73,
          scope: "group",
          scopeId: secondGroupId,
          priority: 2,
          playlistId: groupBPlaylistId,
        }),
      ]);

    await resolveManifest(screenId, testTs, db);
    expect(db.getSchedulesForScreen).toHaveBeenNthCalledWith(1, screenId, orgId, [groupId]);
    expect(db.getPlaylistItems).toHaveBeenLastCalledWith(groupAPlaylistId);

    await resolveManifest(screenId, testTs, db);
    expect(db.getSchedulesForScreen).toHaveBeenNthCalledWith(2, screenId, orgId, [secondGroupId]);
    expect(db.getPlaylistItems).toHaveBeenLastCalledWith(groupBPlaylistId);
  });
});

describe("resolveManifest forced override", () => {
  it("force_override wins over all schedules", async () => {
    const overridePlaylistId = oid(40).toString();
    const db = makeMockDb(
      [
        toSchedule({
          id: 21,
          scope: "screen",
          scopeId: oid(31).toString(),
          priority: 3,
          playlistId: oid(41).toString(),
        }),
      ],
      toForceOverride({ playlistId: overridePlaylistId }),
    );

    const manifest = await resolveManifest(screenId, testTs, db);
    expect(manifest.resolvedLayer).toBe("force_override");
    expect(db.getPlaylistItems).toHaveBeenCalledWith(overridePlaylistId);
  });

  it("expired force override is ignored", async () => {
    const db = makeMockDb(
      [
        toSchedule({
          id: 22,
          scope: "org",
          scopeId: orgId,
          priority: 1,
          playlistId: oid(42).toString(),
        }),
      ],
      toForceOverride({
        playlistId: oid(43).toString(),
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    );

    const manifest = await resolveManifest(screenId, testTs, db);
    expect(manifest.resolvedLayer).toBe("global");
  });

  it("deactivates expired force override asynchronously", async () => {
    const db = makeMockDb(
      [],
      toForceOverride({
        playlistId: oid(44).toString(),
        expiresAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    );

    await resolveManifest(screenId, testTs, db);
    expect(db.deactivateOverride).toHaveBeenCalledWith(orgId);
  });

  it("future expiry force override remains active", async () => {
    const db = makeMockDb(
      [],
      toForceOverride({
        playlistId: oid(45).toString(),
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      }),
    );

    const manifest = await resolveManifest(screenId, testTs, db);
    expect(manifest.resolvedLayer).toBe("force_override");
    expect(db.deactivateOverride).not.toHaveBeenCalled();
  });
});

describe("resolveManifest output shape", () => {
  it("returns required ContentManifest fields", async () => {
    const db = makeMockDb([
      toSchedule({
        id: 23,
        scope: "org",
        scopeId: orgId,
        priority: 1,
        playlistId: oid(46).toString(),
      }),
    ]);

    const manifest = await resolveManifest(screenId, testTs, db);
    expect(manifest).toMatchObject({
      screenId,
      orgId,
      resolvedLayer: "global",
      source: {
        resolvedLayer: "global",
        playlistId: oid(46).toString(),
        playlistName: "Playlist",
        scheduleId: oid(23).toString(),
        scheduleName: "Schedule",
        scope: "org",
      },
      items: expect.any(Array),
      validFrom: expect.any(String),
      transitionType: expect.stringMatching(/^(cut|fade)$/),
      transitionMs: expect.any(Number),
      loop: expect.any(Boolean),
      stopOnLastItem: expect.any(Boolean),
    });
    expect(manifest.manifestId).toBeTruthy();
  });

  it("propagates pdf urlSubtype and marks sole pdf URL as interactive", async () => {
    const db = makeMockDb([
      toSchedule({
        id: 24,
        scope: "org",
        scopeId: orgId,
        priority: 1,
        playlistId: oid(80).toString(),
      }),
    ]);

    const getPlaylistItemsMock = db.getPlaylistItems as ReturnType<typeof vi.fn>;
    getPlaylistItemsMock.mockResolvedValueOnce([
      {
        contentId: "content-pdf",
        type: "url",
        urlSubtype: "pdf",
        url: "https://example.com/file.pdf",
        durationMs: 10000,
      },
    ]);

    const manifest = await resolveManifest(screenId, testTs, db);
    expect(manifest.items).toHaveLength(1);
    expect(manifest.items[0]?.urlSubtype).toBe("pdf");
    expect(manifest.items[0]?.interactive).toBe(true);
  });

  it("does not mark youtube URLs as interactive", async () => {
    const db = makeMockDb([
      toSchedule({
        id: 25,
        scope: "org",
        scopeId: orgId,
        priority: 1,
        playlistId: oid(81).toString(),
      }),
    ]);

    const getPlaylistItemsMock = db.getPlaylistItems as ReturnType<typeof vi.fn>;
    getPlaylistItemsMock.mockResolvedValueOnce([
      {
        contentId: "content-yt",
        type: "url",
        urlSubtype: "youtube",
        url: "https://www.youtube.com/watch?v=abc123",
        durationMs: 10000,
      },
    ]);

    const manifest = await resolveManifest(screenId, testTs, db);
    expect(manifest.items).toHaveLength(1);
    expect(manifest.items[0]?.urlSubtype).toBe("youtube");
    expect(manifest.items[0]?.interactive).toBeUndefined();
  });
});
