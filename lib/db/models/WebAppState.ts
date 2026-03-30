import mongoose, { Schema, Types } from "mongoose";

export interface IWebAppState {
    _id: Types.ObjectId;
    orgId: Types.ObjectId;
    instanceId: Types.ObjectId;
    health: "healthy" | "degraded" | "error" | "unknown";
    lastSyncAt?: Date | null;
    lastSuccessAt?: Date | null;
    lastError?: {
        code: string;
        message: string;
        at: Date;
    } | null;
    payloadHash?: string | null;
    watchdogStatus?: string | null;
    metrics?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

const WebAppStateSchema = new Schema<IWebAppState>(
    {
        orgId: { type: Schema.Types.ObjectId, required: true, index: true },
        instanceId: { type: Schema.Types.ObjectId, required: true, index: true },
        health: {
            type: String,
            enum: ["healthy", "degraded", "error", "unknown"],
            default: "unknown",
            index: true,
        },
        lastSyncAt: { type: Date, default: null },
        lastSuccessAt: { type: Date, default: null },
        lastError: {
            type: {
                code: { type: String },
                message: { type: String },
                at: { type: Date },
            },
            default: null,
        },
        payloadHash: { type: String, default: null },
        watchdogStatus: { type: String, default: null },
        metrics: { type: Schema.Types.Mixed },
    },
    { timestamps: true, collection: "webapp_state" },
);

WebAppStateSchema.index({ orgId: 1, instanceId: 1 }, { unique: true });

export const WebAppStateModel =
    mongoose.models.WebAppState ??
    mongoose.model<IWebAppState>("WebAppState", WebAppStateSchema);