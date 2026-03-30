import { getDay, getHours, getMinutes } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export interface TimeWindow {
  startHHMM: string;
  endHHMM: string;
  daysOfWeek: number[];
  timezone: string;
}

const parseHHMMToMinutes = (hhmm: string): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) {
    return null;
  }

  if (hours === 24 && minutes !== 0) {
    return null;
  }

  return hours * 60 + minutes;
};

export function isWindowActiveAt(
  window: TimeWindow,
  utcTimestamp: Date,
  timezoneOverride?: string,
): boolean {
  const effectiveTimezone = timezoneOverride || window.timezone || "UTC";
  const localTime = toZonedTime(utcTimestamp, effectiveTimezone);
  const localDay = getDay(localTime);

  if (window.daysOfWeek.length > 0 && !window.daysOfWeek.includes(localDay)) {
    return false;
  }

  const currentMinutes = getHours(localTime) * 60 + getMinutes(localTime);
  const startMinutes = parseHHMMToMinutes(window.startHHMM);
  const endMinutes = parseHHMMToMinutes(window.endHHMM);

  if (startMinutes === null || endMinutes === null) {
    return false;
  }

  if (endMinutes <= startMinutes) {
    return false;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}
