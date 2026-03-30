import mongoose, { Schema, Types } from "mongoose";

export type GoogleCalendarSourceType = "ics-url" | "ics-upload" | "google-private";

export interface IWebAppCalendarSource {
    _id: Types.ObjectId;
    orgId: Types.ObjectId;
    name: string;
    type: GoogleCalendarSourceType;
    status: "active" | "disabled";
    visibility: "org";
    timezone: string;
    refreshSeconds: number;
    icsUrl?: string;
    assetContentId?: Types.ObjectId;
    oauthRefId?: string;
    tags?: string[];
    lastSyncAt?: Date;
    lastValidatedAt?: Date;
    lastError?: string;
    checksum?: string;
    createdBy: string;
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const WebAppCalendarSourceSchema = new Schema<IWebAppCalendarSource>(
    {
        orgId: { type: Schema.Types.ObjectId, required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 200 },
        type: {
            type: String,
            enum: ["ics-url", "ics-upload", "google-private"],
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["active", "disabled"],
            default: "active",
            index: true,
        },
        visibility: {
            type: String,
            enum: ["org"],
            default: "org",
            required: true,
        },
        timezone: { type: String, default: "UTC", required: true },
        refreshSeconds: { type: Number, default: 300, min: 60, max: 3600 },
        icsUrl: { type: String },
        assetContentId: { type: Schema.Types.ObjectId, ref: "Content" },
        oauthRefId: { type: String },
        tags: { type: [String], default: [] },
        lastSyncAt: { type: Date },
        lastValidatedAt: { type: Date },
        lastError: { type: String },
        checksum: { type: String },
        createdBy: { type: String, required: true },
        updatedBy: { type: String, required: true },
    },
    { timestamps: true, collection: "webapp_calendar_sources" },
);

WebAppCalendarSourceSchema.index({ orgId: 1, name: 1 });
WebAppCalendarSourceSchema.index({ orgId: 1, status: 1 });

export const WebAppCalendarSourceModel =
    mongoose.models.WebAppCalendarSource ??
    mongoose.model<IWebAppCalendarSource>("WebAppCalendarSource", WebAppCalendarSourceSchema);
