"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import InitialsAvatar from "@/components/InitialsAvatar";
import EditAttendanceModal from "@/components/EditAttendanceModal";
import AttendanceStatusDatesModal from "@/components/AttendanceStatusDatesModal";
import { api, ApiError } from "@/lib/api";
import { formatDMY } from "@/lib/format";
import {
  REPORT_STATUSES,
  downloadAttendancePdf,
  monthTitleOf,
  statusColumnLabel,
} from "@/lib/attendanceReport";
import { useAuth } from "@/lib/auth-context";
import { canEditAttendance, canMarkAttendance } from "@/lib/access";
import type {
  Attendance,
  AttendanceDayRow,
  AttendanceRangeRow,
  AttendanceStatus,
  CheckoutAlert,
  CheckoutAlertResponse,
} from "@/lib/types";

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** "2026-08-01" for a local Date — never toISOString(), which shifts the day in IST. */
function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * { from, to } for a calendar month, given either a month offset (0 = this
 * month, -1 = last month) or a "YYYY-MM" value from the month input. `to` is
 * clamped to today so the current month never asks for future dates.
 */
function monthRange(month: number | string): { from: string; to: string } {
  const now = new Date();
  const start =
    typeof month === "string"
      ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)
      : new Date(now.getFullYear(), now.getMonth() + month, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0); // last day of that month
  return { from: isoOf(start), to: isoOf(end > now ? now : end) };
}

