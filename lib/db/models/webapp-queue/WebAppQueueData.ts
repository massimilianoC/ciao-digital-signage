import mongoose, { Schema, Types } from "mongoose";

export interface QueueEntry {
    seq: number;
    displayNumber: string;
    issuedAt: Date;
}

export interface QueueHistoryEntry {
    displayNumber: string;
    calledAt: Date;
    seq?: number | null;
    issuedAt?: Date | null;
    source?: "queue" | "manual" | "round-robin" | null;
}

export interface IWebAppQueueData {
    _id: Types.ObjectId;
    /** Org owning this queue */
    orgId: Types.ObjectId;
    /** Dataset identity for shared queue state */
    datasetId: Types.ObjectId;
    /** Human-friendly logical name (display and channels) */
    queueName: string;
    queueType: "numeric" | "alpha";
    /** Prefix for alpha mode: "A" → "A001" */
    prefix?: string;
    /** Currently serving display number (null when idle) */
    currentServing: string | null;
    currentServingSeq?: number | null;
    currentServingIssuedAt?: Date | null;
    currentSource?: "queue" | "manual" | "round-robin" | null;
    /** Internal monotonic counter for next number to issue */
    nextSeq: number;
    /** Numbers waiting to be called, in FIFO order */
    waitingQueue: QueueEntry[];
    /** Last N served numbers (most-recent last) */
    history: QueueHistoryEntry[];
    /** Optional operator message shown on the public display */
    displayMessage?: string | null;
    /** Optional live accent override for the public display */
    displayAccentColor?: string | null;
    lastUpdatedAt: Date;
    /** InstanceId that last modified the queue */
    lastUpdatedBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const QueueEntrySchema = new Schema<QueueEntry>(
    {
        seq: { type: Number, required: true },
        displayNumber: { type: String, required: true },
        issuedAt: { type: Date, default: () => new Date() },
    },
    { _id: false },
);

const QueueHistorySchema = new Schema<QueueHistoryEntry>(
    {
        displayNumber: { type: String, required: true },
        calledAt: { type: Date, required: true },
        seq: { type: Number, default: null },
        issuedAt: { type: Date, default: null },
        source: { type: String, enum: ["queue", "manual", "round-robin", null], default: null },
    },
    { _id: false },
);

const WebAppQueueDataSchema = new Schema<IWebAppQueueData>(
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
        waitingQueue: { type: [QueueEntrySchema], default: [] },
        history: { type: [QueueHistorySchema], default: [] },
        displayMessage: { type: String, default: null },
        displayAccentColor: { type: String, default: null },
        lastUpdatedAt: { type: Date, default: () => new Date() },
        lastUpdatedBy: { type: String, default: "" },
    },
    { timestamps: true, collection: "webapp_queue_data" },
);

// One queue runtime state per dataset inside org
WebAppQueueDataSchema.index({ orgId: 1, datasetId: 1 }, { unique: true });
WebAppQueueDataSchema.index({ orgId: 1, queueName: 1 });

export const WebAppQueueDataModel =
    mongoose.models.WebAppQueueData ??
    mongoose.model<IWebAppQueueData>("WebAppQueueData", WebAppQueueDataSchema);
