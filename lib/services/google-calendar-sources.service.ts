import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { Types } from "mongoose";

import { connectDB } from "@/lib/db/connection";
import { ContentModel } from "@/lib/db/models/Content";
import {
    WebAppCalendarSourceModel,
    type GoogleCalendarSourceType,
    type IWebAppCalendarSource,
} from "@/lib/db/models/webapp-google-calendar/WebAppCalendarSource";

export interface CreateGoogleCalendarSourceInput {
    orgId: string;
    userId: string;
    name: string;
    type: GoogleCalendarSourceType;
    timezone: string;
    refreshSeconds: number;
    icsUrl?: string;
    assetContentId?: string;
    tags?: string[];
}

export interface GoogleCalendarSourceValidationResult {
    valid: boolean;
    error?: string;
    checksum?: string;
    eventCount?: number;
}

export async function listGoogleCalendarSourcesForOrg(orgId: string): Promise<IWebAppCalendarSource[]> {
    await connectDB();
    return WebAppCalendarSourceModel.find({ orgId: new Types.ObjectId(orgId) })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean<IWebAppCalendarSource[]>();
}

export async function createGoogleCalendarSource(input: CreateGoogleCalendarSourceInput): Promise<IWebAppCalendarSource> {
    await connectDB();

    const orgObjectId = new Types.ObjectId(input.orgId);
    const source = await WebAppCalendarSourceModel.create({
        orgId: orgObjectId,
        name: input.name,
        type: input.type,
        status: "active",
        visibility: "org",
        timezone: input.timezone,
        refreshSeconds: input.refreshSeconds,
        icsUrl: input.icsUrl,
        assetContentId: input.assetContentId ? new Types.ObjectId(input.assetContentId) : undefined,
        tags: input.tags ?? [],
        createdBy: input.userId,
        updatedBy: input.userId,
    });

    return source.toObject() as IWebAppCalendarSource;
}

export async function getGoogleCalendarSourceForOrg(orgId: string, sourceId: string): Promise<IWebAppCalendarSource | null> {
    if (!Types.ObjectId.isValid(sourceId)) {
        return null;
    }

    await connectDB();
    return WebAppCalendarSourceModel.findOne({
        _id: new Types.ObjectId(sourceId),
        orgId: new Types.ObjectId(orgId),
    }).lean<IWebAppCalendarSource | null>();
}

export async function validateGoogleCalendarSourceForOrg(
    orgId: string,
    sourceId: string,
): Promise<GoogleCalendarSourceValidationResult> {
    const source = await getGoogleCalendarSourceForOrg(orgId, sourceId);
    if (!source) {
        return { valid: false, error: "SOURCE_NOT_FOUND" };
    }

    if (source.type === "google-private") {
        return { valid: false, error: "GOOGLE_PRIVATE_NOT_IMPLEMENTED" };
    }

    let rawPayload = "";
    if (source.type === "ics-url") {
        if (!source.icsUrl) {
            return { valid: false, error: "MISSING_ICS_URL" };
        }

        const response = await fetch(source.icsUrl, { cache: "no-store" });
        if (!response.ok) {
            return { valid: false, error: `ICS_URL_FETCH_FAILED:${response.status}` };
        }
        rawPayload = await response.text();
    }

    if (source.type === "ics-upload") {
        if (!source.assetContentId) {
            return { valid: false, error: "MISSING_ASSET_CONTENT_ID" };
        }

        const content = await ContentModel.findOne({
            _id: source.assetContentId,
            orgId: new Types.ObjectId(orgId),
        }).lean();

        if (!content) {
            return { valid: false, error: "ASSET_NOT_FOUND" };
        }

        const fileUrl = content.config?.fileUrl;
        if (!fileUrl) {
            return { valid: false, error: "ASSET_FILE_URL_NOT_FOUND" };
        }

        const localPath = path.join(process.cwd(), "public", fileUrl.replace(/^\/+/, ""));
        rawPayload = await fs.readFile(localPath, "utf-8");
    }

    if (!rawPayload.includes("BEGIN:VCALENDAR") || !rawPayload.includes("END:VCALENDAR")) {
        return { valid: false, error: "INVALID_ICS_FORMAT" };
    }

    const eventCount = (rawPayload.match(/BEGIN:VEVENT/g) ?? []).length;
    const checksum = createHash("sha1").update(rawPayload).digest("hex");

    await WebAppCalendarSourceModel.updateOne(
        { _id: source._id, orgId: source.orgId },
        {
            $set: {
                lastValidatedAt: new Date(),
                lastSyncAt: new Date(),
                lastError: null,
                checksum,
            },
        },
    );

    return { valid: true, checksum, eventCount };
}
