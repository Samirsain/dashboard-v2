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
  const { year, day, month, weekday } = getDateParts(date);
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // An anchor day beyond the current month's length (e.g. 31 in April,
  // 29-31 in February) fires on the month's last day instead of never.
  const dayMatches = (anchorDay: number) =>
    anchorDay === day || (anchorDay > lastDayOfMonth && day === lastDayOfMonth);

  switch (frequency) {
    case "Daily":
      return true;
    case "Weekly":
      return weekday.toLowerCase() === frequencyValue.trim().toLowerCase();
    case "Monthly":
    case "Monthly (By Date)":
      const d = parseInt(frequencyValue, 10);
      if (!isNaN(d)) return dayMatches(d);
      return false;
    case "Monthly (By Day)": {
      if (!frequencyValue) return false;
      const parts = frequencyValue.split(" ");
      if (parts.length < 2) return false;
      const [nthStr, reqWeekday] = parts;
      if (!reqWeekday || !nthStr) return false;
      if (reqWeekday.toLowerCase() !== weekday.toLowerCase()) return false;
  
      const nth = Math.ceil(day / 7);
      const isLast = day + 7 > lastDayOfMonth;
  
      const nthLower = nthStr.toLowerCase();
      if (nthLower === "first" && nth === 1) return true;
      if (nthLower === "second" && nth === 2) return true;
      if (nthLower === "third" && nth === 3) return true;
      if (nthLower === "fourth" && nth === 4) return true;
      if (nthLower === "last" && isLast) return true;
      return false;
    }
    case "Quarterly":
    case "HalfYearly":
    case "Yearly":
      return frequencyValue
        .split(",")
        .map((anchor) => anchor.trim())
        .some((anchor) => {
          const [anchorMonth, anchorDay] = anchor.split("-").map(Number);
          return anchorMonth === month && dayMatches(anchorDay ?? 0);
        });
    default:
      return false;
  }
}

export function shouldGenerateRecurringTask(
  repeatType: string,
  repeatValue: string,
  date: Date = new Date(),
  timeZone = env.scheduler.timezone
): boolean {
  if (!repeatType || repeatType === "None") return false;

  const { year, day, month, weekday } = getDateParts(date, timeZone);
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const dayMatches = (anchorDay: number) =>
    anchorDay === day || (anchorDay > lastDayOfMonth && day === lastDayOfMonth);

  if (repeatType === "Daily") {
    return true;
  }

  if (repeatType === "Weekly") {
    return weekday.toLowerCase() === (repeatValue || "").trim().toLowerCase();
  }

  if (repeatType === "Monthly (By Date)") {
    const d = parseInt(repeatValue, 10);
    if (isNaN(d)) return false;
    return dayMatches(d);
  }

  if (repeatType === "Monthly (By Day)") {
    if (!repeatValue) return false;
    const parts = repeatValue.split(" ");
    if (parts.length < 2) return false;
    const [nthStr, reqWeekday] = parts;
    if (!reqWeekday || !nthStr) return false;
    if (reqWeekday.toLowerCase() !== weekday.toLowerCase()) return false;

    const nth = Math.ceil(day / 7);
    const isLast = day + 7 > lastDayOfMonth;

    const nthLower = nthStr.toLowerCase();
    if (nthLower === "first" && nth === 1) return true;
    if (nthLower === "second" && nth === 2) return true;
    if (nthLower === "third" && nth === 3) return true;
    if (nthLower === "fourth" && nth === 4) return true;
    if (nthLower === "last" && isLast) return true;
    return false;
  }

  return false;
}
