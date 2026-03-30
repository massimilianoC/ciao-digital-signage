import { model, models, Model, Schema, Types } from "mongoose";

export interface IOrgMeta {
  _id: Types.ObjectId;
  betterAuthOrgId: string;
  status: "active" | "suspended";
  quota: {
    maxScreens: number;
    maxStorageBytes: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const orgMetaSchema = new Schema<IOrgMeta>(
  {
    betterAuthOrgId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },
    quota: {
      maxScreens: { type: Number, default: 10 },
      maxStorageBytes: { type: Number, default: 1_073_741_824 },
    },
  },
  { timestamps: true },
);

orgMetaSchema.index({ betterAuthOrgId: 1 });

const existingOrgMetaModel = models.OrgMeta as Model<IOrgMeta> | undefined;

export const OrgMeta = existingOrgMetaModel ?? model<IOrgMeta>("OrgMeta", orgMetaSchema);
