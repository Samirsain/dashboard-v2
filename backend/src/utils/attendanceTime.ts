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

// Office-hours policy (per the posted notice):
//   LATE ("L")     — arrival after 9:45 AM, or departure before 6:15 PM.
//   HALF DAY ("H") — arrival after 11:00 AM, or departure before 5:00 PM.
//   Absent         — arrival after 2:00 PM (never showed up for real).
const CHECK_IN_ON_TIME_END = 9 * 60 + 45; // 09:45 AM — arrive by this to be Present
const CHECK_IN_LATE_END = 11 * 60; // 11:00 AM — after this, arrival is Half Day
const CHECK_IN_HALF_DAY_END = 14 * 60; // 02:00 PM — after this, arrival counts as Absent
const CHECK_OUT_HALF_DAY_BEFORE = 17 * 60; // 05:00 PM — leaving earlier forces Half Day
const CHECK_OUT_LATE_BEFORE = 18 * 60 + 15; // 06:15 PM — leaving earlier downgrades Present to Late

export type CheckInStatus = "Present" | "Late" | "Half Day" | "Absent";

/** Check-in status + how many minutes late (0 unless Late/Half Day/Absent), from the office-hours policy. */
export function computeCheckInStatus(date: Date): { status: CheckInStatus; lateMinutes: number } {
  const mins = minutesSinceMidnight(date);
  if (mins <= CHECK_IN_ON_TIME_END) return { status: "Present", lateMinutes: 0 };
  if (mins <= CHECK_IN_LATE_END) return { status: "Late", lateMinutes: mins - CHECK_IN_ON_TIME_END };
  if (mins <= CHECK_IN_HALF_DAY_END)
    return { status: "Half Day", lateMinutes: mins - CHECK_IN_ON_TIME_END };
  return { status: "Absent", lateMinutes: mins - CHECK_IN_ON_TIME_END };
}

/**
 * Check-out effect on the day, per the notice:
 *  - before 5:00 PM  -> forces the day to Half Day
 *  - before 6:15 PM  -> forces at least Late (a Present day becomes Late)
 *  - 6:15 PM onwards -> no penalty
 * earlyExitMinutes is how many minutes before 6:15 PM the person left (0 if on time).
 */
export function computeCheckOutStatus(date: Date): {
  earlyExitMinutes: number;
  forcedHalfDay: boolean;
  forcedLate: boolean;
} {
  const mins = minutesSinceMidnight(date);
  if (mins < CHECK_OUT_HALF_DAY_BEFORE) {
    return { earlyExitMinutes: CHECK_OUT_LATE_BEFORE - mins, forcedHalfDay: true, forcedLate: false };
  }
  if (mins < CHECK_OUT_LATE_BEFORE) {
    return { earlyExitMinutes: CHECK_OUT_LATE_BEFORE - mins, forcedHalfDay: false, forcedLate: true };
  }
  return { earlyExitMinutes: 0, forcedHalfDay: false, forcedLate: false };
}

/** Whole minutes between two ISO timestamps. */
export function minutesBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.max(0, Math.round((end - start) / 60000));
}
