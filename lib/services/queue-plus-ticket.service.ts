import { randomUUID } from "node:crypto";

import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { WebAppQueuePlusTicketModel } from "@/lib/db/models/webapp-queue-plus/WebAppQueuePlusTicket";
import { getQueuePlusDataByDatasetId } from "@/lib/services/queue-plus.service";

const QR_TTL_MS = 60 * 1000;

function buildTicketCode(): string {
    return `qpt_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export async function issueQueuePlusDigitalTicket(input: {
    orgId: string;
    instanceId: string;
    datasetId: string;
    queueName: string;
    displayNumber: string;
    kioskInstanceId?: string;
}): Promise<{ ticketCode: string; trackingUrl: string }> {
    await connectDB();

    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 72 * 60 * 60 * 1000);
    const qrExpiresAt = new Date(issuedAt.getTime() + QR_TTL_MS);

    const created = await WebAppQueuePlusTicketModel.create({
        orgId: new Types.ObjectId(input.orgId),
        instanceId: new Types.ObjectId(input.instanceId),
        datasetId: new Types.ObjectId(input.datasetId),
        queueName: input.queueName,
        displayNumber: input.displayNumber,
        ticketCode: buildTicketCode(),
        issuedAt,
        qrExpiresAt,
        ticketFirstAccessedAt: null,
        servedAt: null,
        expiresAt,
        status: "waiting",
        kioskInstanceId: input.kioskInstanceId && Types.ObjectId.isValid(input.kioskInstanceId)
            ? new Types.ObjectId(input.kioskInstanceId)
            : null,
    });

    const ticketCode = String(created.ticketCode);
    return {
        ticketCode,
        trackingUrl: `/webapps/queue-plus/ticket/${ticketCode}`,
    };
}

export async function getQueuePlusDigitalTicketState(ticketCode: string) {
    await connectDB();

    const ticket = await WebAppQueuePlusTicketModel.findOne({ ticketCode }).lean();
    if (!ticket) return null;

    const ticketFirstAccessedAt = ticket.ticketFirstAccessedAt ?? new Date();
    if (!ticket.ticketFirstAccessedAt) {
        await WebAppQueuePlusTicketModel.updateOne(
            { _id: ticket._id, ticketFirstAccessedAt: null },
            { $set: { ticketFirstAccessedAt } },
        );
    }

    if (ticket.expiresAt.getTime() <= Date.now()) {
        if (ticket.status !== "expired") {
            await WebAppQueuePlusTicketModel.updateOne(
                { _id: ticket._id },
                { $set: { status: "expired" } },
            );
        }

        return {
            ticketCode,
            queueName: ticket.queueName,
            displayNumber: ticket.displayNumber,
            status: "expired" as const,
            issuedAt: ticket.issuedAt.toISOString(),
            servedAt: ticket.servedAt?.toISOString() ?? null,
            ticketFirstAccessedAt: ticketFirstAccessedAt.toISOString(),
            qrAvailable: false,
            position: null,
            currentlyServing: null,
            trackingUrl: `/webapps/queue-plus/ticket/${ticketCode}`,
        };
    }

    const queue = await getQueuePlusDataByDatasetId(String(ticket.orgId), String(ticket.datasetId));
    const waitingQueue = queue?.waitingQueue ?? [];
    const waitingIndex = waitingQueue.findIndex((entry) => entry.displayNumber === ticket.displayNumber);
    const inHistory = (queue?.history ?? []).some((entry) => entry.displayNumber === ticket.displayNumber);

    let status: "waiting" | "serving" | "served" = "waiting";
    if (queue?.currentServing === ticket.displayNumber) {
        status = "serving";
    } else if (inHistory || waitingIndex === -1) {
        status = "served";
    }

    if (status === "served" && ticket.status !== "served") {
        await WebAppQueuePlusTicketModel.updateOne(
            { _id: ticket._id },
            { $set: { status: "served", servedAt: new Date() } },
        );
    }

    return {
        ticketCode,
        queueName: ticket.queueName,
        displayNumber: ticket.displayNumber,
        status,
        issuedAt: ticket.issuedAt.toISOString(),
        ticketFirstAccessedAt: ticketFirstAccessedAt.toISOString(),
        qrAvailable: false,
        servedAt: status === "served"
            ? (ticket.servedAt?.toISOString() ?? new Date().toISOString())
            : null,
        position: status === "waiting" && waitingIndex >= 0 ? waitingIndex + 1 : null,
        currentlyServing: queue?.currentServing ?? null,
        waitingCount: queue?.waitingQueue.length ?? 0,
        trackingUrl: `/webapps/queue-plus/ticket/${ticketCode}`,
    };
}

export async function getQueuePlusTicketQrStatus(ticketCode: string) {
    await connectDB();

    const ticket = await WebAppQueuePlusTicketModel.findOne({ ticketCode }).lean();
    if (!ticket) return null;

    const expiredByTime = ticket.qrExpiresAt.getTime() <= Date.now();
    const opened = ticket.ticketFirstAccessedAt !== null;

    return {
        ticketCode,
        qrAvailable: !expiredByTime && !opened,
        qrExpiresAt: ticket.qrExpiresAt.toISOString(),
        ticketFirstAccessedAt: ticket.ticketFirstAccessedAt?.toISOString() ?? null,
    };
}
