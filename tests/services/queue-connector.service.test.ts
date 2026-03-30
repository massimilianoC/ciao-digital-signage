import { describe, expect, it, vi } from "vitest";

// Stub the DB connection so importing the service doesn't require MONGODB_URI
vi.mock("@/lib/db/connection", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock("mongoose", async (importOriginal) => {
    const actual = await importOriginal<typeof import("mongoose")>();
    return actual;
});

// Import only the pure helper exported from the service (no DB deps)
import {
    buildDisplayNumber,
    getNextRoundRobinCounter,
    getNextRoundRobinTicketSeq,
    normalizeQueueNameList,
    parseDisplayNumber,
} from "@/lib/services/queue-connector.service";
import type { QueueSettings } from "@/lib/db/models/WebAppConfig";

// ─── Shared fixtures ─────────────────────────────────────────────────────────

function numericSettings(overrides?: Partial<QueueSettings>): QueueSettings {
    return {
        mode: "display",
        queueName: "main",
        queueType: "numeric",
        prefix: "",
        maxWaiting: 50,
        showWaitingCount: true,
        accentColor: "#2563EB",
        serviceMode: "reservation",
        bookingEnabled: true,
        roundRobinMaxNumber: 99,
        waitingListLimit: 8,
        ...overrides,
    };
}

function alphaSettings(overrides?: Partial<QueueSettings>): QueueSettings {
    return numericSettings({ queueType: "alpha", prefix: "A", ...overrides });
}

// ─── buildDisplayNumber ───────────────────────────────────────────────────────

describe("buildDisplayNumber", () => {
    it("numeric type returns plain number string", () => {
        expect(buildDisplayNumber(1, numericSettings())).toBe("1");
        expect(buildDisplayNumber(42, numericSettings())).toBe("42");
        expect(buildDisplayNumber(999, numericSettings())).toBe("999");
    });

    it("alpha type returns prefix + zero-padded 3-digit number", () => {
        expect(buildDisplayNumber(1, alphaSettings())).toBe("A001");
        expect(buildDisplayNumber(42, alphaSettings())).toBe("A042");
        expect(buildDisplayNumber(999, alphaSettings())).toBe("A999");
    });

    it("alpha type uses the configured prefix letter (uppercase)", () => {
        expect(buildDisplayNumber(7, alphaSettings({ prefix: "b" }))).toBe("B007");
        expect(buildDisplayNumber(7, alphaSettings({ prefix: "Z" }))).toBe("Z007");
    });

    it("alpha type falls back to 'A' when prefix is empty string", () => {
        expect(buildDisplayNumber(5, alphaSettings({ prefix: "" }))).toBe("A005");
    });

    it("numeric type ignores the prefix field", () => {
        expect(buildDisplayNumber(3, numericSettings({ prefix: "X" }))).toBe("3");
    });
});

describe("parseDisplayNumber", () => {
    it("parses numeric values", () => {
        expect(parseDisplayNumber("42", numericSettings())).toBe(42);
        expect(parseDisplayNumber("0007", numericSettings())).toBe(7);
    });

    it("parses alpha values with the configured prefix", () => {
        expect(parseDisplayNumber("A042", alphaSettings())).toBe(42);
        expect(parseDisplayNumber("b007", alphaSettings({ prefix: "B" }))).toBe(7);
    });

    it("rejects invalid values for the queue type", () => {
        expect(parseDisplayNumber("A042", numericSettings())).toBeNull();
        expect(parseDisplayNumber("C042", alphaSettings({ prefix: "B" }))).toBeNull();
        expect(parseDisplayNumber("B-1", alphaSettings({ prefix: "B" }))).toBeNull();
    });
});

describe("round-robin helpers", () => {
    it("cycles the serving counter within the configured max", () => {
        expect(getNextRoundRobinCounter(null, 5)).toBe(1);
        expect(getNextRoundRobinCounter(4, 5)).toBe(5);
        expect(getNextRoundRobinCounter(5, 5)).toBe(1);
    });

    it("finds the next available round-robin ticket and skips occupied numbers", () => {
        expect(getNextRoundRobinTicketSeq([1, 2, 4], 1, 5)).toBe(3);
        expect(getNextRoundRobinTicketSeq([1, 2, 3, 4, 5], 1, 5)).toBeNull();
        expect(getNextRoundRobinTicketSeq([3, 4], 4, 5)).toBe(5);
    });
});

describe("normalizeQueueNameList", () => {
    it("normalizes and deduplicates queue names from strict array input", () => {
        expect(normalizeQueueNameList([" Sportello-1 ", "sportello-2", "SPORTELLO-1", " cassa "])).toEqual([
            "sportello-1",
            "sportello-2",
            "cassa",
        ]);
    });
});
