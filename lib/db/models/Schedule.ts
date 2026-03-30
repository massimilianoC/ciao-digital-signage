import mongoose, { Schema, model, type Document, type Model } from "mongoose";

export interface IScheduleWindow {
  startHHMM: string;
  endHHMM: string;
  daysOfWeek: number[];
  rruleString?: string;
  timezone: string;
}

export interface ISchedule extends Document {
  orgId: mongoose.Types.ObjectId;
  scope: "org" | "group" | "screen";
  scopeId: mongoose.Types.ObjectId;
  priority: 1 | 2 | 3;
  /** Playlist to play during this schedule window. Mutually exclusive with layoutId. */
  playlistId?: mongoose.Types.ObjectId;
  /** Composite layout to display during this schedule window. Mutually exclusive with playlistId. */
  layoutId?: mongoose.Types.ObjectId;
  windows: IScheduleWindow[];
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const scheduleWindowSchema = new Schema<IScheduleWindow>(
  {
    startHHMM: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    endHHMM: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    daysOfWeek: { type: [Number], default: [] },
    rruleString: { type: String },
    timezone: { type: String, required: true },
  },
  { _id: false },
);

const scheduleSchema = new Schema<ISchedule>(
  {
    orgId: { type: Schema.Types.ObjectId, required: true, index: true },
    scope: { type: String, enum: ["org", "group", "screen"], required: true },
    scopeId: { type: Schema.Types.ObjectId, required: true },
    priority: { type: Number, enum: [1, 2, 3], required: true },
    playlistId: { type: Schema.Types.ObjectId, ref: "Playlist" },
    layoutId: { type: Schema.Types.ObjectId, ref: "CompositeLayout" },
    windows: { type: [scheduleWindowSchema], default: [] },
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

scheduleSchema.index({ orgId: 1, scope: 1, scopeId: 1 });
scheduleSchema.index({ orgId: 1, isActive: 1 });

export const Schedule: Model<ISchedule> =
  mongoose.models.Schedule ?? model<ISchedule>("Schedule", scheduleSchema);
