import { Types } from "mongoose";

import { type IContentItem, ContentModel } from "@/lib/db/models/Content";
import { PlaylistModel, type IPlaylist } from "@/lib/db/models/Playlist";
import { TenantRepository } from "@/lib/services/base/tenant.repository";

export class PlaylistService extends TenantRepository<IPlaylist> {
  constructor(orgId: string | Types.ObjectId) {
    super(PlaylistModel, new Types.ObjectId(orgId.toString()));
  }

  async backfillPlaybackFlags(): Promise<void> {
    await PlaylistModel.updateMany(
      { orgId: this.orgId, status: { $exists: false } },
      { $set: { status: "active" } },
    );

    await PlaylistModel.updateMany(
      { orgId: this.orgId, loop: { $exists: false } },
      { $set: { loop: true } },
    );

    await PlaylistModel.updateMany(
      { orgId: this.orgId, stopOnLastItem: { $exists: false } },
      { $set: { stopOnLastItem: false } },
    );

    await PlaylistModel.updateMany(
      { orgId: this.orgId, fitModeOverride: { $exists: false } },
      { $set: { fitModeOverride: null } },
    );

    await PlaylistModel.updateMany(
      { orgId: this.orgId, backgroundColorOverride: { $exists: false } },
      { $set: { backgroundColorOverride: null } },
    );

    await PlaylistModel.updateMany(
      { orgId: this.orgId, transitionType: { $exists: false } },
      { $set: { transitionType: "fade" } },
    );

    await PlaylistModel.updateMany(
      { orgId: this.orgId, transitionMs: { $exists: false } },
      { $set: { transitionMs: 500 } },
    );
  }

  private normalizeAssetUrl(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }

    const normalized = value.replace(/\\/g, "/").trim();
    if (!normalized) {
      return undefined;
    }

    if (/^https?:\/\//i.test(normalized) || normalized.startsWith("data:")) {
      return normalized;
    }

    return normalized.startsWith("/") ? normalized : `/${normalized}`;
  }

  private normalizeColor(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    if (/^#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/.test(normalized)) {
      return normalized;
    }

    return null;
  }

  private async hydratePlaylistItems(
    items: Array<{
      contentId: string | Types.ObjectId;
      durationMs?: number | null;
      order?: number;
      fitMode?: "cover" | "fit";
      backgroundColor?: string | null;
      title?: string;
      thumbnailUrl?: string;
    }>,
  ): Promise<Array<{
    contentId: Types.ObjectId;
    durationMs?: number | null;
    order: number;
    fitMode: "cover" | "fit";
    backgroundColor: string | null;
    title?: string;
    thumbnailUrl?: string;
  }>> {
    const normalizedIds = items.map((item) => new Types.ObjectId(item.contentId.toString()));
    const contents = await ContentModel.find({ _id: { $in: normalizedIds } })
      .select({ _id: 1, name: 1, thumbnailUrl: 1, type: 1, config: 1 })
      .lean<IContentItem[]>();

    const contentById = new Map(contents.map((content) => [content._id.toString(), content]));

    return items.map((item, idx) => {
      const contentId = new Types.ObjectId(item.contentId.toString());
      const content = contentById.get(contentId.toString());

      const fallbackThumb =
        content?.type === "image" ? this.normalizeAssetUrl(content?.config?.fileUrl) : undefined;

      return {
        contentId,
        durationMs: item.durationMs,
        order: idx,
        fitMode: item.fitMode === "fit" ? "fit" : "cover",
        backgroundColor: this.normalizeColor(item.backgroundColor),
        title: (item.title?.trim() || content?.name)?.trim(),
        thumbnailUrl: this.normalizeAssetUrl(item.thumbnailUrl) ?? this.normalizeAssetUrl(content?.thumbnailUrl) ?? fallbackThumb,
      };
    });
  }

  async list(): Promise<IPlaylist[]> {
    return this.find();
  }

  async getById(id: string): Promise<IPlaylist | null> {
    return this.findOne({ _id: new Types.ObjectId(id) });
  }

  async getByIdPopulated(id: string): Promise<IPlaylist | null> {
    const playlist = await PlaylistModel.findOne({
      _id: new Types.ObjectId(id),
      orgId: this.orgId,
    })
      .populate("items.contentId")
      .lean();

    return playlist as IPlaylist | null;
  }

  async createPlaylist(
    data: {
      name: string;
      status?: "active" | "suspended";
      loop?: boolean;
      stopOnLastItem?: boolean;
      fitModeOverride?: "cover" | "fit" | null;
      backgroundColorOverride?: string | null;
      transitionType?: "cut" | "fade";
      transitionMs?: number;
      items?: Array<{
        contentId: string | Types.ObjectId;
        durationMs?: number | null;
        order?: number;
        fitMode?: "cover" | "fit";
        backgroundColor?: string | null;
        title?: string;
        thumbnailUrl?: string;
      }>;
    },
  ): Promise<IPlaylist> {
    const items = await this.hydratePlaylistItems(data.items ?? []);

    return this.create({
      name: data.name,
      status: data.status === "suspended" ? "suspended" : "active",
      items,
      loop: data.loop ?? true,
      stopOnLastItem: data.stopOnLastItem ?? false,
      fitModeOverride: data.fitModeOverride ?? null,
      backgroundColorOverride: this.normalizeColor(data.backgroundColorOverride),
      transitionType: data.transitionType === "cut" ? "cut" : "fade",
      transitionMs:
        typeof data.transitionMs === "number" && Number.isFinite(data.transitionMs)
          ? Math.max(0, Math.round(data.transitionMs))
          : 500,
    } as Parameters<typeof this.create>[0]);
  }

  async update(
    id: string,
    data: Partial<Pick<IPlaylist, "name" | "status" | "loop" | "stopOnLastItem" | "fitModeOverride" | "backgroundColorOverride" | "transitionType" | "transitionMs">>,
  ): Promise<void> {
    const normalizedData: Record<string, unknown> = { ...data };
    if (Object.prototype.hasOwnProperty.call(normalizedData, "status")) {
      normalizedData.status = normalizedData.status === "suspended" ? "suspended" : "active";
    }
    if (Object.prototype.hasOwnProperty.call(normalizedData, "backgroundColorOverride")) {
      normalizedData.backgroundColorOverride = this.normalizeColor(normalizedData.backgroundColorOverride);
    }
    if (Object.prototype.hasOwnProperty.call(normalizedData, "transitionType")) {
      normalizedData.transitionType = normalizedData.transitionType === "cut" ? "cut" : "fade";
    }
    if (Object.prototype.hasOwnProperty.call(normalizedData, "transitionMs")) {
      const rawTransitionMs = Number(normalizedData.transitionMs);
      normalizedData.transitionMs = Number.isFinite(rawTransitionMs)
        ? Math.max(0, Math.round(rawTransitionMs))
        : 500;
    }

    await this.updateOne({ _id: new Types.ObjectId(id) }, { $set: normalizedData });
  }

  async remove(id: string): Promise<void> {
    await this.deleteOne({ _id: new Types.ObjectId(id) });
  }

  async replaceItems(
    id: string,
    items: Array<{
      contentId: string | Types.ObjectId;
      durationMs?: number | null;
      order?: number;
      fitMode?: "cover" | "fit";
      backgroundColor?: string | null;
      title?: string;
      thumbnailUrl?: string;
    }>,
  ): Promise<IPlaylist | null> {
    const normalized = await this.hydratePlaylistItems(items);

    return PlaylistModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), orgId: this.orgId },
      { $set: { items: normalized } },
      { new: true },
    ).lean<IPlaylist | null>();
  }
}
