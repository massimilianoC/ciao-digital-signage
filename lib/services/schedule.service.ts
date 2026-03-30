import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { ForceOverride, IForceOverride } from "@/lib/db/models/ForceOverride";
import { GroupModel } from "@/lib/db/models/Group";
import { ISchedule, Schedule } from "@/lib/db/models/Schedule";
import { ScreenModel } from "@/lib/db/models/Screen";

type CreateScheduleInput = {
  orgId: string;
  scope: ISchedule["scope"];
  scopeId: string;
  priority: ISchedule["priority"];
  playlistId?: string;
  layoutId?: string;
  windows: ISchedule["windows"];
  name: string;
  isActive?: boolean;
};

type UpdateScheduleInput = Partial<
  Omit<Pick<ISchedule, "name" | "windows" | "playlistId" | "isActive">, "playlistId">
> & {
  playlistId?: string;
  layoutId?: string;
};

type PublishOverrideInput = {
  orgId: string;
  playlistId: string;
  publishedBy: string;
  expiresAt?: Date | null;
};

export class ScheduleService {
  private static async backfillIsActive(orgId: string): Promise<void> {
    await Schedule.updateMany(
      {
        orgId: new Types.ObjectId(orgId),
        isActive: { $exists: false },
      },
      { $set: { isActive: true } },
    );
  }

  static async listByScope(
    orgId: string,
    scope: ISchedule["scope"],
    scopeId: string,
    options?: { includeInactive?: boolean },
  ): Promise<ISchedule[]> {
    await connectDB();
    await this.backfillIsActive(orgId);
    await this.pruneInvalidSchedules(orgId);

    const query: Record<string, unknown> = {
      orgId: new Types.ObjectId(orgId),
      scope,
      scopeId: new Types.ObjectId(scopeId),
    };

    if (!options?.includeInactive) {
      query.isActive = { $ne: false };
    }

    return Schedule.find(query).lean<ISchedule[]>();
  }

  static async listByOrg(orgId: string, options?: { includeInactive?: boolean }): Promise<ISchedule[]> {
    await connectDB();
    await this.backfillIsActive(orgId);
    await this.pruneInvalidSchedules(orgId);
    const query: Record<string, unknown> = { orgId: new Types.ObjectId(orgId) };
    if (!options?.includeInactive) {
      query.isActive = { $ne: false };
    }
    return Schedule.find(query).lean<ISchedule[]>();
  }

  static async create(data: CreateScheduleInput): Promise<ISchedule> {
    await connectDB();
    return Schedule.create({
      orgId: new Types.ObjectId(data.orgId),
      scope: data.scope,
      scopeId: new Types.ObjectId(data.scopeId),
      priority: data.priority,
      ...(data.playlistId ? { playlistId: new Types.ObjectId(data.playlistId) } : {}),
      ...(data.layoutId ? { layoutId: new Types.ObjectId(data.layoutId) } : {}),
      windows: data.windows,
      name: data.name,
      isActive: data.isActive ?? true,
    });
  }

  static async findById(id: string, orgId: string): Promise<ISchedule | null> {
    await connectDB();
    return Schedule.findOne({ _id: new Types.ObjectId(id), orgId: new Types.ObjectId(orgId) }).lean<
      ISchedule | null
    >();
  }

  static async update(id: string, orgId: string, data: UpdateScheduleInput): Promise<ISchedule | null> {
    await connectDB();

    const updateData: Record<string, unknown> = { ...data };
    const unsetData: Record<string, ""> = {};
    if (updateData.playlistId && typeof updateData.playlistId === "string") {
      updateData.playlistId = new Types.ObjectId(updateData.playlistId);
      unsetData.layoutId = "";
    }
    if (updateData.layoutId && typeof updateData.layoutId === "string") {
      updateData.layoutId = new Types.ObjectId(updateData.layoutId);
      unsetData.playlistId = "";
    }

    const updateOps: Record<string, unknown> = { $set: updateData };
    if (Object.keys(unsetData).length > 0) {
      updateOps.$unset = unsetData;
    }

    return Schedule.findOneAndUpdate(
      { _id: new Types.ObjectId(id), orgId: new Types.ObjectId(orgId) },
      updateOps,
      { new: true, runValidators: true },
    ).lean<ISchedule | null>();
  }

