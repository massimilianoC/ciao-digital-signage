import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { Types } from "mongoose";

import { ContentModel } from "@/lib/db/models/Content";
import { WebAppConfigModel, type GoogleCalendarMode, type GoogleCalendarSettings, type IWebAppConfig } from "@/lib/db/models/WebAppConfig";
import { WebAppInstanceModel, type IWebAppInstance } from "@/lib/db/models/WebAppInstance";
import { WebAppSecretRefModel, type IWebAppSecretRef } from "@/lib/db/models/WebAppSecretRef";
import { WebAppStateModel, type IWebAppState } from "@/lib/db/models/WebAppState";
import { ContentService } from "@/lib/services/content.service";
import { getGoogleCalendarSourceForOrg } from "@/lib/services/google-calendar-sources.service";

export interface GoogleCalendarEvent {
    id: string;
    title: string;
    start: string;
    end?: string;
    isAllDay: boolean;
    location?: string;
    description?: string;
}

export interface GoogleCalendarAggregate {
    instance: IWebAppInstance;
    config: IWebAppConfig;
    state: IWebAppState;
    secretRef: IWebAppSecretRef | null;
}

export interface CreateGoogleCalendarConnectorInput {
    orgId: string;
    userId: string;
    name: string;
    mode: GoogleCalendarMode;
    sourceId?: string;
    title?: string;
    calendarId?: string;
    publicIcsUrl?: string;
    apiKey?: string;
    timezone: string;
    refreshSeconds: number;
    maxItems: number;
    accentColor?: string;
    defaultDurationMs?: number;
}

export function parseIcsEvents(rawIcs: string, maxItems = 10, now = new Date()): GoogleCalendarEvent[] {
    const unfolded = rawIcs
        .replace(/\r\n/g, "\n")
        .split("\n")
        .reduce<string[]>((accumulator, line) => {
            if ((line.startsWith(" ") || line.startsWith("\t")) && accumulator.length > 0) {
                accumulator[accumulator.length - 1] += line.slice(1);
            } else {
                accumulator.push(line);
            }
            return accumulator;
        }, []);

    const events: GoogleCalendarEvent[] = [];
    let current: Record<string, string> | null = null;

    for (const line of unfolded) {
        if (line === "BEGIN:VEVENT") {
            current = {};
            continue;
        }
        if (line === "END:VEVENT") {
            if (current) {
                const start = parseIcsDate(current.DTSTART);
                const end = parseIcsDate(current.DTEND) ?? start;
                if (start) {
                    events.push({
                        id: current.UID ?? `${current.SUMMARY ?? "event"}-${start}`,
                        title: current.SUMMARY ?? "Untitled event",
                        start,
                        end: end ?? undefined,
                        isAllDay: isIcsAllDay(current.DTSTART),
                        location: current.LOCATION,
                        description: current.DESCRIPTION,
                    });
                }
            }
            current = null;
            continue;
        }
        if (!current) {
            continue;
        }

        const separatorIndex = line.indexOf(":");
        if (separatorIndex === -1) {
            continue;
        }
        const rawKey = line.slice(0, separatorIndex);
        const key = rawKey.split(";")[0] ?? rawKey;
        current[key] = line.slice(separatorIndex + 1).trim();
    }

    return events
        .filter((event) => {
            const end = event.end ? new Date(event.end) : new Date(event.start);
            return end.getTime() >= now.getTime() - 24 * 60 * 60 * 1000;
        })
        .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())
        .slice(0, maxItems);
}

export function normalizeGoogleApiEvent(event: Record<string, unknown>): GoogleCalendarEvent | null {
    const startValue = extractGoogleDateTime(event.start);
    if (!startValue) {
        return null;
    }

    const endValue = extractGoogleDateTime(event.end) ?? startValue;
    return {
        id: String(event.id ?? startValue),
        title: typeof event.summary === "string" && event.summary.trim() ? event.summary : "Untitled event",
        start: startValue,
        end: endValue,
        isAllDay: isGoogleAllDay(event.start),
        location: typeof event.location === "string" ? event.location : undefined,
        description: typeof event.description === "string" ? event.description : undefined,
    };
}

function parseIcsDate(value?: string): string | null {
    if (!value) {
        return null;
    }

    if (/^\d{8}$/.test(value)) {
        return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`;
    }

    if (/^\d{8}T\d{6}Z$/.test(value)) {
        return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}.000Z`;
    }

    return null;
}

function isIcsAllDay(value?: string): boolean {
    return typeof value === "string" && /^\d{8}$/.test(value);
}

function isGoogleAllDay(value: unknown): boolean {
    return Boolean(value && typeof value === "object" && "date" in value && !("dateTime" in value));
}

function extractGoogleDateTime(value: unknown): string | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    if ("dateTime" in value && typeof value.dateTime === "string") {
        return value.dateTime;
    }

    if ("date" in value && typeof value.date === "string") {
        return `${value.date}T00:00:00.000Z`;
    }

    return null;
}

