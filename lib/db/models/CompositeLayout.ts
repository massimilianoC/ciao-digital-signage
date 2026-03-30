import mongoose, { Schema, Types } from "mongoose";

export type ZoneContentType = "playlist" | "content" | "layout";

export interface ZoneContent {
  type: ZoneContentType;
  refId: Types.ObjectId;
  label: string;
}

export interface LayoutZone {
  id: string;
  /** X position as percentage 0–100 */
  x: number;
  /** Y position as percentage 0–100 */
  y: number;
  /** Width as percentage 0–100 */
  width: number;
  /** Height as percentage 0–100 */
  height: number;
  label?: string;
  content?: ZoneContent;
  /** Optional fallback/reference background image URL for this zone (shown in editor and as player fallback before content loads) */
  backgroundImage?: string;
  /** Internal content padding in px */
  padding?: number;
  /** Zone corner radius in px */
  borderRadius?: number;
  /** Zone border color */
  borderColor?: string;
  /** Zone border size in px */
  borderSize?: number;
  /** Enable subtle drop shadow */
  dropShadow?: boolean;
}

export interface ICompositeLayout {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
  name: string;
  status: "active" | "suspended";
  resolution: { width: number; height: number };
  zones: LayoutZone[];
  /** Optional background image URL for the whole layout canvas (shown in editor as reference; player uses it as fallback) */
  backgroundImage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ZoneContentSchema = new Schema<ZoneContent>(
  {
    type: { type: String, enum: ["playlist", "content", "layout"], required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
    label: { type: String, required: true },
  },
  { _id: false },
);

const LayoutZoneSchema = new Schema<LayoutZone>(
  {
    id: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    label: { type: String },
    content: { type: ZoneContentSchema, default: undefined },
    backgroundImage: { type: String },
    padding: { type: Number, min: 0, default: 0 },
    borderRadius: { type: Number, min: 0, default: 0 },
    borderColor: { type: String, default: "rgba(255,255,255,0.5)" },
    borderSize: { type: Number, min: 0, default: 2 },
    dropShadow: { type: Boolean, default: false },
  },
  { _id: false },
);

const CompositeLayoutSchema = new Schema<ICompositeLayout>(
  {
    orgId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    resolution: {
      width: { type: Number, default: 1920 },
      height: { type: Number, default: 1080 },
    },
    zones: { type: [LayoutZoneSchema], default: [] },
    backgroundImage: { type: String },
  },
  { timestamps: true },
);

CompositeLayoutSchema.index({ orgId: 1, _id: 1 });
CompositeLayoutSchema.index({ orgId: 1, status: 1 });

export const CompositeLayoutModel =
  mongoose.models.CompositeLayout ??
  mongoose.model<ICompositeLayout>("CompositeLayout", CompositeLayoutSchema);
