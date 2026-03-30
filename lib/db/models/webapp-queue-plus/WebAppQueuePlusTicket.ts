import mongoose, { Schema, Types } from "mongoose";

export type QueuePlusTicketStatus = "waiting" | "serving" | "served" | "expired";

export interface IWebAppQueuePlusTicket {
    _id: Types.ObjectId;
    orgId: Types.ObjectId;
    instanceId: Types.ObjectId;
    datasetId: Types.ObjectId;
    queueName: string;
    displayNumber: string;
    ticketCode: string;
    issuedAt: Date;
    qrExpiresAt: Date;
    ticketFirstAccessedAt: Date | null;
    servedAt: Date | null;
    expiresAt: Date;
    status: QueuePlusTicketStatus;
    kioskInstanceId?: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

const WebAppQueuePlusTicketSchema = new Schema<IWebAppQueuePlusTicket>(
    {
        orgId: { type: Schema.Types.ObjectId, required: true, index: true },
        instanceId: { type: Schema.Types.ObjectId, required: true, index: true },
        datasetId: { type: Schema.Types.ObjectId, required: true, index: true },
        queueName: { type: String, required: true, trim: true, lowercase: true },
        displayNumber: { type: String, required: true, trim: true },
        ticketCode: { type: String, required: true, trim: true, unique: true, index: true },
        issuedAt: { type: Date, required: true, default: () => new Date() },
        qrExpiresAt: { type: Date, required: true, index: true },
        ticketFirstAccessedAt: { type: Date, default: null },
        servedAt: { type: Date, default: null },
        expiresAt: { type: Date, required: true },
        status: { type: String, enum: ["waiting", "serving", "served", "expired"], default: "waiting" },
        kioskInstanceId: { type: Schema.Types.ObjectId, default: null },
    },
    { timestamps: true, collection: "webapp_queue_plus_tickets" },
);

WebAppQueuePlusTicketSchema.index({ orgId: 1, datasetId: 1, issuedAt: -1 });
WebAppQueuePlusTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const WebAppQueuePlusTicketModel =
    mongoose.models.WebAppQueuePlusTicket ??
    mongoose.model<IWebAppQueuePlusTicket>("WebAppQueuePlusTicket", WebAppQueuePlusTicketSchema);
