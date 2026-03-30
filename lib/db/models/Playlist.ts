import mongoose, { Schema, Types } from "mongoose";

export interface IPlaylistItem {
  contentId: Types.ObjectId;
  title?: string;
  thumbnailUrl?: string;
  fitMode?: "cover" | "fit";
  backgroundColor?: string | null;
  durationMs?: number | null;
  order: number;
}

export interface IPlaylist {
  _id: Types.ObjectId;
  orgId: Types.ObjectId;
  name: string;
  status: "active" | "suspended";
  items: IPlaylistItem[];
  loop: boolean;
  stopOnLastItem: boolean;
  fitModeOverride?: "cover" | "fit" | null;
  backgroundColorOverride?: string | null;
  transitionType?: "cut" | "fade";
  transitionMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

const PlaylistItemSchema = new Schema<IPlaylistItem>(
  {
    contentId: { type: Schema.Types.ObjectId, required: true, ref: "Content" },
    title: { type: String },
    thumbnailUrl: { type: String },
    fitMode: { type: String, enum: ["cover", "fit"] },
    backgroundColor: { type: String, default: null },
    durationMs: { type: Number },
    order: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const PlaylistSchema = new Schema<IPlaylist>(
  {
    orgId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    items: { type: [PlaylistItemSchema], default: [] },
    loop: { type: Boolean, default: true },
    stopOnLastItem: { type: Boolean, default: false },
    fitModeOverride: { type: String, enum: ["cover", "fit"], default: null },
    backgroundColorOverride: { type: String, default: null },
    transitionType: { type: String, enum: ["cut", "fade"], default: "fade" },
    transitionMs: { type: Number, default: 500 },
  },
  { timestamps: true },
);

PlaylistSchema.index({ orgId: 1, _id: 1 });

export const PlaylistModel =
  mongoose.models.Playlist ??
  mongoose.model<IPlaylist>("Playlist", PlaylistSchema);
