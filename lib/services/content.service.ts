import { Types } from "mongoose";

import { ContentModel, type IContentItem } from "@/lib/db/models/Content";
import { TenantRepository } from "@/lib/services/base/tenant.repository";

type ContentCreateInput = Omit<IContentItem, "_id" | "orgId" | "createdAt" | "updatedAt" | "status"> & {
  status?: "active" | "suspended";
};
type ContentUpdateInput = Partial<ContentCreateInput>;

export class ContentService extends TenantRepository<IContentItem> {
  constructor(orgId: string | Types.ObjectId) {
    super(ContentModel, new Types.ObjectId(orgId.toString()));
  }

  async list(folder?: string, tags?: string[], includeInternalWebappAssets = false): Promise<IContentItem[]> {
    const filter: Record<string, unknown> = {};

    if (folder) {
      filter.folder = folder;
    }

    if (tags && tags.length > 0) {
      filter.tags = { $in: tags };
    }

    if (!includeInternalWebappAssets) {
      filter.$or = [
        { internalWebappAsset: { $exists: false } },
        { internalWebappAsset: false },
      ];
    }

    return this.find(filter);
  }

  async getById(id: string): Promise<IContentItem | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.findOne({ _id: new Types.ObjectId(id) });
  }

  async createContent(data: ContentCreateInput): Promise<IContentItem> {
    return this.create(data as Parameters<typeof this.create>[0]);
  }

  async deleteContent(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      return;
    }
    await this.deleteOne({ _id: new Types.ObjectId(id) });
  }

  async updateContent(id: string, data: ContentUpdateInput): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      return;
    }
    await this.updateOne({ _id: new Types.ObjectId(id) }, { $set: data });
  }
}
