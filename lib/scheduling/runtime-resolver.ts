import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { ContentModel, type IContentItem } from "@/lib/db/models/Content";
import { CompositeLayoutModel } from "@/lib/db/models/CompositeLayout";
import { ForceOverride, type IForceOverride } from "@/lib/db/models/ForceOverride";
import { GroupModel } from "@/lib/db/models/Group";
import { PlaylistModel, type IPlaylist } from "@/lib/db/models/Playlist";
import { type ISchedule, Schedule } from "@/lib/db/models/Schedule";
import { ScreenModel } from "@/lib/db/models/Screen";

import {
  type ContentManifest,
  resolveManifest,
  type SchedulingDb,
} from "./resolver";

const toObjectId = (id: string): Types.ObjectId => new Types.ObjectId(id);

function createSchedulingDb(): SchedulingDb {
  return {
    async getScreen(screenId) {
      await connectDB();
      const screen = await ScreenModel.findById(screenId)
        .select({ orgId: 1, timezone: 1, groupId: 1, defaultPlaylistId: 1 })
        .lean<{
          orgId?: Types.ObjectId;
          timezone?: string;
          groupId?: Types.ObjectId | null;
          defaultPlaylistId?: Types.ObjectId | null;
        } | null>();

      if (!screen?.orgId) {
        throw new Error(`SCREEN_NOT_FOUND:${screenId}`);
      }

      let groupIds = screen.groupId ? [screen.groupId.toString()] : [];
      if (groupIds.length === 0) {
        const fallbackGroup = await GroupModel.findOne({
          orgId: screen.orgId,
          screenIds: toObjectId(screenId),
        })
          .select({ _id: 1 })
          .lean<{ _id: Types.ObjectId } | null>();

        if (fallbackGroup?._id) {
          groupIds = [fallbackGroup._id.toString()];
        }
      }

      return {
        orgId: screen.orgId.toString(),
        timezone: screen.timezone ?? "UTC",
        groupIds,
        defaultPlaylistId: screen.defaultPlaylistId ? screen.defaultPlaylistId.toString() : null,
      };
    },

    async getSchedulesForScreen(screenId, orgId, groupIds) {
      await connectDB();

      const matchByScope: Array<Record<string, unknown>> = [
        { scope: "org", scopeId: toObjectId(orgId) },
        { scope: "screen", scopeId: toObjectId(screenId) },
      ];

      if (groupIds.length > 0) {
        matchByScope.push({
          scope: "group",
          scopeId: { $in: groupIds.map((id) => toObjectId(id)) },
        });
      }

      return Schedule.find({
        orgId: toObjectId(orgId),
        isActive: { $ne: false },
        $or: matchByScope,
      }).lean<ISchedule[]>();
    },

    async getForceOverride(orgId) {
      await connectDB();
      return ForceOverride.findOne({
        orgId: toObjectId(orgId),
        isActive: true,
      }).lean<IForceOverride | null>();
    },

    async isPlaylistActive(playlistId) {
      await connectDB();
      const playlist = await PlaylistModel.findById(playlistId)
        .select({ status: 1 })
        .lean<{ status?: "active" | "suspended" } | null>();

      return (playlist?.status ?? "active") === "active";
    },

    async getPlaylistMetadata(playlistId) {
      await connectDB();
      const playlist = await PlaylistModel.findById(playlistId)
        .select({ name: 1 })
        .lean<{ name?: string } | null>();

      return {
        name: playlist?.name?.trim() || null,
      };
    },

    async getPlaylistItems(playlistId) {
      await connectDB();
      const playlist = await PlaylistModel.findById(playlistId).lean<IPlaylist | null>();
      if (!playlist) {
        return [];
      }

      const orderedPlaylistItems = [...playlist.items].sort((a, b) => a.order - b.order);
      const contentIds = orderedPlaylistItems.map((item) => item.contentId);
      const contents = await ContentModel.find({ _id: { $in: contentIds } }).lean<IContentItem[]>();
      const contentById = new Map(contents.map((content) => [content._id.toString(), content]));

      const resolvedItems: ContentManifest["items"] = [];
      for (const playlistItem of orderedPlaylistItems) {
        const content = contentById.get(playlistItem.contentId.toString());
        if (!content) {
          continue;
        }

        if ((content.status ?? "active") !== "active") {
          continue;
        }

        const fallbackThumb =
          content.type === "image" && typeof content.config?.fileUrl === "string"
            ? content.config.fileUrl
            : undefined;

        const isVideoLike =
          content.type === "video" ||
          (content.type === "url" && content.config.urlSubtype === "video");
        const hasDurationOverride = playlistItem.durationOverride === true;

        resolvedItems.push({
          contentId: content._id.toString(),
          title: playlistItem.title ?? content.name,
          thumbnailUrl: playlistItem.thumbnailUrl ?? content.thumbnailUrl ?? fallbackThumb,
          type: content.type,
          urlSubtype: content.config.urlSubtype,
          fitMode: playlistItem.fitMode ?? "cover",
          backgroundColor: playlistItem.backgroundColor ?? null,
          fileUrl: content.config.fileUrl,
          url: content.config.url,
          config: content.config,
          durationMs: playlistItem.durationMs ?? content.defaultDurationMs,
          durationOverride: isVideoLike ? hasDurationOverride : true,
        });
      }

      return resolvedItems;
    },

    async getPlaylistPlayback(playlistId) {
      await connectDB();
      const playlist = await PlaylistModel.findById(playlistId)
        .select({ loop: 1, stopOnLastItem: 1, fitModeOverride: 1, backgroundColorOverride: 1, transitionType: 1, transitionMs: 1 })
        .lean<{
          loop?: boolean;
          stopOnLastItem?: boolean;
          fitModeOverride?: "cover" | "fit" | null;
          backgroundColorOverride?: string | null;
          transitionType?: "cut" | "fade";
          transitionMs?: number;
        } | null>();

      return {
        loop: playlist?.loop ?? true,
        stopOnLastItem: playlist?.stopOnLastItem ?? false,
        fitModeOverride: playlist?.fitModeOverride ?? null,
        backgroundColorOverride: playlist?.backgroundColorOverride ?? null,
        transitionType: playlist?.transitionType === "cut" ? "cut" : "fade",
        transitionMs:
          typeof playlist?.transitionMs === "number" && Number.isFinite(playlist.transitionMs)
            ? Math.max(0, Math.round(playlist.transitionMs))
            : 500,
      };
    },

    async getLayoutDirect(layoutId) {
      await connectDB();
      const layout = await CompositeLayoutModel.findById(layoutId)
        .select({ name: 1, status: 1 })
        .lean<{ name?: string; status?: string } | null>();
      if (!layout) return null;
      return { name: layout.name ?? "", active: (layout.status ?? "active") === "active" };
    },

    async deactivateOverride(orgId) {
      await connectDB();
      await ForceOverride.updateOne(
        { orgId: toObjectId(orgId) },
        { $set: { isActive: false } },
      );
    },
  };
}

export async function resolveManifestForScreen(
  screenId: string,
  ts: Date = new Date(),
): Promise<ContentManifest> {
  return resolveManifest(screenId, ts, createSchedulingDb());
}
