import mongoose, { Schema, Types } from "mongoose";

import type { WebAppId } from "./WebAppInstance";

export type WebAppDatasetStatus = "active" | "disabled" | "draft";
export type WebAppDatasetStorageMode = "inline" | "asset-ref" | "app-collection" | "remote-mirror";

export interface IWebAppDataset {
    _id: Types.ObjectId;
    orgId: Types.ObjectId;
    appId: WebAppId;
    name: string;
    slug: string;
    status: WebAppDatasetStatus;
    schemaVersion: number;
    datasetKind: string;
    editorMode: "json-schema" | "custom-react" | "raw-json";
    storageMode: WebAppDatasetStorageMode;
    config: Record<string, unknown>;
    summary?: Record<string, unknown>;
    tags: string[];
    createdBy: string;
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const WebAppDatasetSchema = new Schema<IWebAppDataset>(
    {
        orgId: { type: Schema.Types.ObjectId, required: true, index: true },
        appId: {
            type: String,
            enum: ["google-calendar", "queue", "queue-plus", "wordpress-link"],
            required: true,
            index: true,
        },
        name: { type: String, required: true, trim: true, maxlength: 200 },
        slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
        status: {
            type: String,
            enum: ["active", "disabled", "draft"],
            default: "active",
            index: true,
        },
        schemaVersion: { type: Number, default: 1 },
        datasetKind: { type: String, required: true, trim: true },
        editorMode: {
            type: String,
            enum: ["json-schema", "custom-react", "raw-json"],
            default: "raw-json",
        },
        storageMode: {
            type: String,
            enum: ["inline", "asset-ref", "app-collection", "remote-mirror"],
            default: "inline",
        },
        config: { type: Schema.Types.Mixed, default: {} },
        summary: { type: Schema.Types.Mixed, default: {} },
        tags: { type: [String], default: [] },
        createdBy: { type: String, required: true },
        updatedBy: { type: String, required: true },
    },
    { timestamps: true, collection: "webapp_datasets" },
);

WebAppDatasetSchema.index({ orgId: 1, appId: 1, slug: 1 }, { unique: true });
WebAppDatasetSchema.index({ orgId: 1, appId: 1, updatedAt: -1 });

export const WebAppDatasetModel =
    mongoose.models.WebAppDataset ??
    mongoose.model<IWebAppDataset>("WebAppDataset", WebAppDatasetSchema);
