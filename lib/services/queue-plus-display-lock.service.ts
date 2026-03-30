import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { WebAppQueuePlusDisplayLockModel } from "@/lib/db/models/webapp-queue-plus/WebAppQueuePlusDisplayLock";

export class QueuePlusDisplayLockError extends Error {
    constructor(
        public readonly code: "DISPLAY_LOCK_REQUIRED" | "DISPLAY_LOCK_NOT_OWNED" | "DISPLAY_LOCK_EXPIRED" | "DISPLAY_NOT_ALLOWED",
        message: string,
        public readonly httpStatus: number,
    ) {
        super(message);
    }
}

function normalizeDisplayId(displayId: string): string {
    return displayId.trim().toLowerCase();
}

export async function acquireQueuePlusDisplayLock(input: {
    orgId: string;
    datasetId: string;
    displayId: string;
    ownerInstanceId: string;
    leaseSeconds?: number;
}) {
    await connectDB();

    const leaseSeconds = Math.min(Math.max(input.leaseSeconds ?? 30, 10), 120);
    const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000);
    const normalizedDisplayId = normalizeDisplayId(input.displayId);

    const orgObjectId = new Types.ObjectId(input.orgId);
    const datasetObjectId = new Types.ObjectId(input.datasetId);
    const ownerObjectId = new Types.ObjectId(input.ownerInstanceId);

    const existing = await WebAppQueuePlusDisplayLockModel.findOne({
        orgId: orgObjectId,
        datasetId: datasetObjectId,
        displayId: normalizedDisplayId,
    }).lean();

    if (!existing || existing.leaseExpiresAt.getTime() <= Date.now()) {
        await WebAppQueuePlusDisplayLockModel.updateOne(
            { orgId: orgObjectId, datasetId: datasetObjectId, displayId: normalizedDisplayId },
            {
                $set: {
                    ownerInstanceId: ownerObjectId,
                    leaseExpiresAt,
                    lastRenewedAt: new Date(),
                },
                $setOnInsert: { acquiredAt: new Date() },
            },
            { upsert: true },
        );

        return {
            displayId: normalizedDisplayId,
            ownerInstanceId: input.ownerInstanceId,
            leaseExpiresAt: leaseExpiresAt.toISOString(),
            status: "acquired" as const,
        };
    }

    if (String(existing.ownerInstanceId) !== input.ownerInstanceId) {
        throw new QueuePlusDisplayLockError(
            "DISPLAY_LOCK_NOT_OWNED",
            "Display lock is owned by another remote",
            423,
        );
    }

    await WebAppQueuePlusDisplayLockModel.updateOne(
        { _id: existing._id },
        {
            $set: {
                leaseExpiresAt,
                lastRenewedAt: new Date(),
            },
        },
    );

    return {
        displayId: normalizedDisplayId,
        ownerInstanceId: input.ownerInstanceId,
        leaseExpiresAt: leaseExpiresAt.toISOString(),
        status: "renewed" as const,
    };
}

export async function renewQueuePlusDisplayLock(input: {
    orgId: string;
    datasetId: string;
    displayId: string;
    ownerInstanceId: string;
    leaseSeconds?: number;
}) {
    return acquireQueuePlusDisplayLock(input);
}

export async function releaseQueuePlusDisplayLock(input: {
    orgId: string;
    datasetId: string;
    displayId: string;
    ownerInstanceId: string;
}) {
    await connectDB();

    const normalizedDisplayId = normalizeDisplayId(input.displayId);

    await WebAppQueuePlusDisplayLockModel.deleteOne({
        orgId: new Types.ObjectId(input.orgId),
        datasetId: new Types.ObjectId(input.datasetId),
        displayId: normalizedDisplayId,
        ownerInstanceId: new Types.ObjectId(input.ownerInstanceId),
    });

    return { status: "released" as const, displayId: normalizedDisplayId };
}

export async function getQueuePlusDisplayLockStatus(input: {
    orgId: string;
    datasetId: string;
    displayId: string;
    ownerInstanceId?: string;
}) {
    await connectDB();

    const normalizedDisplayId = normalizeDisplayId(input.displayId);
    const lock = await WebAppQueuePlusDisplayLockModel.findOne({
        orgId: new Types.ObjectId(input.orgId),
        datasetId: new Types.ObjectId(input.datasetId),
        displayId: normalizedDisplayId,
    }).lean();

    if (!lock || lock.leaseExpiresAt.getTime() <= Date.now()) {
        if (lock) {
            await WebAppQueuePlusDisplayLockModel.deleteOne({ _id: lock._id });
        }

        return {
            locked: false,
            isOwnedByMe: false,
            displayId: normalizedDisplayId,
            leaseExpiresAt: null,
            ownerInstanceId: null,
        };
    }

    return {
        locked: true,
        isOwnedByMe: input.ownerInstanceId ? String(lock.ownerInstanceId) === input.ownerInstanceId : false,
        displayId: normalizedDisplayId,
        leaseExpiresAt: lock.leaseExpiresAt.toISOString(),
        ownerInstanceId: String(lock.ownerInstanceId),
    };
}

export async function assertQueuePlusDisplayLockOwner(input: {
    orgId: string;
    datasetId: string;
    displayId: string;
    ownerInstanceId: string;
}) {
    const status = await getQueuePlusDisplayLockStatus(input);

    if (!status.locked) {
        throw new QueuePlusDisplayLockError(
            "DISPLAY_LOCK_REQUIRED",
            "Display lock required. Acquire lock first.",
            423,
        );
    }

    if (!status.isOwnedByMe) {
        throw new QueuePlusDisplayLockError(
            "DISPLAY_LOCK_NOT_OWNED",
            "Display is locked by another remote.",
            423,
        );
    }

    return status;
}
