"use client";

import { useEffect, useState, useMemo } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import InitialsAvatar from "@/components/InitialsAvatar";
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

function ScoreBadge({ score }: { score: number }) {
  const { label, color } =
    score >= 90 ? { label: "Green", color: "text-emerald-700 bg-emerald-100 border-emerald-500" }
    : score >= 70 ? { label: "Yellow", color: "text-amber-700 bg-amber-100 border-amber-500" }
    : score >= 50 ? { label: "Orange", color: "text-orange-700 bg-orange-100 border-orange-500" }
    : { label: "Red", color: "text-rose-700 bg-rose-100 border-rose-500" };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 border font-bold font-data-mono text-sm ${color}`}>
      {score}% <span className="text-[10px] font-label-sm uppercase opacity-75">{label}</span>
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 90 ? "bg-emerald-500"
    : score >= 70 ? "bg-amber-500"
    : score >= 50 ? "bg-orange-500"
    : "bg-rose-500";

  return (
    <div className="w-full bg-surface-variant h-1.5 rounded-full overflow-hidden mt-1">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
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

  async function handleArchiveSubmit() {
    setArchiving(true);
    try {
      const weekLabel = dgmaxSummary?.weekLabel || `${formatDMY(weekStart)} to ${formatDMY(weekEnd)}`;
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
    const headers = ["Week", "Employee Name", "Department", "Assigned", "On Time", "Late Done", "Not Done", "Negative Score", "Final Score", "Rank"];
    const rows = (dgmaxSummary?.summaries ?? []).map((s, i) => [
      dgmaxSummary?.weekLabel || `${weekStart} to ${weekEnd}`, s.doerName, s.department,
      s.assignedTasks, s.greenCount, s.yellowCount, s.redCount, s.negativeScore, s.performanceScore, i + 1,
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
        {/* Top Header */}
        <header className="hidden md:flex bg-surface w-full border-b-2 border-on-surface justify-between items-center h-16 px-container-padding sticky top-0 z-30">
          <div className="font-headline-md text-headline-md text-on-surface uppercase border-b-2 border-on-surface pb-1 font-black">
            📊 DGMAX Weekly Review & Team Performance
          </div>
          <div className="flex items-center gap-3">
            <button onClick={exportCSV} className="px-4 py-1.5 border-2 border-on-surface bg-surface font-label-sm text-xs uppercase hover:bg-surface-container transition-colors cursor-pointer font-bold">
              Export CSV
            </button>
            {user?.role === "Admin" && (
              <button onClick={() => setShowArchiveModal(true)} className="px-4 py-1.5 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-xs uppercase hover:bg-primary transition-colors cursor-pointer font-bold">
                Archive Week
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-lg max-w-full overflow-hidden">
          {/* Week Selector + Late Weight Admin Setting */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border-2 border-on-surface p-3">
            <div className="flex items-center gap-2">
              <button onClick={() => goToWeek(-1)} className="px-3 py-1.5 border-2 border-on-surface bg-surface font-label-sm text-xs uppercase hover:bg-surface-container transition-colors cursor-pointer font-bold">
                ← Prev Week
              </button>
              <button onClick={() => setWeekStart(mondayOf())} className="px-3 py-1.5 border-2 border-on-surface bg-surface font-label-sm text-xs uppercase hover:bg-surface-container transition-colors cursor-pointer font-bold">
                This Week
              </button>
              <button onClick={() => goToWeek(1)} className="px-3 py-1.5 border-2 border-on-surface bg-surface font-label-sm text-xs uppercase hover:bg-surface-container transition-colors cursor-pointer font-bold">
                Next Week →
              </button>
              <div className="flex items-center gap-2 ml-2">
                <label className="font-label-sm text-[10px] uppercase font-bold text-on-surface-variant">Jump to week of:</label>
                <input
                  type="date"
                  value={weekStart}
                  onChange={(e) => e.target.value && setWeekStart(mondayOf(e.target.value))}
                  className="border-2 border-on-surface bg-surface px-2 py-1 font-data-mono text-xs text-on-surface focus:outline-none"
                />
              </div>
              <span className="font-data-mono text-sm font-bold ml-2">
                {formatDMY(weekStart)} — {formatDMY(weekEnd)} (Mon–Sun)
              </span>
            </div>

            {user?.role === "Admin" && (
              <div className="flex items-center gap-2">
                <label className="font-label-sm text-[10px] uppercase font-bold text-on-surface-variant">Late Done Weight:</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={lateWeightDraft}
                  onChange={(e) => setLateWeightDraft(e.target.value)}
                  className="border-2 border-on-surface bg-surface px-2 py-1 w-16 font-data-mono text-xs text-on-surface focus:outline-none"
                />
                <span className="font-data-mono text-xs">%</span>
                <button onClick={applyLateWeight} className="px-3 py-1.5 border-2 border-on-surface bg-surface font-label-sm text-xs uppercase hover:bg-surface-container transition-colors cursor-pointer font-bold">
                  Apply
                </button>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center justify-between border-b-2 border-on-surface pb-2">
            <div className="flex gap-2">
              <button onClick={() => setActiveTab("current")} className={`px-4 py-2 border-2 border-on-surface font-label-sm text-xs uppercase font-bold transition-colors cursor-pointer ${activeTab === "current" ? "bg-on-surface text-surface" : "text-on-surface hover:bg-surface-container"}`}>
                Selected Week ({dgmaxSummary?.weekLabel || `${formatDMY(weekStart)} to ${formatDMY(weekEnd)}`})
              </button>
              <button onClick={() => setActiveTab("archive")} className={`px-4 py-2 border-2 border-on-surface font-label-sm text-xs uppercase font-bold transition-colors cursor-pointer ${activeTab === "archive" ? "bg-on-surface text-surface" : "text-on-surface hover:bg-surface-container"}`}>
                Archive History ({archivedWeeks.length} Weeks)
              </button>
            </div>
          </div>

          {error && <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">{error}</p>}

          {activeTab === "current" ? (
            <>
              {/* Score + Category Cards */}
              <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
                <div className="col-span-2 md:col-span-1 bg-on-surface text-surface p-4 flex flex-col justify-between">
                  <span className="font-label-sm text-xs uppercase font-bold opacity-70">Team Score</span>
                  <div>
                    <div className="font-data-mono text-4xl font-black">{totals.performanceScore}%</div>
                    <div className="text-[10px] uppercase opacity-60 mt-1">
                      {totals.performanceScore >= 90 ? "Green" : totals.performanceScore >= 70 ? "Yellow" : totals.performanceScore >= 50 ? "Orange" : "Red"}
                    </div>
                  </div>
                </div>
                <div className="bg-surface border-2 border-on-surface p-4 flex flex-col justify-between">
                  <span className="font-label-sm text-xs text-on-surface-variant uppercase font-bold">Assigned</span>
                  <div className="font-data-mono text-2xl font-bold text-on-surface mt-1">{totals.assigned}</div>
                </div>
                <div className="bg-surface border-2 border-on-surface p-4 flex flex-col justify-between">
                  <span className="font-label-sm text-xs text-on-surface-variant uppercase font-bold">Completed</span>
                  <div className="font-data-mono text-2xl font-bold text-on-surface mt-1">{totals.completed}</div>
                </div>
                <div className="bg-emerald-50 border-2 border-emerald-600 p-4 flex flex-col justify-between">
                  <span className="font-label-sm text-xs text-emerald-900 uppercase font-bold">🟢 On Time</span>
                  <div className="font-data-mono text-2xl font-bold text-emerald-800 mt-1">{totals.green}</div>
                </div>
                <div className="bg-amber-50 border-2 border-amber-600 p-4 flex flex-col justify-between">
                  <span className="font-label-sm text-xs text-amber-900 uppercase font-bold">🟡 Late Done</span>
                  <div className="font-data-mono text-2xl font-bold text-amber-800 mt-1">{totals.yellow}</div>
                </div>
                <div className="bg-rose-50 border-2 border-rose-600 p-4 flex flex-col justify-between">
                  <span className="font-label-sm text-xs text-rose-900 uppercase font-bold">🔴 Not Done</span>
                  <div className="font-data-mono text-2xl font-bold text-rose-800 mt-1">{totals.red}</div>
                </div>
                <div className="bg-slate-50 border-2 border-slate-500 p-4 flex flex-col justify-between">
                  <span className="font-label-sm text-xs text-slate-800 uppercase font-bold">⚪ Not Yet Due</span>
                  <div className="font-data-mono text-2xl font-bold text-slate-800 mt-1">{totals.pending}</div>
                </div>
              </div>

              {/* Score Formula */}
              <div className="flex flex-col gap-1 text-[11px] text-on-surface-variant font-data-mono border border-on-surface/30 px-3 py-2 bg-surface-container">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold uppercase text-on-surface">Per Task % =</span>
                  <span>100 ÷ Assigned Tasks</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold uppercase text-on-surface">Negative Score =</span>
                  <span>-((Not Done × Per Task %) + (Late Done × Per Task % × {lateWeight}%))</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold uppercase text-on-surface">Final Score =</span>
                  <span>100 + Negative Score (clamped 0–100)</span>
                  <span className="ml-auto opacity-60">Not-yet-due tasks excluded from scoring</span>
                </div>
              </div>

              {/* DGMAX Employee Table */}
              <div className="bg-surface-container-lowest border-2 border-on-surface overflow-x-auto max-w-full">
                <table className="w-full text-left border-collapse min-w-[960px]">
                  <thead className="bg-surface-container text-on-surface font-label-sm text-xs uppercase border-b-2 border-on-surface">
                    <tr>
                      <th className="py-3 px-4 border-r border-surface-variant text-center">Rank</th>
                      <th className="py-3 px-4 border-r border-surface-variant">Employee Name</th>
                      <th className="py-3 px-4 border-r border-surface-variant">Department</th>
                      <th className="py-3 px-4 border-r border-surface-variant text-center">Assigned</th>
                      <th className="py-3 px-4 border-r border-surface-variant text-center text-emerald-800 font-bold bg-emerald-50/50">🟢 On Time</th>
                      <th className="py-3 px-4 border-r border-surface-variant text-center text-amber-800 font-bold bg-amber-50/50">🟡 Late Done</th>
                      <th className="py-3 px-4 border-r border-surface-variant text-center text-rose-800 font-bold bg-rose-50/50">🔴 Not Done</th>
                      <th className="py-3 px-4 border-r border-surface-variant text-center text-slate-700 font-bold bg-slate-50/50">Negative Score</th>
                      <th className="py-3 px-4 text-center bg-on-surface/5 font-bold text-on-surface uppercase">Final Score</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-md text-sm">
                    {loading && (
                      <tr><td colSpan={9} className="py-6 text-center font-data-mono">Loading weekly summary...</td></tr>
                    )}
                    {!loading && (dgmaxSummary?.summaries.length ?? 0) === 0 && (
                      <tr><td colSpan={9} className="py-6 text-center font-data-mono">No active doers found.</td></tr>
                    )}
                    {dgmaxSummary?.summaries.map((s, i) => (
                      <tr key={s.doerId} className="border-b border-surface-variant hover:bg-surface-container-low transition-colors">
                        <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono font-bold">{i + 1}</td>
                        <td className="py-3 px-4 border-r border-surface-variant font-bold">
                          <div className="flex items-center gap-2">
                            <InitialsAvatar name={s.doerName} className="w-7 h-7 text-xs border border-on-surface" />
                            <span>{s.doerName}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 border-r border-surface-variant text-on-surface-variant">{s.department}</td>
                        <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono font-bold">{s.assignedTasks}</td>
                        <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono font-bold text-emerald-700 bg-emerald-50/30">{s.greenCount}</td>
                        <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono font-bold text-amber-700 bg-amber-50/30">{s.yellowCount}</td>
                        <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono font-bold text-rose-700 bg-rose-50/30">{s.redCount}</td>
                        <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-slate-600 bg-slate-50/30">{s.negativeScore}%</td>
                        <td className="py-3 px-4 bg-on-surface/5">
                          <div className="flex flex-col">
                            <ScoreBadge score={s.performanceScore} />
                            <ScoreBar score={s.performanceScore} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            /* Archive History Tab */
            <div className="flex flex-col gap-6">
              {archivedWeeks.length === 0 ? (
                <div className="bg-surface border-2 border-on-surface p-8 text-center font-data-mono text-on-surface-variant">
                  No archived weeks yet. Click &quot;Archive Week&quot; to lock in weekly performance.
                </div>
              ) : (
                archivedWeeks.map(([week, items]) => (
                  <div key={week} className="bg-surface border-2 border-on-surface p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-on-surface pb-2">
                      <h4 className="font-headline-md text-headline-md uppercase font-bold text-on-surface">
                        Week: {week}
                      </h4>
                      <span className="font-data-mono text-xs text-on-surface-variant">
                        Archived: {formatDMY(items[0]?.archivedAt?.slice(0, 10))}
                      </span>
                    </div>

                    <div className="w-full overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-surface-container font-label-sm uppercase border-b border-on-surface">
                          <tr>
                            <th className="p-2 border-r border-surface-variant">Employee</th>
                            <th className="p-2 border-r border-surface-variant text-center">Assigned</th>
                            <th className="p-2 border-r border-surface-variant text-center text-emerald-800 font-bold">🟢 On Time</th>
                            <th className="p-2 border-r border-surface-variant text-center text-amber-800 font-bold">🟡 Late Done</th>
                            <th className="p-2 border-r border-surface-variant text-center text-rose-800 font-bold">🔴 Not Done</th>
                            <th className="p-2 border-r border-surface-variant text-center bg-on-surface/5 font-bold">Score</th>
                            <th className="p-2">Manager Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((row) => (
                            <tr key={row.id} className="border-b border-surface-variant">
                              <td className="p-2 border-r border-surface-variant font-bold">{row.employeeName}</td>
                              <td className="p-2 border-r border-surface-variant text-center font-data-mono">{row.assignedTasks}</td>
                              <td className="p-2 border-r border-surface-variant text-center font-data-mono font-bold text-emerald-700">{row.greenCount}</td>
                              <td className="p-2 border-r border-surface-variant text-center font-data-mono font-bold text-amber-700">{row.yellowCount}</td>
                              <td className="p-2 border-r border-surface-variant text-center font-data-mono font-bold text-rose-700">{row.redCount}</td>
                              <td className="p-2 border-r border-surface-variant bg-on-surface/5">
                                <ScoreBadge score={row.performanceScore} />
                              </td>
                              <td className="p-2 italic text-on-surface-variant">{row.managerRemarks || "—"}</td>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl bg-surface-container-lowest border-2 border-on-surface flex flex-col">
            <div className="flex items-center justify-between border-b-2 border-on-surface p-3 bg-surface">
              <h3 className="font-headline-md uppercase text-sm font-bold">Weekly Performance Review & Archive</h3>
              <button onClick={() => setShowArchiveModal(false)} className="font-label-sm text-xs uppercase hover:underline cursor-pointer">Close</button>
            </div>

            <div className="p-4 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center gap-3">
                <label className="font-label-sm text-xs uppercase font-bold">Week:</label>
                <span className="border-2 border-on-surface bg-surface px-3 py-1 font-data-mono text-sm text-on-surface">
                  {dgmaxSummary?.weekLabel || `${formatDMY(weekStart)} to ${formatDMY(weekEnd)}`}
                </span>
                <span className="font-label-sm text-xs text-on-surface-variant">Late Done Weight: {lateWeight}%</span>
              </div>

              <div className="flex flex-col gap-3">
                <h4 className="font-label-sm text-xs uppercase font-bold border-b border-on-surface pb-1">Manager Remarks per Employee:</h4>
                {dgmaxSummary?.summaries.map((s) => (
                  <div key={s.doerId} className="flex flex-col gap-1 border border-on-surface/40 p-2 bg-surface">
                    <div className="flex items-center justify-between font-bold text-xs">
                      <span>{s.doerName} ({s.department})</span>
                      <div className="flex items-center gap-3">
                        <span className="font-data-mono text-[11px] text-on-surface-variant">
                          🟢 {s.greenCount} | 🟡 {s.yellowCount} | 🔴 {s.redCount}
                        </span>
                        <span className="font-data-mono font-black text-sm">
                          Score: {s.performanceScore}%
                        </span>
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      value={remarksMap[s.doerId] || ""}
                      onChange={(e) => setRemarksMap((prev) => ({ ...prev, [s.doerId]: e.target.value }))}
                      placeholder={`Add manager remarks for ${s.doerName}...`}
                      className="border border-on-surface bg-background p-1.5 text-xs font-body-md focus:outline-none w-full"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-on-surface">
                <button onClick={() => setShowArchiveModal(false)} className="px-4 py-2 border-2 border-on-surface font-label-sm text-xs uppercase hover:bg-surface-container transition-colors cursor-pointer font-bold">Cancel</button>
                <button disabled={archiving} onClick={handleArchiveSubmit} className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-xs uppercase hover:bg-primary transition-colors cursor-pointer font-bold disabled:opacity-50">
                  {archiving ? "Archiving..." : "Archive & Lock Week"}
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
