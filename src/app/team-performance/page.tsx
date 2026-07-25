"use client";

import { useEffect, useState, useMemo } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { formatDMY } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import type { DgmaxWeeklySummary, WeeklyArchive } from "@/lib/types";

/** Monday (YYYY-MM-DD) of the week containing `dateStr` (or today, if omitted). */
function mondayOf(dateStr?: string): string {
  const base = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  const day = base.getDay(); // 0 = Sunday .. 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + diff);
  return base.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Archived rows store the 0-100 value; the final score is its negative form. */
function toNegative(performanceScore: number): number {
  return Math.round((performanceScore - 100) * 100) / 100;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col gap-1 border border-on-surface/25 px-3 py-2">
      <span className="font-label-sm text-[10px] uppercase tracking-wide text-on-surface-variant">{label}</span>
      <span className="font-data-mono text-lg font-bold text-on-surface">{value}</span>
    </div>
  );
}

function TeamPerformanceInner() {
  const { user } = useAuth();
  const [dgmaxSummary, setDgmaxSummary] = useState<DgmaxWeeklySummary | null>(null);
  const [archives, setArchives] = useState<WeeklyArchive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Monday of the currently-selected week. Week always runs Monday -> Sunday.
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const weekEnd = addDays(weekStart, 6);
  const [lateWeight, setLateWeight] = useState(60);
  const [lateWeightDraft, setLateWeightDraft] = useState("60");

  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});
  const [archiving, setArchiving] = useState(false);
  const [activeTab, setActiveTab] = useState<"current" | "archive">("current");

  async function loadData(from: string, to: string, weight: number) {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, archiveData] = await Promise.all([
        api.get<DgmaxWeeklySummary>(`/performance/dgmax?from=${from}&to=${to}&lateWeight=${weight}`),
        api.get<WeeklyArchive[]>("/performance/archives").catch(() => [] as WeeklyArchive[]),
      ]);
      setDgmaxSummary(summaryData);
      setArchives(archiveData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load performance data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadData(weekStart, weekEnd, lateWeight);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, lateWeight]);

  function goToWeek(offsetWeeks: number) {
    setWeekStart((prev) => addDays(prev, offsetWeeks * 7));
  }

  function applyLateWeight() {
    const n = Number(lateWeightDraft);
    if (Number.isFinite(n)) setLateWeight(Math.min(100, Math.max(0, Math.round(n))));
  }

  const weekLabel = dgmaxSummary?.weekLabel || `${formatDMY(weekStart)} to ${formatDMY(weekEnd)}`;

  async function handleArchiveSubmit() {
    setArchiving(true);
    try {
      await api.post("/performance/archive", {
        weekLabel,
        from: weekStart,
        to: weekEnd,
        lateWeight,
        remarks: remarksMap,
      });
      alert(`Weekly Performance archived for ${weekLabel}!`);
      setShowArchiveModal(false);
      await loadData(weekStart, weekEnd, lateWeight);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to archive week.");
    } finally {
      setArchiving(false);
    }
  }

  const totals = dgmaxSummary?.totals ?? {
    assigned: 0,
    completed: 0,
    green: 0,
    yellow: 0,
    red: 0,
    pending: 0,
    negativeScore: 0,
    performanceScore: 100,
  };

  const archivedWeeks = useMemo(() => {
    const map = new Map<string, WeeklyArchive[]>();
    for (const a of archives) {
      const list = map.get(a.weekLabel) ?? [];
      list.push(a);
      map.set(a.weekLabel, list);
    }
    return Array.from(map.entries());
  }, [archives]);

  function exportCSV() {
    const headers = ["Week", "Rank", "Employee Name", "Assigned", "On Time", "Late Done", "Not Done", "Score"];
    const rows = (dgmaxSummary?.summaries ?? []).map((s, i) => [
      weekLabel, i + 1, s.doerName,
      s.assignedTasks, s.greenCount, s.yellowCount, s.redCount, s.negativeScore,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map((e) => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `dgmax-summary-${weekStart}-to-${weekEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <>
      <MobileHeader />
      <SideNav active="team-performance" />

      <div className="md:ml-64 flex-1 flex flex-col bg-background min-h-screen">
        <header className="hidden md:flex bg-surface w-full border-b border-on-surface justify-between items-center h-16 px-container-padding sticky top-0 z-30">
          <div className="font-headline-md text-headline-md text-on-surface uppercase font-bold">
            Team Performance
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="px-3 py-1.5 border border-on-surface bg-surface font-label-sm text-xs uppercase hover:bg-surface-container transition-colors cursor-pointer">
              Export CSV
            </button>
            {user?.role === "Admin" && (
              <button onClick={() => setShowArchiveModal(true)} className="px-3 py-1.5 border border-on-surface bg-surface font-label-sm text-xs uppercase hover:bg-surface-container transition-colors cursor-pointer">
                Archive Week
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-4 max-w-full overflow-hidden">
          {/* Week Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 border border-on-surface/30 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => goToWeek(-1)} className="px-3 py-1.5 border border-on-surface font-label-sm text-xs uppercase hover:bg-surface-container transition-colors cursor-pointer">
                ← Prev
              </button>
              <button onClick={() => setWeekStart(mondayOf())} className="px-3 py-1.5 border border-on-surface font-label-sm text-xs uppercase hover:bg-surface-container transition-colors cursor-pointer">
                This Week
              </button>
              <button onClick={() => goToWeek(1)} className="px-3 py-1.5 border border-on-surface font-label-sm text-xs uppercase hover:bg-surface-container transition-colors cursor-pointer">
                Next →
              </button>
              <input
                type="date"
                value={weekStart}
                onChange={(e) => e.target.value && setWeekStart(mondayOf(e.target.value))}
                className="border border-on-surface bg-surface px-2 py-1 font-data-mono text-xs text-on-surface focus:outline-none"
              />
              <span className="font-data-mono text-sm text-on-surface">
                {formatDMY(weekStart)} — {formatDMY(weekEnd)} <span className="text-on-surface-variant">(Mon–Sun)</span>
              </span>
            </div>

            {user?.role === "Admin" && (
              <div className="flex items-center gap-2">
                <label className="font-label-sm text-[10px] uppercase text-on-surface-variant">Late Done Penalty</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={lateWeightDraft}
                  onChange={(e) => setLateWeightDraft(e.target.value)}
                  className="border border-on-surface bg-surface px-2 py-1 w-16 font-data-mono text-xs text-on-surface focus:outline-none"
                />
                <span className="font-data-mono text-xs">%</span>
                <button onClick={applyLateWeight} className="px-3 py-1.5 border border-on-surface font-label-sm text-xs uppercase hover:bg-surface-container transition-colors cursor-pointer">
                  Apply
                </button>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-on-surface pb-2">
            <button onClick={() => setActiveTab("current")} className={`px-3 py-1.5 border border-on-surface font-label-sm text-xs uppercase transition-colors cursor-pointer ${activeTab === "current" ? "bg-on-surface text-surface" : "hover:bg-surface-container"}`}>
              Week Scoreboard
            </button>
            <button onClick={() => setActiveTab("archive")} className={`px-3 py-1.5 border border-on-surface font-label-sm text-xs uppercase transition-colors cursor-pointer ${activeTab === "archive" ? "bg-on-surface text-surface" : "hover:bg-surface-container"}`}>
              Archive ({archivedWeeks.length})
            </button>
          </div>

          {error && <p className="font-label-sm text-label-sm text-error border border-error px-3 py-2">{error}</p>}

          {activeTab === "current" ? (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                <Stat label="Team Score" value={`${totals.negativeScore}%`} />
                <Stat label="Assigned" value={totals.assigned} />
                <Stat label="On Time" value={totals.green} />
                <Stat label="Late Done" value={totals.yellow} />
                <Stat label="Not Done" value={totals.red} />
                <Stat label="Not Yet Due" value={totals.pending} />
              </div>

              {/* Formula */}
              <p className="text-[11px] text-on-surface-variant font-data-mono border border-on-surface/25 px-3 py-2 leading-relaxed">
                Per Task % = 100 ÷ Assigned &nbsp;·&nbsp; Score = −((Not Done × Per Task %) + (Late Done × Per Task % × {lateWeight}%))
                <br />
                <span className="opacity-70">0% is a perfect week; the score only goes down from there. Tasks not yet due are excluded.</span>
              </p>

              {/* Scoreboard */}
              <div className="border border-on-surface overflow-x-auto max-w-full">
                <table className="w-full text-left border-collapse min-w-[720px]">
                  <thead className="font-label-sm text-[11px] uppercase text-on-surface-variant border-b border-on-surface">
                    <tr>
                      <th className="py-2 px-3 font-normal text-center w-12">#</th>
                      <th className="py-2 px-3 font-normal">Employee</th>
                      <th className="py-2 px-3 font-normal text-center">Assigned</th>
                      <th className="py-2 px-3 font-normal text-center">On Time</th>
                      <th className="py-2 px-3 font-normal text-center">Late Done</th>
                      <th className="py-2 px-3 font-normal text-center">Not Done</th>
                      <th className="py-2 px-3 font-normal text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-md text-sm">
                    {loading && (
                      <tr><td colSpan={7} className="py-6 text-center font-data-mono text-on-surface-variant">Loading…</td></tr>
                    )}
                    {!loading && (dgmaxSummary?.summaries.length ?? 0) === 0 && (
                      <tr><td colSpan={7} className="py-6 text-center font-data-mono text-on-surface-variant">No data for this week.</td></tr>
                    )}
                    {dgmaxSummary?.summaries.map((s, i) => (
                      <tr key={s.doerId} className="border-b border-on-surface/15 hover:bg-surface-container-low transition-colors">
                        <td className="py-2 px-3 text-center font-data-mono text-on-surface-variant">{i + 1}</td>
                        <td className="py-2 px-3">{s.doerName}</td>
                        <td className="py-2 px-3 text-center font-data-mono">{s.assignedTasks}</td>
                        <td className="py-2 px-3 text-center font-data-mono">{s.greenCount}</td>
                        <td className="py-2 px-3 text-center font-data-mono">{s.yellowCount}</td>
                        <td className="py-2 px-3 text-center font-data-mono">{s.redCount}</td>
                        <td className="py-2 px-3 text-right font-data-mono font-bold">{s.negativeScore}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            /* Archive History */
            <div className="flex flex-col gap-5">
              {archivedWeeks.length === 0 ? (
                <div className="border border-on-surface/30 p-8 text-center font-data-mono text-sm text-on-surface-variant">
                  No archived weeks yet.
                </div>
              ) : (
                archivedWeeks.map(([week, items]) => (
                  <div key={week} className="border border-on-surface flex flex-col">
                    <div className="flex items-center justify-between border-b border-on-surface px-3 py-2">
                      <h4 className="font-label-sm text-xs uppercase text-on-surface">{week}</h4>
                      <span className="font-data-mono text-[11px] text-on-surface-variant">
                        Archived {formatDMY(items[0]?.archivedAt?.slice(0, 10))}
                      </span>
                    </div>

                    <div className="w-full overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse min-w-[640px]">
                        <thead className="font-label-sm text-[10px] uppercase text-on-surface-variant border-b border-on-surface/40">
                          <tr>
                            <th className="p-2 font-normal">Employee</th>
                            <th className="p-2 font-normal text-center">Assigned</th>
                            <th className="p-2 font-normal text-center">On Time</th>
                            <th className="p-2 font-normal text-center">Late Done</th>
                            <th className="p-2 font-normal text-center">Not Done</th>
                            <th className="p-2 font-normal text-right">Score</th>
                            <th className="p-2 font-normal">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((row) => (
                            <tr key={row.id} className="border-b border-on-surface/15">
                              <td className="p-2">{row.employeeName}</td>
                              <td className="p-2 text-center font-data-mono">{row.assignedTasks}</td>
                              <td className="p-2 text-center font-data-mono">{row.greenCount}</td>
                              <td className="p-2 text-center font-data-mono">{row.yellowCount}</td>
                              <td className="p-2 text-center font-data-mono">{row.redCount}</td>
                              <td className="p-2 text-right font-data-mono font-bold">{toNegative(row.performanceScore)}%</td>
                              <td className="p-2 text-on-surface-variant">{row.managerRemarks || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </main>
      </div>

      {/* Archive Modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl bg-surface border border-on-surface flex flex-col">
            <div className="flex items-center justify-between border-b border-on-surface px-3 py-2">
              <h3 className="font-label-sm uppercase text-xs">Archive Week</h3>
              <button onClick={() => setShowArchiveModal(false)} className="font-label-sm text-xs uppercase hover:underline cursor-pointer">Close</button>
            </div>

            <div className="p-4 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
              <div className="flex flex-wrap items-center gap-3 font-data-mono text-xs text-on-surface-variant">
                <span className="text-on-surface">{weekLabel}</span>
                <span>Late Done Penalty {lateWeight}%</span>
              </div>

              <div className="flex flex-col gap-2">
                {dgmaxSummary?.summaries.map((s) => (
                  <div key={s.doerId} className="flex flex-col gap-1 border border-on-surface/25 p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span>{s.doerName}</span>
                      <span className="font-data-mono text-on-surface-variant">
                        {s.greenCount} / {s.yellowCount} / {s.redCount} &nbsp;·&nbsp; <span className="text-on-surface font-bold">{s.negativeScore}%</span>
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      value={remarksMap[s.doerId] || ""}
                      onChange={(e) => setRemarksMap((prev) => ({ ...prev, [s.doerId]: e.target.value }))}
                      placeholder="Manager remarks…"
                      className="border border-on-surface/40 bg-background p-1.5 text-xs font-body-md focus:outline-none w-full"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-on-surface/30">
                <button onClick={() => setShowArchiveModal(false)} className="px-3 py-1.5 border border-on-surface font-label-sm text-xs uppercase hover:bg-surface-container transition-colors cursor-pointer">Cancel</button>
                <button disabled={archiving} onClick={handleArchiveSubmit} className="px-3 py-1.5 bg-on-surface text-surface border border-on-surface font-label-sm text-xs uppercase transition-colors cursor-pointer disabled:opacity-50">
                  {archiving ? "Archiving…" : "Archive"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function TeamPerformancePage() {
  return (
    <AuthGuard>
      <TeamPerformanceInner />
    </AuthGuard>
  );
}
