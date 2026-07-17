/**
 * Computes a checklist template's next due date from its frequency —
 * mirrors the backend's shouldGenerateForFrequency() (backend/src/utils/date.ts)
 * but walks forward to find the next matching date instead of just testing one.
 * Always recomputed from "today", so it's inherently dynamic: once a
 * Weekly/Monthly task's day passes, the next call naturally returns the
 * following occurrence.
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function matchesFrequency(d: Date, frequency: string, frequencyValue: string): boolean {
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const weekday = WEEKDAYS[d.getDay()];
  const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const dayMatches = (anchorDay: number) =>
    anchorDay === day || (anchorDay > lastDayOfMonth && day === lastDayOfMonth);

  switch (frequency) {
    case "Daily":
      return true;
    case "Weekly":
      return weekday.toLowerCase() === frequencyValue.trim().toLowerCase();
    case "Monthly":
    case "Monthly (By Date)": {
      const dd = parseInt(frequencyValue, 10);
      return !isNaN(dd) && dayMatches(dd);
    }
    case "Monthly (By Day)": {
      if (!frequencyValue) return false;
      const parts = frequencyValue.split(" ");
      if (parts.length < 2) return false;
      const [nthStr, reqWeekday] = parts;
      if (!reqWeekday || reqWeekday.toLowerCase() !== weekday.toLowerCase()) return false;
      const nthOccurrence = Math.floor((day - 1) / 7) + 1;
      const isLast = day + 7 > lastDayOfMonth;
      const nthLower = nthStr.toLowerCase();
      if (nthLower === "first" && nthOccurrence === 1) return true;
      if (nthLower === "second" && nthOccurrence === 2) return true;
      if (nthLower === "third" && nthOccurrence === 3) return true;
      if (nthLower === "fourth" && nthOccurrence === 4) return true;
      if (nthLower === "last" && isLast) return true;
      return false;
    }
    case "Quarterly":
    case "HalfYearly":
    case "Yearly":
      return frequencyValue
        .split(",")
        .map((a) => a.trim())
        .some((anchor) => {
          const [anchorMonth, anchorDay] = anchor.split("-").map(Number);
          return anchorMonth === month && dayMatches(anchorDay ?? 0);
        });
    default:
      return false;
  }
}

/** The next date (today or later) this frequency is due — YYYY-MM-DD. */
export function nextChecklistDueDate(
  frequency: string,
  frequencyValue: string,
  from: Date = new Date()
): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 400; i++) {
    if (matchesFrequency(d, frequency, frequencyValue)) return isoDate(d);
    d.setDate(d.getDate() + 1);
  }
  return isoDate(from);
}
