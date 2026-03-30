export const WEBAPP_EVENT_NAME = "webapp:event";
export const WEBAPP_REQUEST_SNAPSHOT = "webapp:request-snapshot";

export interface WebappRealtimeEnvelope<TPayload = unknown> {
    eventId: string;
    eventType: string;
    orgId: string;
    appId: string;
    instanceId: string;
    channelKeys: string[];
    version: number;
    ts: string;
    source: string;
    payload: TPayload;
}

const CHANNEL_KEY_MAX_LENGTH = 120;

function toSafeSegment(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9:_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-+/g, "-");
}

export function normalizeRealtimeChannelKey(channelKey: string): string {
    const normalized = toSafeSegment(channelKey);

    if (!normalized) {
        throw new Error("INVALID_CHANNEL_KEY");
    }

    if (normalized.length > CHANNEL_KEY_MAX_LENGTH) {
        throw new Error("INVALID_CHANNEL_KEY");
    }

    return normalized;
}

export function normalizeRealtimeChannelKeys(channelKeys?: string[]): string[] {
    if (!Array.isArray(channelKeys)) return [];

    return Array.from(
        new Set(
            channelKeys
                .map((entry) => normalizeRealtimeChannelKey(entry))
                .filter(Boolean),
        ),
    );
}

export function buildScopedChannelKey(scope: string, id: string): string {
    return `${normalizeRealtimeChannelKey(scope)}:${normalizeRealtimeChannelKey(id)}`;
}

export function buildInstanceChannelKey(instanceId: string): string {
    return buildScopedChannelKey("instance", instanceId);
}

export function buildQueueChannelKey(queueName: string): string {
    return buildScopedChannelKey("queue", queueName);
}

export function buildWebappInstanceRoom(orgId: string, appId: string, instanceId: string): string {
    return `org:${orgId}:app:${appId}:instance:${instanceId}`;
}

export function buildWebappChannelRoom(orgId: string, appId: string, channelKey: string): string {
    return `org:${orgId}:app:${appId}:channel:${normalizeRealtimeChannelKey(channelKey)}`;
}
