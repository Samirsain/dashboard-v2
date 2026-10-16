/**
 * Formats a backend date value as day-month-year (DD-MM-YYYY) for display.
 *
 * Accepts an ISO date ("2026-07-09") or ISO datetime ("2026-07-09T..."),
 * and returns "09-07-2026". Blank/undefined becomes "—"; anything that
 * isn't an ISO date passes through unchanged (so free-text values survive).
 *
 * NOTE: only for *display*. Never feed this into <input type="date"> (which
 * needs YYYY-MM-DD) or into sorting/comparison (which relies on ISO order).
 */
export function formatDMY(value: string | null | undefined): string {
  if (!value) return "—";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : value;
}

/**
 * Renders a score as "-35%". Anything that isn't a real number — a field the
 * API didn't send, a null, a NaN — becomes "—" rather than "undefined%", so a
 * stale or mismatched backend shows a visible gap instead of broken text.
 */
export function formatPct(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value}%` : "—";
}

/**
 * The weekday name for an ISO date ("2026-08-14" -> "Friday"). Blank for
 * anything that isn't an ISO date, so a stray value renders as nothing
 * rather than "Invalid Date".
 */
export function weekdayOf(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN", { weekday: "long" });
}
