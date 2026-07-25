/**
 * Monday-to-Sunday week helpers.
 *
 * All arithmetic runs on the YYYY-MM-DD parts via Date.UTC — never on a local
 * `new Date("...T00:00:00")`, which silently shifts a day once toISOString()
 * converts back to UTC (in IST that made every week run Sun-Sat instead of
 * Mon-Sun).
 */

/** Today as YYYY-MM-DD in the viewer's own timezone. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing `iso` (defaults to today). */
export function mondayOf(iso: string = todayIso()): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const day = dt.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return dt.toISOString().slice(0, 10);
}

/** Sunday that closes the week starting at `monday`. */
export function sundayOf(monday: string): string {
  return addDays(monday, 6);
}
