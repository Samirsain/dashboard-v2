"use client";

import { useEffect, useMemo, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import InitialsAvatar from "@/components/InitialsAvatar";
import { api, ApiError } from "@/lib/api";
import { formatDMY } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { canMarkAttendance } from "@/lib/access";
import type { Attendance, AttendanceDayRow, AttendanceRangeRow } from "@/lib/types";

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
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

const STATUS_STYLES: Record<string, string> = {
  Present: "bg-primary/20 text-on-surface",
  Late: "bg-yellow-100 text-on-surface",
  "Half Day": "bg-yellow-100 text-on-surface",
  Absent: "bg-error/20 text-error",
  Leave: "bg-surface-container text-on-surface-variant",
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
        <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">{error}</p>
      )}

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
          Attendance is marked by your Attendance Manager or Admin — you can&apos;t edit it here.
        </p>
      </div>

      <div className="bg-surface border-2 border-on-surface p-4 flex flex-wrap items-center gap-3">
        <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">From</label>
        <input
          type="date"
          value={rangeFrom}
          max={rangeTo || undefined}
          onChange={(e) => setRangeFrom(e.target.value)}
          className="border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-data-mono text-on-surface focus:outline-none"
        />
        <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">To</label>
        <input
          type="date"
          value={rangeTo}
          min={rangeFrom || undefined}
          onChange={(e) => setRangeTo(e.target.value)}
          className="border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-data-mono text-on-surface focus:outline-none"
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

/** Attendance Manager / Admin dashboard: mark attendance for every employee. */
function ManagerView({ isAdmin }: { isAdmin: boolean }) {
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

  const editable = isAdmin || date === todayIso();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<AttendanceDayRow[]>(`/attendance/day?date=${date}`);
      setRows(data);
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
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => r.employee.name.toLowerCase().includes(q) || r.employee.department.toLowerCase().includes(q));
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

  return (
    <div className="flex flex-col gap-stack-lg">
      {error && (
        <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">{error}</p>
      )}

      {/* Filters */}
      <div className="bg-surface border-2 border-on-surface p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">Date</label>
          <input
            type="date"
            value={date}
            max={isAdmin ? undefined : todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className="border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-data-mono text-on-surface focus:outline-none"
          />
          {!editable && (
            <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">(view only — past date)</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">From</label>
          <input
            type="date"
            value={rangeFrom}
            max={rangeTo || todayIso()}
            onChange={(e) => setRangeFrom(e.target.value)}
            className="border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-data-mono text-on-surface focus:outline-none"
          />
          <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">To</label>
          <input
            type="date"
            value={rangeTo}
            min={rangeFrom || undefined}
            max={todayIso()}
            onChange={(e) => setRangeTo(e.target.value)}
            className="border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-data-mono text-on-surface focus:outline-none"
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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee..."
          className="border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-data-mono text-on-surface focus:outline-none min-w-[200px]"
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
            {filteredRows.map(({ employee, attendance }) => (
              <tr key={employee.id} className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors">
                <td className="py-2 px-4 border-r border-surface-variant">
                  <div className="flex items-center gap-2">
                    <InitialsAvatar name={employee.name} className="w-6 h-6 border border-on-surface" />
                    <span className="font-medium">{employee.name}</span>
                  </div>
                </td>
                <td className="py-2 px-4 border-r border-surface-variant"><StatusPill status={attendance?.status ?? ""} /></td>
                <td className="py-2 px-4 border-r border-surface-variant font-data-mono text-data-mono">{formatClockTime(attendance?.checkIn ?? "")}</td>
                <td className="py-2 px-4 border-r border-surface-variant font-data-mono text-data-mono">{formatClockTime(attendance?.checkOut ?? "")}</td>
                {editable && (
                  <td className="py-2 px-4">
                    <div className="flex items-center gap-2">
                      <button
                        disabled={busy || !!attendance?.checkIn}
                        onClick={() => handleCheckIn(employee.id)}
                        className="px-2 py-1 border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors disabled:opacity-40"
                      >
                        Check In
                      </button>
                      <button
                        disabled={busy || !attendance?.checkIn || !!attendance?.checkOut}
                        onClick={() => handleCheckOut(employee.id)}
                        className="px-2 py-1 border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors disabled:opacity-40"
                      >
                        Check Out
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Range report — driven by the From/To pickers in the filter bar above */}
      {(rangeFrom || rangeTo) && (
      <div className="bg-surface border-2 border-on-surface p-4 flex flex-col gap-4">
        <h3 className="font-headline-md text-headline-md text-on-surface uppercase">Date Range Report</h3>

        {rangeError && (
          <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">{rangeError}</p>
        )}

        {!rangeFrom || !rangeTo ? (
          <p className="font-data-mono text-data-mono text-on-surface-variant">
            Pick a From and To date to see per-employee totals for that range.
          </p>
        ) : (
          <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                <tr>
                  <th className="py-3 px-4 border-r border-surface-variant">Employee</th>
                  <th className="py-3 px-4 border-r border-surface-variant">Present</th>
                  <th className="py-3 px-4 border-r border-surface-variant">Late</th>
                  <th className="py-3 px-4 border-r border-surface-variant">Half Day</th>
                  <th className="py-3 px-4 border-r border-surface-variant">Absent</th>
                  <th className="py-3 px-4 border-r border-surface-variant">Leave</th>
                  <th className="py-3 px-4">Total Marked</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {rangeLoading && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      Loading...
                    </td>
                  </tr>
                )}
                {!rangeLoading && rangeRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      No data for this range.
                    </td>
                  </tr>
                )}
                {rangeRows.map(({ employee, counts, totalMarked }) => (
                  <tr key={employee.id} className="border-b border-surface-variant last:border-b-0">
                    <td className="py-2 px-4 border-r border-surface-variant">
                      <div className="flex items-center gap-2">
                        <InitialsAvatar name={employee.name} className="w-6 h-6 border border-on-surface" />
                        <span className="font-medium">{employee.name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-4 border-r border-surface-variant font-data-mono text-data-mono">{counts.Present}</td>
                    <td className="py-2 px-4 border-r border-surface-variant font-data-mono text-data-mono">{counts.Late}</td>
                    <td className="py-2 px-4 border-r border-surface-variant font-data-mono text-data-mono">{counts["Half Day"]}</td>
                    <td className="py-2 px-4 border-r border-surface-variant font-data-mono text-data-mono">{counts.Absent}</td>
                    <td className="py-2 px-4 border-r border-surface-variant font-data-mono text-data-mono">{counts.Leave}</td>
                    <td className="py-2 px-4 font-data-mono text-data-mono">{totalMarked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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

      <div className="md:ml-64 flex-1 flex flex-col bg-background min-h-screen">
        <header className="hidden md:flex bg-surface w-full border-b-2 border-on-surface justify-between items-center h-16 px-container-padding sticky top-0 z-30">
          <div className="font-headline-md text-headline-md text-on-surface uppercase border-b-2 border-on-surface pb-1">
            Attendance
          </div>
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-lg max-w-full overflow-hidden">
          {isMarker ? <ManagerView isAdmin={user?.role === "Admin"} /> : <EmployeeView />}
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
