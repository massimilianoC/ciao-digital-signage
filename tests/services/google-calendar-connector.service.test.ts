import { describe, expect, it } from "vitest";

import { normalizeGoogleApiEvent, parseIcsEvents } from "../../lib/services/google-calendar-connector.service";

const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test-1
DTSTART:20261201T090000Z
DTEND:20261201T100000Z
SUMMARY:Board Meeting
LOCATION:Room 1
DESCRIPTION:Quarterly review
END:VEVENT
BEGIN:VEVENT
UID:test-2
DTSTART;VALUE=DATE:20261202
DTEND;VALUE=DATE:20261203
SUMMARY:All Day Event
END:VEVENT
END:VCALENDAR`;

describe("google-calendar-connector.service", () => {
    it("parses timed and all-day ICS events", () => {
        const events = parseIcsEvents(sampleIcs, 10, new Date("2026-01-01T00:00:00.000Z"));

        expect(events).toHaveLength(2);
        expect(events[0]).toMatchObject({
            id: "test-1",
            title: "Board Meeting",
            isAllDay: false,
            location: "Room 1",
        });
        expect(events[1]).toMatchObject({
            id: "test-2",
            title: "All Day Event",
            isAllDay: true,
        });
    });

    it("normalizes Google API event payloads", () => {
        const normalized = normalizeGoogleApiEvent({
            id: "google-1",
            summary: "Train Departures",
            start: { dateTime: "2026-12-01T10:00:00Z" },
            end: { dateTime: "2026-12-01T10:30:00Z" },
            location: "Platform 4",
        });

        expect(normalized).toEqual({
            id: "google-1",
            title: "Train Departures",
            start: "2026-12-01T10:00:00Z",
            end: "2026-12-01T10:30:00Z",
            isAllDay: false,
            location: "Platform 4",
            description: undefined,
        });
    });
});