"use client";

import { useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import Stat from "@/components/Stat";
import { api, ApiError } from "@/lib/api";
import { formatDMY, formatPct } from "@/lib/format";
import { mondayOf, sundayOf, addDays } from "@/lib/week";
import type { DgmaxWeeklySummary } from "@/lib/types";

function TeamPerformanceInner() {
  const [dgmaxSummary, setDgmaxSummary] = useState<DgmaxWeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Monday of the currently-selected week. Week always runs Monday -> Sunday.
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const weekEnd = sundayOf(weekStart);

  async function loadData(from: string, to: string) {
    setLoading(true);
    setError(null);
    try {
      const summaryData = await api.get<DgmaxWeeklySummary>(`/performance/dgmax?from=${from}&to=${to}`);
      setDgmaxSummary(summaryData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load performance data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadData(weekStart, weekEnd);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  function goToWeek(offsetWeeks: number) {
    setWeekStart((prev) => addDays(prev, offsetWeeks * 7));
  }

  const weekLabel = dgmaxSummary?.weekLabel || `${formatDMY(weekStart)} to ${formatDMY(weekEnd)}`;
  const lateWeight = dgmaxSummary?.lateDoneWeight ?? 60;

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

  function exportCSV() {
    const headers = ["Week", "Rank", "Employee Name", "Assigned", "On Time", "Late Done", "Not Done", "Score"];
    const rows = (dgmaxSummary?.summaries ?? []).map((s, i) => [
      weekLabel, i + 1, s.doerName,
      s.assignedTasks, s.greenCount, s.yellowCount, s.redCount, s.negativeScore,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map((e) => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `performance-${weekStart}-to-${weekEnd}.csv`);
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
          <button onClick={exportCSV} className="px-3 py-1.5 border border-on-surface bg-surface font-label-sm text-xs uppercase hover:bg-surface-container transition-colors cursor-pointer">
            Export CSV
          </button>
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-4 max-w-full overflow-hidden">
          {/* Week Selector */}
          <div className="flex flex-wrap items-center gap-2 border border-on-surface/30 px-3 py-2">
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

          {error && <p className="font-label-sm text-label-sm text-error border border-error px-3 py-2">{error}</p>}

          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <Stat label="Team Score" value={formatPct(totals.negativeScore)} />
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
                    <td className="py-2 px-3 text-right font-data-mono font-bold">{formatPct(s.negativeScore)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
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
