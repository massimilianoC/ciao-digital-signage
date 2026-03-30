import mongoose, { Schema, Types } from "mongoose";

export type ContentType = "image" | "video" | "url" | "widget";
export type UrlSubtype = "youtube" | "video" | "image" | "pdf" | "webpage";

export interface IContentItem {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
  name: string;
  alias?: string;
  status: "active" | "suspended";
  type: ContentType;
  folder: string;
  tags: string[];
  defaultDurationMs: number;
  thumbnailUrl?: string;
  internalWebappAsset?: boolean;
  createdAt: Date;
  updatedAt: Date;
  config: {
    fileUrl?: string;
    mimeType?: string;
    fileSizeBytes?: number;
    url?: string;
    urlSubtype?: UrlSubtype;
    html?: string;
    widgetType?: "weather" | "rss" | "datetime";
    params?: Record<string, unknown>;
  };
}

const ContentSchema = new Schema<IContentItem>(
  {
    orgId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    alias: { type: String, trim: true },
    status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
    type: {
      type: String,
      enum: ["image", "video", "url", "widget"],
      required: true,
    },
    folder: { type: String, default: "/" },
    tags: { type: [String], default: [] },
    defaultDurationMs: { type: Number, default: 10000 },
    thumbnailUrl: { type: String },
    internalWebappAsset: { type: Boolean, default: false, index: true },
    config: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

ContentSchema.index({ orgId: 1, type: 1 });
ContentSchema.index({ orgId: 1, folder: 1 });
ContentSchema.index({ orgId: 1, tags: 1 });

export const ContentModel =
  mongoose.models.Content ??
  mongoose.model<IContentItem>("Content", ContentSchema);
