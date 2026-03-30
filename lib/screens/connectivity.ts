import type { IScreen } from "@/lib/db/models/Screen";

export type ScreenConnectivityState = "initialize" | "online" | "offline" | "disconnected";
export type ScreenConnectivitySubstate = "warning" | "error" | null;

export type ScreenConnectivityView = {
    state: ScreenConnectivityState;
    substate: ScreenConnectivitySubstate;
    reason: string;
    isHealthy: boolean;
    lastPollAgeMs: number | null;
    recentDisconnects60m: number;
    hasKnownError: boolean;
    thresholds: {
        warningAfterMs: number;
        disconnectedAfterMs: number;
        disconnectWindowMs: number;
        frequentDisconnectThreshold: number;
        errorLookbackMs: number;
    };
};

type ScreenLike = Pick<
    IScreen,
    | "status"
    | "operatingMode"
    | "lastSeenAt"
    | "disconnectEvents"
    | "lastErrorAt"
    | "lastErrorCode"
    | "lastErrorMessage"
>;

function parsePositiveInt(value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return parsed;
}

function toDate(value: Date | string | null | undefined): Date | null {
    if (!value) {
        return null;
    }

    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateList(values: Array<Date | string> | undefined): Date[] {
    if (!Array.isArray(values) || values.length === 0) {
        return [];
    }

    return values
        .map((value) => toDate(value))
        .filter((value): value is Date => value !== null);
}

export function deriveScreenConnectivity(
    screen: ScreenLike,
    now = new Date(),
): ScreenConnectivityView {
    const warningAfterMs = parsePositiveInt(process.env.SCREEN_WARNING_AFTER_MS, 30000);
    const disconnectedAfterMs = parsePositiveInt(process.env.SCREEN_DISCONNECTED_AFTER_MS, 60000);
    const disconnectWindowMs = parsePositiveInt(process.env.SCREEN_DISCONNECT_WINDOW_MS, 60 * 60 * 1000);
    const frequentDisconnectThreshold = parsePositiveInt(process.env.SCREEN_FREQUENT_DISCONNECT_THRESHOLD, 3);
    const errorLookbackMs = parsePositiveInt(process.env.SCREEN_ERROR_LOOKBACK_MS, 60 * 60 * 1000);

    if (screen.operatingMode === "offline") {
        return {
            state: "offline",
            substate: null,
            reason: "explicit_offline",
            isHealthy: true,
            lastPollAgeMs: null,
            recentDisconnects60m: 0,
            hasKnownError: false,
            thresholds: {
                warningAfterMs,
                disconnectedAfterMs,
                disconnectWindowMs,
                frequentDisconnectThreshold,
                errorLookbackMs,
            },
        };
    }

    const lastSeenAt = toDate(screen.lastSeenAt ?? null);
    if (!lastSeenAt || screen.status === "pending") {
        return {
            state: "initialize",
            substate: null,
            reason: "awaiting_first_poll",
            isHealthy: false,
            lastPollAgeMs: null,
            recentDisconnects60m: 0,
            hasKnownError: false,
            thresholds: {
                warningAfterMs,
                disconnectedAfterMs,
                disconnectWindowMs,
                frequentDisconnectThreshold,
                errorLookbackMs,
            },
        };
    }

    const ageMs = Math.max(0, now.getTime() - lastSeenAt.getTime());
    const disconnectCutoff = now.getTime() - disconnectWindowMs;
    const recentDisconnects = toDateList(screen.disconnectEvents)
        .filter((eventTime) => eventTime.getTime() >= disconnectCutoff)
        .length;

    const lastErrorAt = toDate(screen.lastErrorAt ?? null);
    const hasKnownError = Boolean(
        lastErrorAt && now.getTime() - lastErrorAt.getTime() <= errorLookbackMs,
    );

    if (ageMs > disconnectedAfterMs) {
        return {
            state: "disconnected",
            substate: hasKnownError ? "error" : "warning",
            reason: hasKnownError ? "known_error" : "poll_timeout_hard",
            isHealthy: false,
            lastPollAgeMs: ageMs,
            recentDisconnects60m: recentDisconnects,
            hasKnownError,
            thresholds: {
                warningAfterMs,
                disconnectedAfterMs,
                disconnectWindowMs,
                frequentDisconnectThreshold,
                errorLookbackMs,
            },
        };
    }

    if (ageMs > warningAfterMs) {
        return {
            state: "online",
            substate: hasKnownError ? "error" : "warning",
            reason: hasKnownError ? "known_error" : "poll_timeout_soft",
            isHealthy: false,
            lastPollAgeMs: ageMs,
            recentDisconnects60m: recentDisconnects,
            hasKnownError,
            thresholds: {
                warningAfterMs,
                disconnectedAfterMs,
                disconnectWindowMs,
                frequentDisconnectThreshold,
                errorLookbackMs,
            },
        };
    }

    const hasFrequentDisconnects = recentDisconnects >= frequentDisconnectThreshold;

    return {
        state: "online",
        substate: hasKnownError ? "error" : hasFrequentDisconnects ? "warning" : null,
        reason: hasKnownError
            ? "online_with_recent_error"
            : hasFrequentDisconnects
                ? "frequent_disconnects"
                : "polling_ok",
        isHealthy: !hasKnownError && !hasFrequentDisconnects,
        lastPollAgeMs: ageMs,
        recentDisconnects60m: recentDisconnects,
        hasKnownError,
        thresholds: {
            warningAfterMs,
            disconnectedAfterMs,
            disconnectWindowMs,
            frequentDisconnectThreshold,
            errorLookbackMs,
        },
    };
}

export function connectivityToLegacyStatus(
    connectivity: ScreenConnectivityView,
): "online" | "offline" | "pending" {
    if (connectivity.state === "initialize") {
        return "pending";
    }

    if (connectivity.state === "online") {
        return "online";
    }

    return "offline";
}
