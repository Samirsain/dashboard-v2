"use client";

import { formatDMY } from "@/lib/format";
import type { AttendanceStatus } from "@/lib/types";

/** "2026-08-14" -> "Friday". Blank for anything that isn't an ISO date. */
function weekdayOf(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { weekday: "long" });
}

/**
 * The dates behind one cell of the Monthly Report — click a "Half Day: 3" and
 * this says *which* three days. Read-only; closing it leaves the report as it was.
 */
export default function AttendanceStatusDatesModal({
  employeeName,
  status,
  dates,
  from,
  to,
  onClose,
}: {
  employeeName: string;
  status: AttendanceStatus;
  dates: string[];
  from: string;
  to: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden border border-on-surface bg-surface">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md">
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">{status} Dates</h3>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase"
          >
            Close
          </button>
        </div>

        <div className="p-stack-lg flex flex-col gap-3 overflow-y-auto">
          <p className="font-data-mono text-data-mono text-on-surface-variant">
            {employeeName} — {formatDMY(from)} to {formatDMY(to)}
          </p>

          <p className="font-label-sm text-label-sm uppercase text-on-surface">
            {dates.length} {dates.length === 1 ? "day" : "days"} marked {status}
          </p>

          {dates.length === 0 ? (
            <p className="font-data-mono text-data-mono text-on-surface-variant">
              No {status} days in this range.
            </p>
          ) : (
            <ul className="flex flex-col border border-on-surface">
              {dates.map((date) => (
                <li
                  key={date}
                  className="flex items-center justify-between gap-3 border-b border-surface-variant last:border-b-0 px-3 py-2"
                >
                  <span className="font-data-mono text-data-mono text-on-surface">{formatDMY(date)}</span>
                  <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                    {weekdayOf(date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
