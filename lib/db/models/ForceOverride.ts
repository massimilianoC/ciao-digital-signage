import mongoose, { Schema, model, type Document, type Model } from "mongoose";

export interface IForceOverride extends Document {
  orgId: mongoose.Types.ObjectId;
  playlistId: mongoose.Types.ObjectId;
  publishedBy: mongoose.Types.ObjectId;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

const forceOverrideSchema = new Schema<IForceOverride>(
  {
    orgId: { type: Schema.Types.ObjectId, required: true, unique: true },
    playlistId: { type: Schema.Types.ObjectId, ref: "Playlist", required: true },
    publishedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

forceOverrideSchema.index({ orgId: 1, isActive: 1 });

export const ForceOverride: Model<IForceOverride> =
  mongoose.models.ForceOverride ?? model<IForceOverride>("ForceOverride", forceOverrideSchema);
