import { randomUUID } from "node:crypto";

import type { IForceOverride } from "../db/models/ForceOverride";
import type { ISchedule } from "../db/models/Schedule";
import { isWindowActiveAt } from "./clock";

export type ContentResolvedLayer = "global" | "group" | "screen" | "force_override" | "no_content";

export interface ContentManifestSource {
  resolvedLayer: ContentResolvedLayer;
  playlistId: string | null;
  playlistName: string | null;
  layoutId: string | null;
  layoutName: string | null;
  scheduleId: string | null;
  scheduleName: string | null;
  scope: "org" | "group" | "screen" | "override" | null;
}

export interface ContentManifest {
  manifestId: string;
  screenId: string;
  orgId: string;
  items: Array<{
    contentId: string;
    title?: string;
    thumbnailUrl?: string;
    type: "image" | "video" | "url" | "widget" | "layout";
    urlSubtype?: "youtube" | "video" | "image" | "pdf" | "webpage";
    /** true when this URL item is the sole item in the resolved playlist */
    interactive?: boolean;
    fitMode?: "cover" | "fit";
    backgroundColor?: string | null;
    fileUrl?: string;
    url?: string;
    config?: Record<string, unknown>;
    durationMs: number;
  }>;
  validFrom: string;
  validUntil: string | null;
  transitionType: "cut" | "fade";
  transitionMs: number;
  resolvedLayer: ContentResolvedLayer;
  source: ContentManifestSource;
  loop: boolean;
  stopOnLastItem: boolean;
  fitModeOverride?: "cover" | "fit" | null;
  backgroundColorOverride?: string | null;
}

export interface SchedulingDb {
  getScreen(
    screenId: string,
  ): Promise<{ orgId: string; timezone: string; groupIds: string[]; defaultPlaylistId: string | null }>;
  getSchedulesForScreen(screenId: string, orgId: string, groupIds: string[]): Promise<ISchedule[]>;
  getForceOverride(orgId: string): Promise<IForceOverride | null>;
  isPlaylistActive(playlistId: string): Promise<boolean>;
  getPlaylistMetadata(playlistId: string): Promise<{ name: string | null }>;
  getPlaylistItems(playlistId: string): Promise<ContentManifest["items"]>;
  getPlaylistPlayback(playlistId: string): Promise<{
    loop: boolean;
    stopOnLastItem: boolean;
    fitModeOverride?: "cover" | "fit" | null;
    backgroundColorOverride?: string | null;
    transitionType?: "cut" | "fade";
    transitionMs?: number;
  }>;
  getLayoutDirect(layoutId: string): Promise<{ name: string; active: boolean } | null>;
  deactivateOverride(orgId: string): Promise<void>;
}

const scheduleLayerByScope: Record<ISchedule["scope"], ContentManifest["resolvedLayer"]> = {
  org: "global",
  group: "group",
  screen: "screen",
};

const scopeRank: Record<ISchedule["scope"], number> = {
  org: 1,
  group: 2,
  screen: 3,
};

const isExpiredOverride = (override: IForceOverride, ts: Date): boolean =>
  override.expiresAt !== null && override.expiresAt < ts;

const compareSchedules = (a: ISchedule, b: ISchedule): number => {
  const scopeDiff = scopeRank[b.scope] - scopeRank[a.scope];
  if (scopeDiff !== 0) {
    return scopeDiff;
  }

  if (b.priority !== a.priority) {
    return b.priority - a.priority;
  }

  const createdAtDiff = b.createdAt.getTime() - a.createdAt.getTime();
  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }

  return b._id.toString().localeCompare(a._id.toString());
};

const buildManifest = (
  screenId: string,
  orgId: string,
  items: ContentManifest["items"],
  resolvedLayer: ContentResolvedLayer,
  ts: Date,
  playback: {
    loop: boolean;
    stopOnLastItem: boolean;
    fitModeOverride?: "cover" | "fit" | null;
    backgroundColorOverride?: string | null;
    transitionType?: "cut" | "fade";
    transitionMs?: number;
  } = {
      loop: true,
      stopOnLastItem: false,
      fitModeOverride: null,
      backgroundColorOverride: null,
      transitionType: "fade",
      transitionMs: 500,
    },
  source: ContentManifestSource = {
    resolvedLayer,
    playlistId: null,
    playlistName: null,
    layoutId: null,
    layoutName: null,
    scheduleId: null,
    scheduleName: null,
    scope: null,
  },
): ContentManifest => ({
  manifestId: randomUUID(),
  screenId,
  orgId,
  items,
  validFrom: ts.toISOString(),
  validUntil: null,
  resolvedLayer,
  source,
  loop: playback.loop,
  stopOnLastItem: playback.stopOnLastItem,
  fitModeOverride: playback.fitModeOverride ?? null,
  backgroundColorOverride: playback.backgroundColorOverride ?? null,
  transitionType: playback.transitionType === "cut" ? "cut" : "fade",
  transitionMs: typeof playback.transitionMs === "number" ? Math.max(0, playback.transitionMs) : 500,
});

