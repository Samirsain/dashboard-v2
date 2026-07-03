import { env } from "../config/env";
import type { ChecklistFrequency } from "../types";

/** Returns { year, month, day, weekday } for "now" in the configured scheduler timezone. */
export function getDateParts(date: Date = new Date(), timeZone = env.scheduler.timezone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(lookup("year")),
    month: Number(lookup("month")),
    day: Number(lookup("day")),
    weekday: lookup("weekday"),
  };
}

/** Today's date as YYYY-MM-DD in the configured timezone. */
export function todayIso(date: Date = new Date()): string {
  const { year, month, day } = getDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function compareIsoDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBeforeToday(iso: string, today = todayIso()): boolean {
  return isValidIsoDate(iso) && compareIsoDates(iso, today) < 0;
}

export function isToday(iso: string, today = todayIso()): boolean {
  return iso === today;
}

export function isWithinNextDays(iso: string, days: number, today = todayIso()): boolean {
  if (!isValidIsoDate(iso)) return false;
  const upper = addDaysIso(today, days);
  return compareIsoDates(iso, today) > 0 && compareIsoDates(iso, upper) <= 0;
}

/**
 * Decides whether a recurring checklist template should generate an
 * occurrence for the given date, based on its frequency + frequencyValue.
 *
 * frequencyValue conventions (see types.ts ChecklistTemplate for details):
 *  - Weekly:    weekday name, e.g. "Monday"
 *  - Monthly:   day of month, e.g. "15"
 *  - Quarterly/HalfYearly/Yearly: comma separated "MM-DD" anchors
 */
export function shouldGenerateForFrequency(
  frequency: ChecklistFrequency,
  frequencyValue: string,
  date: Date = new Date()
): boolean {
  const { day, month, weekday } = getDateParts(date);
  const mmdd = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  switch (frequency) {
    case "Daily":
      return true;
    case "Weekly":
      return weekday.toLowerCase() === frequencyValue.trim().toLowerCase();
    case "Monthly":
      return Number(frequencyValue) === day;
    case "Quarterly":
    case "HalfYearly":
    case "Yearly":
      return frequencyValue
        .split(",")
        .map((anchor) => anchor.trim())
        .includes(mmdd);
    default:
      return false;
  }
}
