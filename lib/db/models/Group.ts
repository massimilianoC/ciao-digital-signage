import { model, models, Model, Schema, Types } from "mongoose";

export interface IGroup {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
  name: string;
  description?: string;
  defaultPlaylistId?: Types.ObjectId;
  screenIds?: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const groupSchema = new Schema<IGroup>(
  {
    orgId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    defaultPlaylistId: { type: Schema.Types.ObjectId },
    screenIds: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true },
);

groupSchema.index({ orgId: 1, _id: 1 });

const existingGroupModel = models.Group as Model<IGroup> | undefined;

export const GroupModel = existingGroupModel ?? model<IGroup>("Group", groupSchema);
