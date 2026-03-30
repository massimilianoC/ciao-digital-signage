import mongoose, { Schema, Types } from "mongoose";

export type WebAppId = "google-calendar" | "queue" | "queue-plus" | "wordpress-link";

export interface IWebAppInstance {
    _id: Types.ObjectId;
    orgId: Types.ObjectId;
    appId: WebAppId;
    name: string;
    status: "active" | "suspended";
    version: string;
    configId: Types.ObjectId;
    stateId: Types.ObjectId;
    contentId?: Types.ObjectId | null;
    publicToken: string;
    createdBy: string;
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const WebAppInstanceSchema = new Schema<IWebAppInstance>(
    {
        orgId: { type: Schema.Types.ObjectId, required: true, index: true },
        appId: { type: String, enum: ["google-calendar", "queue", "queue-plus", "wordpress-link"], required: true, index: true },
        name: { type: String, required: true, trim: true },
        status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
        version: { type: String, default: "v0.1.0" },
        configId: { type: Schema.Types.ObjectId, required: true },
        stateId: { type: Schema.Types.ObjectId, required: true },
        contentId: { type: Schema.Types.ObjectId, default: null },
        publicToken: { type: String, required: true, index: true },
        createdBy: { type: String, required: true },
        updatedBy: { type: String, required: true },
    },
    { timestamps: true, collection: "webapp_instances" },
);

WebAppInstanceSchema.index({ orgId: 1, appId: 1, status: 1 });

export const WebAppInstanceModel =
    mongoose.models.WebAppInstance ??
    mongoose.model<IWebAppInstance>("WebAppInstance", WebAppInstanceSchema);