/** "Aug 2026" for a month offset — the label on the quick-pick buttons. */
function monthLabel(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

/** "YYYY-MM" for the month input when the range is exactly one month, else "". */
function monthValueOf(from: string, to: string): string {
  return from && to && monthTitleOf(from, to) ? from.slice(0, 7) : "";
}

function formatMinutes(mins: number): string {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatClockTime(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/** An employee+date the Edit modal is open on — the date isn't always the page's. */
type EditTarget = AttendanceDayRow & { date: string };

/** One clicked-open Monthly Report cell. */
type StatusDatesTarget = { employeeName: string; status: AttendanceStatus; dates: string[] };

/**
 * How often the "forgot to check out" alerts are re-fetched. Deliberately slow
 * — it's a 10-hour threshold, so nothing is gained by hammering the endpoint
 * (which scans the whole attendance table) every minute. Any check-in/out done
 * from this page refreshes it immediately anyway.
 */
const ALERT_POLL_MS = 5 * 60 * 1000;

/** Fallback until the server tells us its own policy number. */
const DEFAULT_ALERT_HOURS = 10;

/**
 * The "checked in but never checked out" alerts for whoever is signed in — a
 * marker gets the whole team, anyone else only their own rows. Polls so the
 * banner appears on an open tab without a reload, and never surfaces its own
 * errors: a failed alert fetch must not break the page under it.
 */
function useCheckoutAlerts(): {
  alerts: CheckoutAlert[];
  thresholdHours: number;
  reload: () => void;
} {
  const [alerts, setAlerts] = useState<CheckoutAlert[]>([]);
  const [thresholdHours, setThresholdHours] = useState(DEFAULT_ALERT_HOURS);

  const reload = useCallback(() => {
    api
      .get<CheckoutAlertResponse>("/attendance/alerts")
      .then((res) => {
        setAlerts(res?.alerts ?? []);
        setThresholdHours(res?.thresholdHours || DEFAULT_ALERT_HOURS);
      })
      .catch(() => setAlerts([]));
  }, []);

  useEffect(() => {
    queueMicrotask(reload);
    const timer = setInterval(reload, ALERT_POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  return { alerts, thresholdHours, reload };
}

/**
 * Same rule the server applies, re-checked in the browser so a row that
 * crosses the threshold while the page sits open still flags itself.
 * Returns the elapsed minutes, or 0 when there's nothing to warn about.
 */
function overdueMinutes(attendance: Attendance | null, thresholdHours: number): number {
  if (!attendance?.checkIn || attendance.checkOut) return 0;
  const start = new Date(attendance.checkIn).getTime();
  if (Number.isNaN(start)) return 0;
  const elapsed = Math.max(0, Math.round((Date.now() - start) / 60000));
  return elapsed >= thresholdHours * 60 ? elapsed : 0;
}

/**
 * A Monthly Report count. Anything above zero is a button — clicking it opens
 * the exact dates behind the number ("which days was she on Half Day?").
 */
function CountCell({ value, onClick }: { value: number; onClick: () => void }) {
  if (!value) {
    return <span className="font-data-mono text-data-mono text-on-surface-variant">0</span>;
  }
  return (
    <button
      onClick={onClick}
      title="Show the dates behind this count"
      className="font-data-mono text-data-mono text-on-surface underline underline-offset-2 decoration-dotted hover:bg-surface-container px-1 -mx-1 transition-colors"
    >
      {value}
    </button>
  );
}

/**
 * The red banner at the top of the page: everyone who punched in and never
 * punched out. `mine` drops the employee column and rewords it for a doer
 * looking at their own attendance.
 */
function CheckoutAlertBanner({
  alerts,
  thresholdHours,
  mine = false,
  onOpenDate,
  onFix,
}: {
  alerts: CheckoutAlert[];
  thresholdHours: number;
  mine?: boolean;
  onOpenDate?: (date: string) => void;
  onFix?: (alert: CheckoutAlert) => void;
}) {
  if (alerts.length === 0) return null;

  return (
    <div className="border-2 border-error bg-error/10 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="material-symbols-outlined text-error" data-icon="warning">
          warning
        </span>
        <h3 className="font-headline-md text-headline-md text-error uppercase">
          Checkout Alert{!mine && ` — ${alerts.length}`}
        </h3>
      </div>
      <p className="font-data-mono text-xs text-on-surface-variant">
        {mine
          ? `You checked in but no check-out was recorded, ${thresholdHours}+ hours later. Ask your Attendance Manager or MD to correct it.`
          : `Checked in with no check-out for ${thresholdHours}+ hours. Record the missing check-out or fix the times.`}
      </p>

      <ul className="flex flex-col border border-error bg-surface">
        {alerts.map(({ employee, attendance, elapsedMinutes }) => (
          <li
            key={attendance.id || `${employee.id}-${attendance.date}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-error/40 last:border-b-0 px-3 py-2"
          >
            {!mine && (
              <div className="flex items-center gap-2 min-w-[160px]">
                <InitialsAvatar name={employee.name} className="w-6 h-6 border border-on-surface" />
                <span className="font-medium">{employee.name}</span>
              </div>
            )}
            <span className="font-data-mono text-data-mono text-on-surface">{formatDMY(attendance.date)}</span>
            <span className="font-data-mono text-data-mono text-on-surface-variant">
              In {formatClockTime(attendance.checkIn)} · Out —
            </span>
            <span className="font-label-sm text-label-sm uppercase text-error border border-error px-2 py-0.5">
              {formatMinutes(elapsedMinutes)} pending
            </span>
            <div className="flex items-center gap-1.5 ml-auto">
              {onOpenDate && (
                <button
                  onClick={() => onOpenDate(attendance.date)}
                  className="px-2 py-1 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
                >
                  Open Date
                </button>
              )}
              {onFix && (
                <button
                  onClick={() => onFix({ employee, attendance, elapsedMinutes })}
                  title="Set the missing check-out time for this date"
                  className="px-2 py-1 border-2 border-on-surface bg-on-surface text-surface font-label-sm text-label-sm uppercase hover:opacity-90 transition-colors"
                >
                  Fix
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  Present: "bg-primary/20 text-on-surface",
  Late: "bg-yellow-100 text-on-surface",
  "Half Day": "bg-yellow-100 text-on-surface",
  Absent: "bg-error/20 text-error",
  Leave: "bg-surface-container text-on-surface-variant",
  "Pending Checkout": "bg-amber-100 text-amber-900 border-amber-500",
  "": "bg-surface-container text-on-surface-variant",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 border border-on-surface font-label-sm text-label-sm uppercase ${STATUS_STYLES[status] ?? STATUS_STYLES[""]}`}
    >
      {status || "Not Marked"}
    </span>
  );
}

/** Self-view: an employee's own today status + history. Read-only. */
function EmployeeView() {
  const [today, setToday] = useState<Attendance | null>(null);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const { alerts, thresholdHours } = useCheckoutAlerts();

  useEffect(() => {
    Promise.all([
      api.get<Attendance | null>("/attendance/today"),
      api.get<Attendance[]>("/attendance/history").catch(() => [] as Attendance[]),
    ])
      .then(([t, h]) => {
        setToday(t);
        setHistory(h);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load attendance."))
      .finally(() => setLoading(false));
  }, []);

  const filteredHistory = useMemo(() => {
    return history.filter((r) => (!rangeFrom || r.date >= rangeFrom) && (!rangeTo || r.date <= rangeTo));
  }, [history, rangeFrom, rangeTo]);

  return (
    <div className="flex flex-col gap-stack-lg">
      {error && (
        <p className="font-label-sm text-sm text-error border border-error px-3 py-2">{error}</p>
      )}

      <CheckoutAlertBanner alerts={alerts} thresholdHours={thresholdHours} mine />

      <div className="bg-surface-container-lowest border-2 border-on-surface p-stack-lg">
        <h3 className="font-headline-md text-headline-md text-on-surface uppercase mb-4">Today</h3>
        {loading ? (
          <p className="font-data-mono text-data-mono text-on-surface-variant">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">Status</p>
              <div className="mt-1"><StatusPill status={today?.status ?? ""} /></div>
            </div>
            <div>
              <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">Check-In</p>
              <p className="font-data-mono text-data-mono text-on-surface mt-1">{formatClockTime(today?.checkIn ?? "")}</p>
            </div>
            <div>
              <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">Check-Out</p>
              <p className="font-data-mono text-data-mono text-on-surface mt-1">{formatClockTime(today?.checkOut ?? "")}</p>
            </div>
            <div>
              <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">Working Hours</p>
              <p className="font-data-mono text-data-mono text-on-surface mt-1">{formatMinutes(today?.workingMinutes ?? 0)}</p>
            </div>
          </div>
        )}
        {today?.remarks && (
          <p className="mt-4 font-data-mono text-xs text-on-surface-variant">Remarks: {today.remarks}</p>
        )}
        <p className="mt-4 font-data-mono text-xs text-on-surface-variant">
          Attendance is marked by your Attendance Manager or MD — you can&apos;t edit it here.
        </p>
      </div>

      <div className="bg-surface border-2 border-on-surface p-4 flex flex-wrap items-center gap-3">
        <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">From</label>
        <input
          type="date"
          value={rangeFrom}
          max={rangeTo || undefined}
          onChange={(e) => setRangeFrom(e.target.value)}
          className="min-h-[40px] border border-on-surface bg-surface px-3 py-2 font-data-mono text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface"
        />
        <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">To</label>
        <input
          type="date"
          value={rangeTo}
          min={rangeFrom || undefined}
          onChange={(e) => setRangeTo(e.target.value)}
          className="min-h-[40px] border border-on-surface bg-surface px-3 py-2 font-data-mono text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface"
        />
        {(rangeFrom || rangeTo) && (
          <button
            onClick={() => {
              setRangeFrom("");
              setRangeTo("");
            }}
            className="px-3 py-1.5 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[640px]">
          <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
            <tr>
              <th className="py-3 px-4 border-r border-surface-variant">Date</th>
              <th className="py-3 px-4 border-r border-surface-variant">Status</th>
              <th className="py-3 px-4 border-r border-surface-variant">Check-In</th>
              <th className="py-3 px-4 border-r border-surface-variant">Check-Out</th>
              <th className="py-3 px-4">Working Hours</th>
            </tr>
          </thead>
          <tbody className="font-body-md text-body-md text-on-surface">
            {!loading && filteredHistory.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                  No attendance history yet.
                </td>
              </tr>
            )}
            {filteredHistory.map((r) => (
              <tr key={r.id} className="border-b border-surface-variant last:border-b-0">
                <td className="py-2 px-4 border-r border-surface-variant font-data-mono text-data-mono">{formatDMY(r.date)}</td>
                <td className="py-2 px-4 border-r border-surface-variant"><StatusPill status={r.status} /></td>
                <td className="py-2 px-4 border-r border-surface-variant font-data-mono text-data-mono">{formatClockTime(r.checkIn)}</td>
                <td className="py-2 px-4 border-r border-surface-variant font-data-mono text-data-mono">{formatClockTime(r.checkOut)}</td>
                <td className="py-2 px-4 font-data-mono text-data-mono">{formatMinutes(r.workingMinutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Attendance Manager / MD dashboard: mark attendance for every employee. */
/**
 * `isAdmin` covers the manager tier (MD + PC): marking any date, past or
 * present. `canEdit` is narrower — only the MD may rewrite an existing
 * record's times/status, so the Edit button hangs off that instead.
 */
function ManagerView({ isAdmin, canEdit }: { isAdmin: boolean; canEdit: boolean }) {
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState<AttendanceDayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeRows, setRangeRows] = useState<AttendanceRangeRow[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [reportDoer, setReportDoer] = useState(""); // doer filter for range report
  // The Edit modal can be opened from the day table (always today's `date`) or
  // straight off a checkout alert, which may sit on an older date — so the
  // target carries its own date rather than borrowing the page's.
  const [editingRow, setEditingRow] = useState<EditTarget | null>(null);
  // Which Monthly Report cell was clicked open: the dates behind one count.
  const [datesModal, setDatesModal] = useState<StatusDatesTarget | null>(null);
  const { alerts, thresholdHours, reload: reloadAlerts } = useCheckoutAlerts();
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);

  /** Points the range report at one whole calendar month. */
  function pickMonth(month: number | string) {
    const { from, to } = monthRange(month);
    setRangeFrom(from);
    setRangeTo(to);
  }

  /** Filtered range rows based on doer selection */
  const filteredRangeRows = useMemo(() => {
    const nonAdmins = rangeRows.filter((r) => r.employee.role !== "MD");
    if (!reportDoer) return nonAdmins;
    return nonAdmins.filter((r) => r.employee.id === reportDoer);
  }, [rangeRows, reportDoer]);

  /** Summary totals for the filtered range */
  const rangeSummary = useMemo(() => {
    const s = { Present: 0, Late: 0, "Half Day": 0, Absent: 0, Leave: 0, "Pending Checkout": 0, total: 0 };
    for (const r of filteredRangeRows) {
      s.Present += r.counts.Present || 0;
      s.Late += r.counts.Late || 0;
      s["Half Day"] += r.counts["Half Day"] || 0;
      s.Absent += r.counts.Absent || 0;
      s.Leave += r.counts.Leave || 0;
      s["Pending Checkout"] += r.counts["Pending Checkout"] || 0;
      s.total += r.totalMarked;
    }
    return s;
  }, [filteredRangeRows]);

  async function handleExportPdf() {
    setExporting(true);
    try {
      await downloadAttendancePdf({
        rows: filteredRangeRows,
        from: rangeFrom,
        to: rangeTo,
        generatedBy: user?.name ?? "",
      });
    } catch {
      alert("Could not build the PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  const editable = isAdmin || date === todayIso();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<AttendanceDayRow[]>(`/attendance/day?date=${date}`);
      setRows(data);
      // A check-in/out just changed — the alert list may have changed with it.
      reloadAlerts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load attendance.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const filteredRows = useMemo(() => {
    const nonAdmins = rows.filter((r) => r.employee.role !== "MD");
    if (!search) return nonAdmins;
    const q = search.toLowerCase();
    return nonAdmins.filter((r) => r.employee.name.toLowerCase().includes(q) || r.employee.department.toLowerCase().includes(q));
  }, [rows, search]);

  useEffect(() => {
    queueMicrotask(async () => {
      if (!rangeFrom || !rangeTo) {
        setRangeRows([]);
        return;
      }
      setRangeLoading(true);
      setRangeError(null);
      try {
        setRangeRows(await api.get<AttendanceRangeRow[]>(`/attendance/range?from=${rangeFrom}&to=${rangeTo}`));
      } catch (err) {
        setRangeError(err instanceof ApiError ? err.message : "Failed to load range report.");
      } finally {
        setRangeLoading(false);
      }
    });
  }, [rangeFrom, rangeTo]);

  async function handleCheckIn(employeeId: string) {
    setBusy(true);
    try {
      await api.post("/attendance/check-in", { employeeId, date });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to check in.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckOut(employeeId: string) {
    setBusy(true);
    try {
      await api.post("/attendance/check-out", { employeeId, date });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to check out.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkStatus(employeeId: string, status: string) {
    setBusy(true);
    try {
      await api.post("/attendance/mark", { employeeIds: [employeeId], date, status });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : `Failed to mark ${status}.`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRecompute() {
    if (
      !confirm(
        "Re-apply the current Late/Half Day rules to ALL previously marked attendance (every employee, every date with a check-in)? Statuses will be corrected per the new policy."
      )
    )
      return;
    setBusy(true);
    try {
      const result = await api.post<{ updated: number }>("/attendance/recompute", {});
      await load();
      alert(`Done — ${result.updated} record(s) updated to match the current policy.`);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to recompute statuses.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-stack-lg">
      {error && (
        <p className="font-label-sm text-sm text-error border border-error px-3 py-2">{error}</p>
      )}

      <CheckoutAlertBanner
        alerts={alerts}
        thresholdHours={thresholdHours}
        onOpenDate={setDate}
        onFix={
          canEdit
            ? (alert) =>
                setEditingRow({
                  employee: alert.employee,
                  attendance: alert.attendance,
                  date: alert.attendance.date,
                })
            : undefined
        }
      />

      {/* Filter bar */}
      <div className="bg-surface border-2 border-on-surface p-4 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">Date</label>
          <input
            type="date"
            value={date}
            max={isAdmin ? undefined : todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className="min-h-[40px] border border-on-surface bg-surface px-3 py-2 font-data-mono text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface"
          />
          {!editable && (
            <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">(view only)</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">Month</label>
          <button
            onClick={() => pickMonth(0)}
            className="px-3 py-1.5 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
          >
            {monthLabel(0)}
          </button>
          <button
            onClick={() => pickMonth(-1)}
            className="px-3 py-1.5 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
          >
            {monthLabel(-1)}
          </button>
          <input
            type="month"
            value={monthValueOf(rangeFrom, rangeTo)}
            max={todayIso().slice(0, 7)}
            onChange={(e) => e.target.value && pickMonth(e.target.value)}
            title="Pick any month"
            className="min-h-[40px] border border-on-surface bg-surface px-3 py-2 font-data-mono text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">From</label>
          <input
            type="date"
            value={rangeFrom}
            max={rangeTo || todayIso()}
            onChange={(e) => setRangeFrom(e.target.value)}
            className="min-h-[40px] border border-on-surface bg-surface px-3 py-2 font-data-mono text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface"
          />
          <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">To</label>
          <input
            type="date"
            value={rangeTo}
            min={rangeFrom || undefined}
            max={todayIso()}
            onChange={(e) => setRangeTo(e.target.value)}
            className="min-h-[40px] border border-on-surface bg-surface px-3 py-2 font-data-mono text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface"
          />
          {(rangeFrom || rangeTo) && (
            <button
              onClick={() => { setRangeFrom(""); setRangeTo(""); setReportDoer(""); }}
              className="px-3 py-1.5 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee..."
          className="min-h-[40px] border border-on-surface bg-surface px-3 py-2 font-data-mono text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface min-w-[200px] ml-auto"
        />
      </div>


      <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
            <tr>
              <th className="py-3 px-4 border-r border-surface-variant">Employee</th>
              <th className="py-3 px-4 border-r border-surface-variant">Status</th>
              <th className="py-3 px-4 border-r border-surface-variant">Check-In</th>
              <th className="py-3 px-4 border-r border-surface-variant">Check-Out</th>
              {editable && <th className="py-3 px-4">Actions</th>}
            </tr>
          </thead>
          <tbody className="font-body-md text-body-md text-on-surface">
            {loading && (
              <tr>
                <td colSpan={5} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                  No employees found.
                </td>
              </tr>
            )}
            {filteredRows.map(({ employee, attendance }) => {
              // Checked in, no check-out, threshold hours gone by — flag the row
              // itself, not just the banner, so it's obvious where to act.
              const pendingMinutes = overdueMinutes(attendance, thresholdHours);
              return (
                <tr
                  key={employee.id}
                  className={`border-b border-surface-variant last:border-b-0 transition-colors ${
                    pendingMinutes ? "bg-error/10 hover:bg-error/20" : "hover:bg-surface-container-low"
                  }`}
                >
                  <td className="py-2 px-4 border-r border-surface-variant">
                    <div className="flex items-center gap-2">
                      <InitialsAvatar name={employee.name} className="w-6 h-6 border border-on-surface" />
                      <span className="font-medium">{employee.name}</span>
                    </div>
                  </td>
                  <td className="py-2 px-4 border-r border-surface-variant"><StatusPill status={attendance?.status ?? ""} /></td>
                  <td className="py-2 px-4 border-r border-surface-variant font-data-mono text-data-mono">{formatClockTime(attendance?.checkIn ?? "")}</td>
                  <td className="py-2 px-4 border-r border-surface-variant font-data-mono text-data-mono">
                    {formatClockTime(attendance?.checkOut ?? "")}
                    {pendingMinutes > 0 && (
                      <span
                        title={`Checked in ${formatMinutes(pendingMinutes)} ago with no check-out`}
                        className="ml-2 inline-block border border-error px-1.5 py-0.5 font-label-sm text-label-sm uppercase text-error"
                      >
                        ⚠ {formatMinutes(pendingMinutes)}
                      </span>
                    )}
                  </td>
                  {editable && (
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          disabled={busy || !!attendance?.checkIn}
                          onClick={() => handleCheckIn(employee.id)}
                          className="px-2 py-1 border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors disabled:opacity-40"
                        >
                          In
                        </button>
                        <button
                          disabled={busy || !attendance?.checkIn || !!attendance?.checkOut}
                          onClick={() => handleCheckOut(employee.id)}
                          className="px-2 py-1 border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors disabled:opacity-40"
                        >
                          Out
                        </button>
                        <span className="w-px h-5 bg-surface-variant mx-0.5" />
                        <button
                          disabled={busy}
                          onClick={() => handleMarkStatus(employee.id, "Leave")}
                          className={`px-2 py-1 border-2 font-label-sm text-label-sm uppercase transition-colors disabled:opacity-40 ${
                            attendance?.status === "Leave"
                              ? "border-on-surface bg-on-surface text-surface"
                              : "border-on-surface text-on-surface hover:bg-surface-container"
                          }`}
                        >
                          Leave
                        </button>
                        {canEdit && (
                          <>
                            <span className="w-px h-5 bg-surface-variant mx-0.5" />
                            <button
                              disabled={busy}
                              onClick={() => setEditingRow({ employee, attendance, date })}
                              title="Manually edit check-in/check-out time and status for this date"
                              className="px-2 py-1 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors disabled:opacity-40"
                            >
                              Edit
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Monthly Report — visible only when date range is selected */}
      {rangeFrom && rangeTo && (
      <div className="bg-surface border-2 border-on-surface p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 className="font-headline-md text-headline-md text-on-surface uppercase">Monthly Report</h3>
            <span className="font-data-mono text-data-mono text-on-surface-variant">
              {monthTitleOf(rangeFrom, rangeTo) || `${formatDMY(rangeFrom)} to ${formatDMY(rangeTo)}`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={reportDoer}
              onChange={(e) => setReportDoer(e.target.value)}
              className="min-h-[40px] border border-on-surface bg-surface px-3 py-2 font-data-mono text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface min-w-[200px]"
            >
              <option value="">All Employees</option>
              {rangeRows.filter((r) => r.employee.role !== "MD").map(({ employee }) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>
            <button
              onClick={handleExportPdf}
              disabled={exporting || rangeLoading || filteredRangeRows.length === 0}
              title="Download this month's report as a PDF"
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-on-surface text-surface border-on-surface hover:opacity-90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-base" data-icon="download">
                download
              </span>
              {exporting ? "Preparing..." : "Export PDF"}
            </button>
          </div>
        </div>

        {rangeError && (
          <p className="font-label-sm text-sm text-error border border-error px-3 py-2">{rangeError}</p>
        )}

        {/* Summary stat cards */}
        {!rangeLoading && filteredRangeRows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: "Present", value: rangeSummary.Present, color: "bg-primary/20 text-on-surface" },
              { label: "Late", value: rangeSummary.Late, color: "bg-yellow-100 text-yellow-800" },
              { label: "Half Day", value: rangeSummary["Half Day"], color: "bg-yellow-100 text-yellow-800" },
              { label: "Absent", value: rangeSummary.Absent, color: "bg-error/20 text-error" },
              { label: "Leave", value: rangeSummary.Leave, color: "bg-surface-container text-on-surface-variant" },
              { label: "No Checkout", value: rangeSummary["Pending Checkout"], color: "bg-amber-100 text-amber-900" },
              { label: "Total", value: rangeSummary.total, color: "bg-surface-container text-on-surface" },
            ].map((card) => (
              <div key={card.label} className={`border-2 border-on-surface p-3 text-center ${card.color}`}>
                <p className="font-label-sm text-label-sm uppercase">{card.label}</p>
                <p className="font-headline-md text-headline-md mt-1">{card.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[840px]">
            <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
              <tr>
                <th className="py-3 px-4 border-r border-surface-variant">Employee</th>
                {REPORT_STATUSES.map((status) => (
                  <th key={status} className="py-3 px-4 border-r border-surface-variant">
                    {statusColumnLabel(status)}
                  </th>
                ))}
                <th className="py-3 px-4">Total Marked</th>
              </tr>
            </thead>
            <tbody className="font-body-md text-body-md text-on-surface">
              {rangeLoading && (
                <tr>
                  <td colSpan={8} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                    Loading...
                  </td>
                </tr>
              )}
              {!rangeLoading && filteredRangeRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                    No data for this range.
                  </td>
                </tr>
              )}
              {filteredRangeRows.map(({ employee, counts, dates, totalMarked }) => (
                <tr key={employee.id} className="border-b border-surface-variant last:border-b-0">
                  <td className="py-2 px-4 border-r border-surface-variant">
                    <div className="flex items-center gap-2">
                      <InitialsAvatar name={employee.name} className="w-6 h-6 border border-on-surface" />
                      <span className="font-medium">{employee.name}</span>
                    </div>
                  </td>
                  {REPORT_STATUSES.map((status) => (
                    <td key={status} className="py-2 px-4 border-r border-surface-variant">
                      <CountCell
                        value={counts[status] ?? 0}
                        onClick={() =>
                          setDatesModal({
                            employeeName: employee.name,
                            status,
                            dates: dates?.[status] ?? [],
                          })
                        }
                      />
                    </td>
                  ))}
                  <td className="py-2 px-4 font-data-mono text-data-mono">{totalMarked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {datesModal && (
        <AttendanceStatusDatesModal
          employeeName={datesModal.employeeName}
          status={datesModal.status}
          dates={datesModal.dates}
          from={rangeFrom}
          to={rangeTo}
          onClose={() => setDatesModal(null)}
        />
      )}

      {editingRow && (
        <EditAttendanceModal
          employeeId={editingRow.employee.id}
          employeeName={editingRow.employee.name}
          date={editingRow.date}
          attendance={editingRow.attendance}
          onClose={() => setEditingRow(null)}
          onSaved={() => {
            setEditingRow(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function AttendanceInner() {
  const { user } = useAuth();
  const isMarker = canMarkAttendance(user);

  return (
    <>
      <MobileHeader />
      <SideNav active="attendance" />

      <div className="md:ml-16 flex-1 flex flex-col bg-background min-h-screen">
        <header className="flex flex-col gap-2 bg-surface w-full border-b border-on-surface p-3 z-30 md:flex-row md:items-center md:justify-between md:gap-4 md:h-16 md:py-0 md:px-container-padding md:sticky md:top-0">
          <div className="font-headline-md text-headline-md text-on-surface uppercase border-b-2 border-on-surface pb-1">
            Attendance
          </div>
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-lg max-w-full overflow-hidden">
          {isMarker ? <ManagerView isAdmin={user?.role === "MD" || user?.role === "PC"} canEdit={canEditAttendance(user)} /> : <EmployeeView />}
        </main>
      </div>
    </>
  );
}

export default function AttendancePage() {
  return (
    <AuthGuard>
      <AttendanceInner />
    </AuthGuard>
  );
}
