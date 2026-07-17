import { env } from "../config/env";

/** Minutes since midnight for `date`, in the configured timezone. */
function minutesSinceMidnight(date: Date, timeZone = env.scheduler.timezone): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

// Office hours, in minutes-since-midnight.
const CHECK_IN_WINDOW_END = 9 * 60 + 45; // 09:45
const LATE_WINDOW_END = 10 * 60; // 10:00
const HALF_DAY_WINDOW_END = 14 * 60; // 02:00 PM
const CHECK_OUT_HALF_DAY_BEFORE = 17 * 60; // 05:00 PM
const CHECK_OUT_EARLY_EXIT_END = 18 * 60 + 14; // 06:14 PM
const CHECK_OUT_NORMAL = 18 * 60 + 30; // 06:30 PM

export type CheckInStatus = "Present" | "Late" | "Half Day" | "Absent";

/** Check-in status + how many minutes late (0 unless Late/Half Day/Absent), from the office-hours policy. */
export function computeCheckInStatus(date: Date): { status: CheckInStatus; lateMinutes: number } {
  const mins = minutesSinceMidnight(date);
  if (mins <= CHECK_IN_WINDOW_END) return { status: "Present", lateMinutes: 0 };
  if (mins <= LATE_WINDOW_END) return { status: "Late", lateMinutes: mins - CHECK_IN_WINDOW_END };
  if (mins <= HALF_DAY_WINDOW_END) return { status: "Half Day", lateMinutes: mins - CHECK_IN_WINDOW_END };
  return { status: "Absent", lateMinutes: mins - CHECK_IN_WINDOW_END };
}

/** Minutes left early (0 if on/after 06:30 PM) + whether it forces the day to Half Day (checkout before 5 PM). */
export function computeCheckOutStatus(date: Date): {
  earlyExitMinutes: number;
  forcedHalfDay: boolean;
} {
  const mins = minutesSinceMidnight(date);
  if (mins < CHECK_OUT_HALF_DAY_BEFORE) {
    return { earlyExitMinutes: CHECK_OUT_NORMAL - mins, forcedHalfDay: true };
  }
  if (mins <= CHECK_OUT_EARLY_EXIT_END) {
    return { earlyExitMinutes: CHECK_OUT_NORMAL - mins, forcedHalfDay: false };
  }
  return { earlyExitMinutes: 0, forcedHalfDay: false };
}

/** Whole minutes between two ISO timestamps. */
export function minutesBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.max(0, Math.round((end - start) / 60000));
}
