"use client";

import { useEffect, useMemo, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import InitialsAvatar from "@/components/InitialsAvatar";
import { api, ApiError } from "@/lib/api";
import { formatDMY } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import type { Attendance, AttendanceDayRow, AttendanceStatus } from "@/lib/types";

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

const STATUS_OPTIONS: AttendanceStatus[] = ["Present", "Late", "Half Day", "Absent", "Leave"];

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
            {!loading && history.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                  No attendance history yet.
                </td>
              </tr>
            )}
            {history.map((r) => (
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  const editable = isAdmin || date === todayIso();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<AttendanceDayRow[]>(`/attendance/day?date=${date}`);
      setRows(data);
      setSelected(new Set());
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

  const summary = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      Present: 0,
      Late: 0,
      "Half Day": 0,
      Absent: 0,
      Leave: 0,
    };
    let currentlyWorking = 0;
    for (const r of rows) {
      const s = r.attendance?.status;
      if (s) counts[s]++;
      if (r.attendance?.checkIn && !r.attendance?.checkOut) currentlyWorking++;
    }
    return { ...counts, currentlyWorking, total: rows.length };
  }, [rows]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === filteredRows.length ? new Set() : new Set(filteredRows.map((r) => r.employee.id))));
  }

  async function bulkMark(status: AttendanceStatus) {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await api.post("/attendance/mark", { employeeIds: Array.from(selected), date, status });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to mark attendance.");
    } finally {
      setBusy(false);
    }
  }

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

  async function handleRemarks(employeeId: string, remarks: string) {
    try {
      await api.patch("/attendance/remarks", { employeeId, date, remarks });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to save remarks.");
    }
  }

  return (
    <div className="flex flex-col gap-stack-lg">
      {error && (
        <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">{error}</p>
      )}

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          ["Total", summary.total],
          ["Present", summary.Present],
          ["Late", summary.Late],
          ["Half Day", summary["Half Day"]],
          ["Leave", summary.Leave],
          ["Absent", summary.Absent],
          ["Working Now", summary.currentlyWorking],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-surface-container-lowest border-2 border-on-surface p-3">
            <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">{label}</p>
            <p className="font-headline-md text-headline-md text-on-surface">{value}</p>
          </div>
        ))}
      </div>

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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee..."
          className="border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-data-mono text-on-surface focus:outline-none min-w-[200px]"
        />
      </div>

      {/* Bulk actions */}
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
            {selected.size} selected
          </span>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              disabled={selected.size === 0 || busy}
              onClick={() => bulkMark(s)}
              className="px-3 py-1.5 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors disabled:opacity-40"
            >
              Mark {s}
            </button>
          ))}
        </div>
      )}

      <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
            <tr>
              {editable && (
                <th className="py-3 px-4 border-r border-surface-variant w-10">
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === filteredRows.length}
                    onChange={toggleAll}
                  />
                </th>
              )}
              <th className="py-3 px-4 border-r border-surface-variant">Employee</th>
              <th className="py-3 px-4 border-r border-surface-variant">Department</th>
              <th className="py-3 px-4 border-r border-surface-variant">Status</th>
              <th className="py-3 px-4 border-r border-surface-variant">Check-In</th>
              <th className="py-3 px-4 border-r border-surface-variant">Check-Out</th>
              <th className="py-3 px-4 border-r border-surface-variant">Remarks</th>
              {editable && <th className="py-3 px-4">Actions</th>}
            </tr>
          </thead>
          <tbody className="font-body-md text-body-md text-on-surface">
            {loading && (
              <tr>
                <td colSpan={8} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                  No employees found.
                </td>
              </tr>
            )}
            {filteredRows.map(({ employee, attendance }) => (
              <tr key={employee.id} className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors">
                {editable && (
                  <td className="py-2 px-4 border-r border-surface-variant">
                    <input type="checkbox" checked={selected.has(employee.id)} onChange={() => toggle(employee.id)} />
                  </td>
                )}
                <td className="py-2 px-4 border-r border-surface-variant">
                  <div className="flex items-center gap-2">
                    <InitialsAvatar name={employee.name} className="w-6 h-6 border border-on-surface" />
                    <span className="font-medium">{employee.name}</span>
                  </div>
                </td>
                <td className="py-2 px-4 border-r border-surface-variant">{employee.department}</td>
                <td className="py-2 px-4 border-r border-surface-variant"><StatusPill status={attendance?.status ?? ""} /></td>
                <td className="py-2 px-4 border-r border-surface-variant font-data-mono text-data-mono">{formatClockTime(attendance?.checkIn ?? "")}</td>
                <td className="py-2 px-4 border-r border-surface-variant font-data-mono text-data-mono">{formatClockTime(attendance?.checkOut ?? "")}</td>
                <td className="py-2 px-4 border-r border-surface-variant">
                  {editable ? (
                    <input
                      defaultValue={attendance?.remarks ?? ""}
                      onBlur={(e) => {
                        if (e.target.value !== (attendance?.remarks ?? "")) handleRemarks(employee.id, e.target.value);
                      }}
                      placeholder="—"
                      className="w-full border border-surface-variant bg-surface px-2 py-1 font-data-mono text-xs text-on-surface focus:outline-none focus:border-on-surface"
                    />
                  ) : (
                    <span className="font-data-mono text-xs text-on-surface-variant">{attendance?.remarks || "—"}</span>
                  )}
                </td>
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
    </div>
  );
}

function AttendanceInner() {
  const { user } = useAuth();
  const isMarker = user?.role === "Admin" || user?.isAttendanceManager === true;

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
