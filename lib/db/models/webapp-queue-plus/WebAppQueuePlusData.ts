import mongoose, { Schema, Types } from "mongoose";

export interface QueuePlusEntry {
    seq: number;
    displayNumber: string;
    issuedAt: Date;
}

export interface QueuePlusHistoryEntry {
    displayNumber: string;
    calledAt: Date;
    seq?: number | null;
    issuedAt?: Date | null;
    source?: "queue" | "manual" | "round-robin" | null;
}

export interface IWebAppQueuePlusData {
    _id: Types.ObjectId;
    orgId: Types.ObjectId;
    datasetId: Types.ObjectId;
    queueName: string;
    queueType: "numeric" | "alpha";
    prefix?: string;
    currentServing: string | null;
    currentServingSeq?: number | null;
    currentServingIssuedAt?: Date | null;
    currentSource?: "queue" | "manual" | "round-robin" | null;
    nextSeq: number;
    waitingQueue: QueuePlusEntry[];
    history: QueuePlusHistoryEntry[];
    displayMessage?: string | null;
    displayAccentColor?: string | null;
    lastUpdatedAt: Date;
    lastUpdatedBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const QueuePlusEntrySchema = new Schema<QueuePlusEntry>(
    {
        seq: { type: Number, required: true },
        displayNumber: { type: String, required: true },
        issuedAt: { type: Date, default: () => new Date() },
    },
    { _id: false },
);

const QueuePlusHistorySchema = new Schema<QueuePlusHistoryEntry>(
    {
        displayNumber: { type: String, required: true },
        calledAt: { type: Date, required: true },
        seq: { type: Number, default: null },
        issuedAt: { type: Date, default: null },
        source: { type: String, enum: ["queue", "manual", "round-robin", null], default: null },
    },
    { _id: false },
);

const WebAppQueuePlusDataSchema = new Schema<IWebAppQueuePlusData>(
    {
        orgId: { type: Schema.Types.ObjectId, required: true, index: true },
        datasetId: { type: Schema.Types.ObjectId, required: true, index: true },
        queueName: { type: String, required: true, trim: true, lowercase: true },
        queueType: { type: String, enum: ["numeric", "alpha"], default: "numeric" },
        prefix: { type: String },
        currentServing: { type: String, default: null },
        currentServingSeq: { type: Number, default: null },
        currentServingIssuedAt: { type: Date, default: null },
        currentSource: { type: String, enum: ["queue", "manual", "round-robin", null], default: null },
        nextSeq: { type: Number, default: 1 },
        waitingQueue: { type: [QueuePlusEntrySchema], default: [] },
        history: { type: [QueuePlusHistorySchema], default: [] },
        displayMessage: { type: String, default: null },
        displayAccentColor: { type: String, default: null },
        lastUpdatedAt: { type: Date, default: () => new Date() },
        lastUpdatedBy: { type: String, default: "" },
    },
    { timestamps: true, collection: "webapp_queue_plus_data" },
);

WebAppQueuePlusDataSchema.index({ orgId: 1, datasetId: 1 }, { unique: true });
WebAppQueuePlusDataSchema.index({ orgId: 1, queueName: 1 });

export const WebAppQueuePlusDataModel =
    mongoose.models.WebAppQueuePlusData ??
    mongoose.model<IWebAppQueuePlusData>("WebAppQueuePlusData", WebAppQueuePlusDataSchema);
