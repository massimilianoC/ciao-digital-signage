import { Model, Types } from "mongoose";

import { GroupModel, IGroup } from "@/lib/db/models/Group";
import { ScreenModel } from "@/lib/db/models/Screen";
import { TenantRepository } from "@/lib/services/base/tenant.repository";

export class GroupService extends TenantRepository<IGroup> {
  constructor(orgId: string | Types.ObjectId) {
    super(GroupModel as unknown as Model<IGroup>, new Types.ObjectId(orgId.toString()));
  }

  async list(): Promise<IGroup[]> {
    return this.find();
  }

  async getById(id: string): Promise<IGroup | null> {
    return this.findOne({ _id: new Types.ObjectId(id) });
  }

  async createGroup(data: Pick<IGroup, "name" | "description" | "defaultPlaylistId">): Promise<IGroup> {
    return this.create(data as Omit<IGroup, "orgId" | "_id">);
  }

  async update(
    id: string,
    data: Partial<Pick<IGroup, "name" | "description">> & {
      defaultPlaylistId?: Types.ObjectId | null;
    },
  ): Promise<void> {
    const updateData = { ...data };

    if (updateData.defaultPlaylistId === null) {
      delete updateData.defaultPlaylistId;
      await this.updateOne(
        { _id: new Types.ObjectId(id) },
        { $unset: { defaultPlaylistId: 1 } },
      );
    }

    if (Object.keys(updateData).length > 0) {
      await this.updateOne({ _id: new Types.ObjectId(id) }, { $set: updateData });
    }
  }

  async remove(id: string): Promise<void> {
    const groupObjectId = new Types.ObjectId(id);
    await ScreenModel.updateMany(
      { orgId: this.orgId, groupId: groupObjectId },
      { $unset: { groupId: 1 } },
    );
    await this.deleteOne({ _id: groupObjectId });
  }

  async assignScreens(groupId: string, screenIds: string[]): Promise<void> {
    const orgObjectId = this.orgId;
    const groupObjectId = new Types.ObjectId(groupId);
    const screenObjectIds = screenIds.map((id) => new Types.ObjectId(id));

    const group = await GroupModel.findOne({ _id: groupObjectId, orgId: orgObjectId });
    if (!group) {
      throw new Error("GROUP_NOT_FOUND");
    }

    await ScreenModel.updateMany(
      { orgId: orgObjectId, groupId: groupObjectId },
      { $unset: { groupId: 1 } },
    );

    await GroupModel.updateMany(
      { orgId: orgObjectId, _id: { $ne: groupObjectId } },
      { $pull: { screenIds: { $in: screenObjectIds } } },
    );

    if (screenIds.length === 0) {
      await GroupModel.updateOne(
        { orgId: orgObjectId, _id: groupObjectId },
        { $set: { screenIds: [] } },
      );
      return;
    }

    await ScreenModel.updateMany(
      {
        _id: { $in: screenObjectIds },
        orgId: orgObjectId,
      },
      { $set: { groupId: groupObjectId } },
    );

    await GroupModel.updateOne(
      { orgId: orgObjectId, _id: groupObjectId },
      { $set: { screenIds: screenObjectIds } },
    );
  }
}