  static async enforceSingleActiveForTarget(
    orgId: string,
    scope: ISchedule["scope"],
    scopeId: string,
    activeScheduleId: string,
  ): Promise<void> {
    await connectDB();
    await Schedule.updateMany(
      {
        orgId: new Types.ObjectId(orgId),
        scope,
        scopeId: new Types.ObjectId(scopeId),
        _id: { $ne: new Types.ObjectId(activeScheduleId) },
      },
      { $set: { isActive: false } },
    );

    await Schedule.updateOne(
      {
        orgId: new Types.ObjectId(orgId),
        _id: new Types.ObjectId(activeScheduleId),
      },
      { $set: { isActive: true } },
    );
  }

  static async findMostRecentParkedForTarget(
    orgId: string,
    scope: ISchedule["scope"],
    scopeId: string,
    options?: { excludeId?: string },
  ): Promise<ISchedule | null> {
    await connectDB();

    const query: Record<string, unknown> = {
      orgId: new Types.ObjectId(orgId),
      scope,
      scopeId: new Types.ObjectId(scopeId),
      isActive: false,
    };

    if (options?.excludeId) {
      query._id = { $ne: new Types.ObjectId(options.excludeId) };
    }

    return Schedule.findOne(query)
      .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
      .lean<ISchedule | null>();
  }

  static async delete(id: string, orgId: string): Promise<boolean> {
    await connectDB();
    const result = await Schedule.deleteOne({
      _id: new Types.ObjectId(id),
      orgId: new Types.ObjectId(orgId),
    });
    return result.deletedCount === 1;
  }

  static async deleteByScope(
    orgId: string,
    scope: ISchedule["scope"],
    scopeId: string,
  ): Promise<number> {
    await connectDB();
    const result = await Schedule.deleteMany({
      orgId: new Types.ObjectId(orgId),
      scope,
      scopeId: new Types.ObjectId(scopeId),
    });
    return result.deletedCount ?? 0;
  }

  static async validateScopeTarget(
    orgId: string,
    scope: ISchedule["scope"],
    scopeId: string,
  ): Promise<string | null> {
    if (!Types.ObjectId.isValid(scopeId)) {
      return "scopeId must be a valid ObjectId";
    }

    await connectDB();
    const orgObjectId = new Types.ObjectId(orgId);
    const scopeObjectId = new Types.ObjectId(scopeId);

    if (scope === "org") {
      return scopeId === orgId ? null : "For org scope, scopeId must match current orgId";
    }

    if (scope === "group") {
      const exists = await GroupModel.exists({ _id: scopeObjectId, orgId: orgObjectId });
      return exists ? null : "Group not found for this organization";
    }

    const exists = await ScreenModel.exists({ _id: scopeObjectId, orgId: orgObjectId });
    return exists ? null : "Screen not found for this organization";
  }

  static async pruneInvalidSchedules(orgId: string): Promise<number> {
    await connectDB();
    await this.backfillIsActive(orgId);

    const orgObjectId = new Types.ObjectId(orgId);
    const schedules = await Schedule.find({ orgId: orgObjectId })
      .select({ _id: 1, scope: 1, scopeId: 1 })
      .lean<Array<Pick<ISchedule, "_id" | "scope" | "scopeId">>>();

    if (schedules.length === 0) {
      return 0;
    }

    const groupScopeIds = Array.from(
      new Set(
        schedules
          .filter((schedule) => schedule.scope === "group")
          .map((schedule) => schedule.scopeId.toString()),
      ),
    );
    const screenScopeIds = Array.from(
      new Set(
        schedules
          .filter((schedule) => schedule.scope === "screen")
          .map((schedule) => schedule.scopeId.toString()),
      ),
    );

    const [groups, screens] = await Promise.all([
      groupScopeIds.length > 0
        ? GroupModel.find({
          orgId: orgObjectId,
          _id: { $in: groupScopeIds.map((id) => new Types.ObjectId(id)) },
        })
          .select({ _id: 1 })
          .lean<Array<{ _id: Types.ObjectId }>>()
        : Promise.resolve([] as Array<{ _id: Types.ObjectId }>),
      screenScopeIds.length > 0
        ? ScreenModel.find({
          orgId: orgObjectId,
          _id: { $in: screenScopeIds.map((id) => new Types.ObjectId(id)) },
        })
          .select({ _id: 1 })
          .lean<Array<{ _id: Types.ObjectId }>>()
        : Promise.resolve([] as Array<{ _id: Types.ObjectId }>),
    ]);

    const validGroupIds = new Set(groups.map((group) => group._id.toString()));
    const validScreenIds = new Set(screens.map((screen) => screen._id.toString()));

    const invalidScheduleIds = schedules
      .filter((schedule) => {
        const currentScopeId = schedule.scopeId.toString();
        if (schedule.scope === "org") {
          return currentScopeId !== orgId;
        }
        if (schedule.scope === "group") {
          return !validGroupIds.has(currentScopeId);
        }
        return !validScreenIds.has(currentScopeId);
      })
      .map((schedule) => schedule._id);

    if (invalidScheduleIds.length === 0) {
      return 0;
    }

    const result = await Schedule.deleteMany({
      orgId: orgObjectId,
      _id: { $in: invalidScheduleIds },
    });

    return result.deletedCount ?? 0;
  }