export async function createGoogleCalendarConnector(
    input: CreateGoogleCalendarConnectorInput,
): Promise<GoogleCalendarAggregate> {
    let resolvedMode: GoogleCalendarMode = input.mode;
    let resolvedPublicIcsUrl = input.publicIcsUrl;
    let resolvedCalendarId = input.calendarId;
    let resolvedTimezone = input.timezone;
    let resolvedRefreshSeconds = input.refreshSeconds;

    if (input.sourceId) {
        const source = await getGoogleCalendarSourceForOrg(input.orgId, input.sourceId);
        if (!source || source.status !== "active") {
            throw new Error("SOURCE_NOT_AVAILABLE");
        }

        resolvedTimezone = source.timezone || input.timezone;
        resolvedRefreshSeconds = source.refreshSeconds || input.refreshSeconds;

        if (source.type === "ics-url") {
            if (!source.icsUrl) {
                throw new Error("SOURCE_MISSING_ICS_URL");
            }
            resolvedMode = "public-ics";
            resolvedPublicIcsUrl = source.icsUrl;
            resolvedCalendarId = undefined;
        } else if (source.type === "ics-upload") {
            resolvedMode = "public-ics";
            resolvedPublicIcsUrl = undefined;
            resolvedCalendarId = undefined;
        } else {
            throw new Error("SOURCE_TYPE_NOT_IMPLEMENTED");
        }
    }

    const orgObjectId = new Types.ObjectId(input.orgId);
    const config = await WebAppConfigModel.create({
        orgId: orgObjectId,
        appId: "google-calendar",
        schemaVersion: 1,
        settings: {
            mode: resolvedMode,
            title: input.title,
            catalogSourceId: input.sourceId,
            calendarId: resolvedCalendarId,
            publicIcsUrl: resolvedPublicIcsUrl,
            timezone: resolvedTimezone,
            refreshSeconds: resolvedRefreshSeconds,
            maxItems: input.maxItems,
            accentColor: input.accentColor,
        },
        dataAccessMode: resolvedMode,
    });

    const state = await WebAppStateModel.create({
        orgId: orgObjectId,
        instanceId: new Types.ObjectId(),
        health: "unknown",
    });

    const instance = await WebAppInstanceModel.create({
        orgId: orgObjectId,
        appId: "google-calendar",
        name: input.name,
        status: "active",
        version: "v0.1.0",
        configId: config._id,
        stateId: state._id,
        publicToken: randomUUID(),
        createdBy: input.userId,
        updatedBy: input.userId,
    });

    await WebAppStateModel.updateOne({ _id: state._id }, { $set: { instanceId: instance._id } });

    let secretRef: IWebAppSecretRef | null = null;
    if (resolvedMode === "api-key" && input.apiKey) {
        secretRef = await WebAppSecretRefModel.create({
            orgId: orgObjectId,
            instanceId: instance._id,
            provider: "google-calendar-api-key",
            secretKey: input.apiKey,
        });
    }

    const contentService = new ContentService(input.orgId);
    const content = await contentService.createContent({
        name: input.name,
        type: "url",
        folder: "/connectors/google-calendar",
        tags: ["webapp", "connector", "google-calendar"],
        internalWebappAsset: true,
        defaultDurationMs: input.defaultDurationMs ?? 60000,
        config: {
            url: `/webapps/google-calendar/${instance._id.toString()}?token=${encodeURIComponent(instance.publicToken)}`,
            urlSubtype: "webpage",
        },
    });

    await WebAppInstanceModel.updateOne({ _id: instance._id }, { $set: { contentId: content._id } });

    const updatedInstance = await WebAppInstanceModel.findById(instance._id).lean<IWebAppInstance | null>();
    const updatedState = await WebAppStateModel.findById(state._id).lean<IWebAppState | null>();
    if (!updatedInstance || !updatedState) {
        throw new Error("FAILED_TO_CREATE_WEBAPP_INSTANCE");
    }

    return {
        instance: updatedInstance,
        config: config.toObject() as IWebAppConfig,
        state: updatedState,
        secretRef: secretRef ? (secretRef as unknown as IWebAppSecretRef) : null,
    };
}

export async function getGoogleCalendarAggregateForOrg(
    orgId: string,
    instanceId: string,
): Promise<GoogleCalendarAggregate | null> {
    if (!Types.ObjectId.isValid(instanceId)) {
        return null;
    }

    const orgObjectId = new Types.ObjectId(orgId);
    const instance = await WebAppInstanceModel.findOne({ _id: new Types.ObjectId(instanceId), orgId: orgObjectId }).lean<IWebAppInstance | null>();
    if (!instance) {
        return null;
    }

    const [config, state, secretRef] = await Promise.all([
        WebAppConfigModel.findOne({ _id: instance.configId, orgId: orgObjectId }).lean<IWebAppConfig | null>(),
        WebAppStateModel.findOne({ _id: instance.stateId, orgId: orgObjectId }).lean<IWebAppState | null>(),
        WebAppSecretRefModel.findOne({ instanceId: instance._id, orgId: orgObjectId }).lean<IWebAppSecretRef | null>(),
    ]);

    if (!config || !state) {
        return null;
    }

    return { instance, config, state, secretRef };
}