async function buildPlaylistManifest(
  screenId: string,
  orgId: string,
  playlistId: string,
  resolvedLayer: ContentResolvedLayer,
  ts: Date,
  db: SchedulingDb,
  sourceMeta: Pick<ContentManifestSource, "scheduleId" | "scheduleName" | "scope">,
): Promise<ContentManifest | null> {
  const isActive = await db.isPlaylistActive(playlistId);
  if (!isActive) {
    return null;
  }

  const playlist = await db.getPlaylistMetadata(playlistId);
  const items = await db.getPlaylistItems(playlistId);
  const playback = await db.getPlaylistPlayback(playlistId);
  const resolvedItems = items.map((item) => ({
    ...item,
    fitMode: playback.fitModeOverride ?? item.fitMode ?? "cover",
    backgroundColor: playback.backgroundColorOverride ?? item.backgroundColor ?? null,
  }));

  // A schedule with an empty playlist should not shadow lower-priority layers.
  if (resolvedItems.length === 0) {
    return null;
  }

  // A sole URL webpage/pdf item gets interactive mode.
  const isSoleInteractiveUrl =
    resolvedItems.length === 1 &&
    resolvedItems[0].type === "url" &&
    (!resolvedItems[0].urlSubtype || resolvedItems[0].urlSubtype === "webpage" || resolvedItems[0].urlSubtype === "pdf");
  const finalItems = isSoleInteractiveUrl
    ? resolvedItems.map((item) => ({ ...item, interactive: true as const }))
    : resolvedItems;

  return buildManifest(screenId, orgId, finalItems, resolvedLayer, ts, playback, {
    resolvedLayer,
    playlistId,
    playlistName: playlist.name,
    layoutId: null,
    layoutName: null,
    scheduleId: sourceMeta.scheduleId,
    scheduleName: sourceMeta.scheduleName,
    scope: sourceMeta.scope,
  });
}

async function buildLayoutManifest(
  screenId: string,
  orgId: string,
  layoutId: string,
  resolvedLayer: ContentResolvedLayer,
  ts: Date,
  db: SchedulingDb,
  sourceMeta: Pick<ContentManifestSource, "scheduleId" | "scheduleName" | "scope">,
): Promise<ContentManifest | null> {
  const layout = await db.getLayoutDirect(layoutId);
  if (!layout || !layout.active) {
    return null;
  }

  // A layout schedule produces a single synthetic item of type "layout".
  // The player uses contentId to fetch the full zone definition from /api/player/layout.
  const items: ContentManifest["items"] = [
    {
      contentId: layoutId,
      title: layout.name,
      type: "layout" as const,
      durationMs: 0, // 0 = indefinite; player holds until schedule window ends
    },
  ];

  return buildManifest(
    screenId,
    orgId,
    items,
    resolvedLayer,
    ts,
    { loop: false, stopOnLastItem: true, fitModeOverride: null, backgroundColorOverride: null, transitionType: "cut", transitionMs: 0 },
    {
      resolvedLayer,
      playlistId: null,
      playlistName: null,
      layoutId,
      layoutName: layout.name,
      scheduleId: sourceMeta.scheduleId,
      scheduleName: sourceMeta.scheduleName,
      scope: sourceMeta.scope,
    },
  );
}

export async function resolveManifest(
  screenId: string,
  ts: Date,
  db: SchedulingDb,
): Promise<ContentManifest> {
  const screen = await db.getScreen(screenId);
  const { orgId, timezone, groupIds, defaultPlaylistId } = screen;

  const forceOverride = await db.getForceOverride(orgId);
  if (forceOverride?.isActive) {
    if (isExpiredOverride(forceOverride, ts)) {
      void db.deactivateOverride(orgId);
    } else {
      const overrideManifest = await buildPlaylistManifest(
        screenId,
        orgId,
        forceOverride.playlistId.toString(),
        "force_override",
        ts,
        db,
        {
          scheduleId: null,
          scheduleName: "Force override",
          scope: "override",
        },
      );
      if (overrideManifest) {
        return overrideManifest;
      }
    }
  }

  const schedules = await db.getSchedulesForScreen(screenId, orgId, groupIds);
  const activeSchedules = schedules.filter((schedule) =>
    schedule.windows.some((window) => isWindowActiveAt(window, ts, timezone)),
  );

  if (activeSchedules.length === 0) {
    if (defaultPlaylistId) {
      const defaultManifest = await buildPlaylistManifest(
        screenId,
        orgId,
        defaultPlaylistId,
        "screen",
        ts,
        db,
        {
          scheduleId: null,
          scheduleName: null,
          scope: "screen",
        },
      );
      if (defaultManifest) {
        return defaultManifest;
      }
    }

    return buildManifest(screenId, orgId, [], "no_content", ts);
  }

  const sortedSchedules = [...activeSchedules].sort(compareSchedules);
  for (const schedule of sortedSchedules) {
    const sourceMeta = {
      scheduleId: schedule._id.toString(),
      scheduleName: schedule.name,
      scope: schedule.scope,
    };

    if (schedule.layoutId) {
      const manifest = await buildLayoutManifest(
        screenId,
        orgId,
        schedule.layoutId.toString(),
        scheduleLayerByScope[schedule.scope],
        ts,
        db,
        sourceMeta,
      );
      if (manifest) {
        return manifest;
      }
    } else if (schedule.playlistId) {
      const manifest = await buildPlaylistManifest(
        screenId,
        orgId,
        schedule.playlistId.toString(),
        scheduleLayerByScope[schedule.scope],
        ts,
        db,
        sourceMeta,
      );
      if (manifest) {
        return manifest;
      }
    }
  }

  if (defaultPlaylistId) {
    const defaultManifest = await buildPlaylistManifest(
      screenId,
      orgId,
      defaultPlaylistId,
      "screen",
      ts,
      db,
      {
        scheduleId: null,
        scheduleName: null,
        scope: "screen",
      },
    );
    if (defaultManifest) {
      return defaultManifest;
    }
  }

  return buildManifest(screenId, orgId, [], "no_content", ts);
}
