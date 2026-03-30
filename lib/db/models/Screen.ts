import { model, models, Model, Schema, Types } from "mongoose";

export interface IScreen {
  _id: Types.ObjectId;
  orgId?: Types.ObjectId;
  name: string;
  location?: string;
  timezone: string;
  status: "online" | "offline" | "pending";
  operatingMode?: "managed" | "offline";
  disconnectPolicy?: "keep_cache" | "show_default";
  lastSeenAt?: Date;
  currentItemId?: string | null;
  disconnectEvents?: Date[];
  lastErrorAt?: Date | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  groupId?: Types.ObjectId;
  defaultPlaylistId?: Types.ObjectId;
  screenToken: string;
  allowMultiSession?: boolean;
  activePlayerSessionId?: string | null;
  activePlayerSessionBoundAt?: Date | null;
  activePlayerSessionLastSeenAt?: Date | null;
  lastRevokedPlayerSessionId?: string | null;
  lastPlayerSessionResetAt?: Date | null;
  betterAuthScreenId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const screenSchema = new Schema<IScreen>(
  {
    orgId: { type: Schema.Types.ObjectId, index: true },
    name: { type: String, required: true, trim: true },
    location: { type: String },
    timezone: { type: String, default: "UTC" },
    status: {
      type: String,
      enum: ["online", "offline", "pending"],
      default: "pending",
    },
    operatingMode: {
      type: String,
      enum: ["managed", "offline"],
      default: "managed",
    },
    disconnectPolicy: {
      type: String,
      enum: ["keep_cache", "show_default"],
      default: "keep_cache",
    },
    lastSeenAt: { type: Date, default: null },
    currentItemId: { type: String, default: null },
    disconnectEvents: { type: [Date], default: [] },
    lastErrorAt: { type: Date, default: null },
    lastErrorCode: { type: String, default: null },
    lastErrorMessage: { type: String, default: null },
    groupId: { type: Schema.Types.ObjectId },
    defaultPlaylistId: { type: Schema.Types.ObjectId },
    screenToken: { type: String, required: true },
    allowMultiSession: { type: Boolean, default: false },
    activePlayerSessionId: { type: String, default: null },
    activePlayerSessionBoundAt: { type: Date, default: null },
    activePlayerSessionLastSeenAt: { type: Date, default: null },
    lastRevokedPlayerSessionId: { type: String, default: null },
    lastPlayerSessionResetAt: { type: Date, default: null },
    betterAuthScreenId: { type: String },
  },
  { timestamps: true },
);

screenSchema.index({ orgId: 1, _id: 1 });
screenSchema.index({ orgId: 1, status: 1 });

const existingScreenModel = models.Screen as Model<IScreen> | undefined;

export const ScreenModel = existingScreenModel ?? model<IScreen>("Screen", screenSchema);