  static async getActiveOverride(orgId: string): Promise<IForceOverride | null> {
    await connectDB();
    return ForceOverride.findOne({ orgId: new Types.ObjectId(orgId), isActive: true }).lean<
      IForceOverride | null
    >();
  }

  static async publishOverride(data: PublishOverrideInput): Promise<IForceOverride> {
    await connectDB();

    return ForceOverride.findOneAndUpdate(
      { orgId: new Types.ObjectId(data.orgId) },
      {
        $set: {
          playlistId: new Types.ObjectId(data.playlistId),
          publishedBy: new Types.ObjectId(data.publishedBy),
          expiresAt: data.expiresAt ?? null,
          isActive: true,
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true, runValidators: true },
    ).lean<IForceOverride>() as Promise<IForceOverride>;
  }

  static async clearOverride(orgId: string): Promise<boolean> {
    await connectDB();
    const result = await ForceOverride.updateOne(
      { orgId: new Types.ObjectId(orgId) },
      { $set: { isActive: false } },
    );
    return result.modifiedCount === 1;
  }
}

export async function getAffectedScreenIds(
  orgId: string,
  schedule: Pick<ISchedule, "scope" | "scopeId">,
): Promise<string[]> {
  await connectDB();

  const scopeError = await ScheduleService.validateScopeTarget(orgId, schedule.scope, schedule.scopeId.toString());
  if (scopeError) {
    return [];
  }

  if (schedule.scope === "screen") {
    return [schedule.scopeId.toString()];
  }

  const orgObjectId = new Types.ObjectId(orgId);

  if (schedule.scope === "group") {
    const screens = await ScreenModel.find({
      orgId: orgObjectId,
      groupId: schedule.scopeId,
    })
      .select({ _id: 1 })
      .lean<Array<{ _id: Types.ObjectId }>>();

    return screens.map((screen) => screen._id.toString());
  }

  const screens = await ScreenModel.find({ orgId: orgObjectId })
    .select({ _id: 1 })
    .lean<Array<{ _id: Types.ObjectId }>>();

  return screens.map((screen) => screen._id.toString());
}

export async function getAffectedScreenIdsByScope(
  orgId: string,
  scope: ISchedule["scope"],
  scopeId: string,
): Promise<string[]> {
  await connectDB();

  const scopeError = await ScheduleService.validateScopeTarget(orgId, scope, scopeId);
  if (scopeError) {
    return [];
  }

  if (scope === "screen") {
    return [scopeId];
  }

  const orgObjectId = new Types.ObjectId(orgId);

  if (scope === "group") {
    const groupObjectId = new Types.ObjectId(scopeId);
    const screens = await ScreenModel.find({
      orgId: orgObjectId,
      groupId: groupObjectId,
    })
      .select({ _id: 1 })
      .lean<Array<{ _id: Types.ObjectId }>>();

    return screens.map((screen) => screen._id.toString());
  }

  const screens = await ScreenModel.find({ orgId: orgObjectId })
    .select({ _id: 1 })
    .lean<Array<{ _id: Types.ObjectId }>>();

  return screens.map((screen) => screen._id.toString());
}