export async function getGoogleCalendarAggregateForPublicAccess(
    instanceId: string,
    token: string,
): Promise<GoogleCalendarAggregate | null> {
    if (!Types.ObjectId.isValid(instanceId)) {
        return null;
    }

    const instance = await WebAppInstanceModel.findOne({
        _id: new Types.ObjectId(instanceId),
        publicToken: token,
        appId: "google-calendar",
        status: "active",
    }).lean<IWebAppInstance | null>();

    if (!instance) {
        return null;
    }

    const [config, state, secretRef] = await Promise.all([
        WebAppConfigModel.findById(instance.configId).lean<IWebAppConfig | null>(),
        WebAppStateModel.findById(instance.stateId).lean<IWebAppState | null>(),
        WebAppSecretRefModel.findOne({ instanceId: instance._id }).lean<IWebAppSecretRef | null>(),
    ]);

    if (!config || !state) {
        return null;
    }

    return { instance, config, state, secretRef };
}

export async function fetchGoogleCalendarEvents(aggregate: GoogleCalendarAggregate, now = new Date()): Promise<GoogleCalendarEvent[]> {
    const settings = aggregate.config.settings as GoogleCalendarSettings;

    if (settings.catalogSourceId) {
        const source = await getGoogleCalendarSourceForOrg(
            aggregate.instance.orgId.toString(),
            settings.catalogSourceId,
        );

        if (!source || source.status !== "active") {
            throw new Error("SOURCE_NOT_AVAILABLE");
        }

        if (source.type === "ics-url") {
            if (!source.icsUrl) {
                throw new Error("SOURCE_MISSING_ICS_URL");
            }

            const response = await fetch(source.icsUrl, { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`SOURCE_ICS_FETCH_FAILED:${response.status}`);
            }

            const raw = await response.text();
            return parseIcsEvents(raw, settings.maxItems, now);
        }

        if (source.type === "ics-upload") {
            if (!source.assetContentId) {
                throw new Error("SOURCE_MISSING_ASSET_CONTENT_ID");
            }

            const content = await ContentModel.findById(source.assetContentId).lean();
            if (!content?.config?.fileUrl) {
                throw new Error("SOURCE_ASSET_FILE_NOT_FOUND");
            }

            const localPath = path.join(process.cwd(), "public", content.config.fileUrl.replace(/^\/+/, ""));
            const raw = await fs.readFile(localPath, "utf-8");
            return parseIcsEvents(raw, settings.maxItems, now);
        }

        throw new Error("SOURCE_TYPE_NOT_IMPLEMENTED");
    }

    if (settings.mode === "public-ics") {
        if (!settings.publicIcsUrl) {
            throw new Error("MISSING_PUBLIC_ICS_URL");
        }

        const response = await fetch(settings.publicIcsUrl, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`PUBLIC_ICS_FETCH_FAILED:${response.status}`);
        }

        const raw = await response.text();
        return parseIcsEvents(raw, settings.maxItems, now);
    }

    if (!settings.calendarId) {
        throw new Error("MISSING_CALENDAR_ID");
    }
    if (!aggregate.secretRef?.secretKey) {
        throw new Error("MISSING_API_KEY");
    }

    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(settings.calendarId)}/events`);
    url.searchParams.set("key", aggregate.secretRef.secretKey);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", now.toISOString());
    url.searchParams.set("maxResults", String(settings.maxItems));

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`GOOGLE_API_FETCH_FAILED:${response.status}`);
    }

    const payload = (await response.json()) as { items?: Array<Record<string, unknown>> };
    return (payload.items ?? [])
        .map(normalizeGoogleApiEvent)
        .filter((event): event is GoogleCalendarEvent => Boolean(event));
}

export async function updateGoogleCalendarState(
    stateId: Types.ObjectId,
    payload: { health: IWebAppState["health"]; events?: GoogleCalendarEvent[]; error?: Error | string | null },
): Promise<void> {
    const update: Record<string, unknown> = {
        health: payload.health,
        lastSyncAt: new Date(),
    };

    if (payload.events) {
        update.lastSuccessAt = new Date();
        update.lastError = null;
        update.payloadHash = createHash("sha1").update(JSON.stringify(payload.events)).digest("hex");
        update.metrics = { eventCount: payload.events.length };
    }

    if (payload.error) {
        const message = payload.error instanceof Error ? payload.error.message : String(payload.error);
        update.lastError = {
            code: message.split(":")[0] ?? "UNKNOWN_ERROR",
            message,
            at: new Date(),
        };
    }

    await WebAppStateModel.updateOne({ _id: stateId }, { $set: update });
}