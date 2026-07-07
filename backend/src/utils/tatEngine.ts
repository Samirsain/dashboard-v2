import { env } from "../config/env";

/**
 * The Deadline Cascade engine (WFMS PRD §6-7, Model A):
 *   Planned(step_n) = addTAT(Actual(step_{n-1}), TAT(step_n))
 * Each step's own TAT governs its own window, measured business-hours-only
 * from the moment it becomes active. Calendar is LOCKED per the PRD:
 * 09:30-18:30, Sunday off (no holiday list in v1).
 */

const WORK_START = { hour: 9, minute: 30 };
const WORK_END = { hour: 18, minute: 30 };
const TIMEZONE = env.scheduler.timezone;

/** "WHENEVER_NEEDED" steps have no hard deadline. */
export const WHENEVER_NEEDED = "WHENEVER_NEEDED";
export const SAME_DAY = "SAME_DAY";
export const NEXT_DAY = "NEXT_DAY";

function partsInTz(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"), // "Sun", "Mon", ...
  };
}

/** Builds a UTC Date for a given Y/M/D + H:M *in the configured timezone*. */
function zonedDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  // Construct as if UTC, then correct by the timezone's offset at that instant.
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const probe = new Date(naiveUtc);
  const tzParts = partsInTz(probe);
  const asUtcOfTzParts = Date.UTC(tzParts.year, tzParts.month - 1, tzParts.day, tzParts.hour, tzParts.minute, 0);
  const offsetMs = naiveUtc - asUtcOfTzParts;
  return new Date(naiveUtc + offsetMs);
}

function isSunday(date: Date): boolean {
  return partsInTz(date).weekday === "Sun";
}

function startOfWorkDay(date: Date): Date {
  const p = partsInTz(date);
  return zonedDate(p.year, p.month, p.day, WORK_START.hour, WORK_START.minute);
}

function endOfWorkDay(date: Date): Date {
  const p = partsInTz(date);
  return zonedDate(p.year, p.month, p.day, WORK_END.hour, WORK_END.minute);
}

function addCalendarDay(date: Date): Date {
  const p = partsInTz(date);
  // Noon avoids DST edge cases when just stepping the calendar day forward.
  const noon = zonedDate(p.year, p.month, p.day, 12, 0);
  return new Date(noon.getTime() + 24 * 3600 * 1000);
}

/** Rolls forward to the next working day (skipping Sundays), returning its start-of-day. */
function nextWorkingDayStart(date: Date): Date {
  let d = addCalendarDay(date);
  while (isSunday(d)) d = addCalendarDay(d);
  return startOfWorkDay(d);
}

/** Snaps a moment forward to the next point that's inside working hours on a working day. */
function nextWorkingMoment(date: Date): Date {
  if (isSunday(date)) return nextWorkingDayStart(date);
  const dayStart = startOfWorkDay(date);
  const dayEnd = endOfWorkDay(date);
  if (date < dayStart) return dayStart;
  if (date >= dayEnd) return nextWorkingDayStart(date);
  return date;
}

/**
 * Adds `hours` of business time to `start`, skipping non-working hours and
 * Sundays, rolling the remainder across day boundaries.
 */
export function addBusinessHours(start: Date, hours: number): Date {
  let remainingMs = hours * 3600 * 1000;
  let current = nextWorkingMoment(start);

  while (remainingMs > 0) {
    const dayEnd = endOfWorkDay(current);
    const availableMs = dayEnd.getTime() - current.getTime();
    if (remainingMs <= availableMs) {
      return new Date(current.getTime() + remainingMs);
    }
    remainingMs -= availableMs;
    current = nextWorkingDayStart(current);
  }
  return current;
}

/**
 * Canonical TAT string forms (PRD §7.1):
 *   "<number>h"      duration in business hours (bare numbers also accepted -> hours)
 *   "SAME_DAY"       end of the current working day (18:30)
 *   "NEXT_DAY"       end of the next working day (18:30)
 *   "WHENEVER_NEEDED" no hard deadline -> returns null
 */
export function addTAT(start: Date, tat: string): Date | null {
  const normalized = tat.trim().toUpperCase();

  if (normalized === WHENEVER_NEEDED) return null;

  if (normalized === SAME_DAY) {
    const moment = nextWorkingMoment(start);
    return endOfWorkDay(moment);
  }

  if (normalized === NEXT_DAY) {
    const moment = nextWorkingMoment(start);
    return endOfWorkDay(nextWorkingDayStart(moment));
  }

  const hoursMatch = tat.trim().match(/^(\d+(?:\.\d+)?)\s*h?$/i);
  if (hoursMatch) {
    return addBusinessHours(start, Number(hoursMatch[1]));
  }

  throw new Error(`Unrecognized TAT value: "${tat}"`);
}

/** Business-hours delay between actual and planned completion, in minutes. Positive = late. */
export function delayMinutes(planned: Date | null, actual: Date | null): number | null {
  if (!planned || !actual) return null;
  return Math.round((actual.getTime() - planned.getTime()) / 60000);
}
