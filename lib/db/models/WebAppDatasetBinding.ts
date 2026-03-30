import mongoose, { Schema, Types } from "mongoose";

import type { WebAppId } from "./WebAppInstance";

export type WebAppDatasetBindingRole = "primary" | "secondary" | "fallback" | "overlay";

export interface IWebAppDatasetBinding {
    _id: Types.ObjectId;
    orgId: Types.ObjectId;
    appId: WebAppId;
    instanceId: Types.ObjectId;
    datasetId: Types.ObjectId;
    role: WebAppDatasetBindingRole;
    order: number;
    required: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const WebAppDatasetBindingSchema = new Schema<IWebAppDatasetBinding>(
    {
        orgId: { type: Schema.Types.ObjectId, required: true, index: true },
        appId: {
            type: String,
            enum: ["google-calendar", "queue", "queue-plus", "wordpress-link"],
            required: true,
            index: true,
        },
        instanceId: { type: Schema.Types.ObjectId, required: true, index: true },
        datasetId: { type: Schema.Types.ObjectId, required: true, index: true },
        role: {
            type: String,
            enum: ["primary", "secondary", "fallback", "overlay"],
            default: "primary",
        },
        order: { type: Number, default: 0 },
        required: { type: Boolean, default: true },
    },
    { timestamps: true, collection: "webapp_dataset_bindings" },
);

WebAppDatasetBindingSchema.index(
    { orgId: 1, appId: 1, instanceId: 1, datasetId: 1, role: 1 },
    { unique: true },
);

export const WebAppDatasetBindingModel =
    mongoose.models.WebAppDatasetBinding ??
    mongoose.model<IWebAppDatasetBinding>("WebAppDatasetBinding", WebAppDatasetBindingSchema);
