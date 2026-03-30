import mongoose, { Schema, Types } from "mongoose";

export interface IWebAppQueuePlusDisplayLock {
    _id: Types.ObjectId;
    orgId: Types.ObjectId;
    datasetId: Types.ObjectId;
    displayId: string;
    ownerInstanceId: Types.ObjectId;
    leaseExpiresAt: Date;
    acquiredAt: Date;
    lastRenewedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const WebAppQueuePlusDisplayLockSchema = new Schema<IWebAppQueuePlusDisplayLock>(
    {
        orgId: { type: Schema.Types.ObjectId, required: true, index: true },
        datasetId: { type: Schema.Types.ObjectId, required: true, index: true },
        displayId: { type: String, required: true, trim: true, lowercase: true },
        ownerInstanceId: { type: Schema.Types.ObjectId, required: true, index: true },
        leaseExpiresAt: { type: Date, required: true, index: true },
        acquiredAt: { type: Date, required: true, default: () => new Date() },
        lastRenewedAt: { type: Date, required: true, default: () => new Date() },
    },
    { timestamps: true, collection: "webapp_queue_plus_display_locks" },
);

WebAppQueuePlusDisplayLockSchema.index({ orgId: 1, datasetId: 1, displayId: 1 }, { unique: true });
WebAppQueuePlusDisplayLockSchema.index({ leaseExpiresAt: 1 }, { expireAfterSeconds: 300 });

export const WebAppQueuePlusDisplayLockModel =
    mongoose.models.WebAppQueuePlusDisplayLock ??
    mongoose.model<IWebAppQueuePlusDisplayLock>("WebAppQueuePlusDisplayLock", WebAppQueuePlusDisplayLockSchema);
