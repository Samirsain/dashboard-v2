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
