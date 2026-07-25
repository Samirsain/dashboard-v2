"use client";

import { useEffect, useState, useMemo } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { formatDMY } from "@/lib/format";
import { mondayOf, sundayOf, addDays, todayIso } from "@/lib/week";
import { getTaskCategory, CATEGORY_LABEL } from "@/lib/scoring";
import type { Task, DgmaxWeeklySummary, TaskScoreCategory } from "@/lib/types";

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col gap-1 border border-on-surface/25 px-3 py-2">
      <span className="font-label-sm text-[10px] uppercase tracking-wide text-on-surface-variant">{label}</span>
      <span className="font-data-mono text-lg font-bold text-on-surface">{value}</span>
    </div>
  );
}

function PerformanceInner() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dgmaxSummary, setDgmaxSummary] = useState<DgmaxWeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const weekEnd = sundayOf(weekStart);
  const today = todayIso();

  async function load(from: string, to: string) {
    setLoading(true);
    setError(null);
    try {
      const [taskData, summaryData] = await Promise.all([
        api.get<Task[]>("/tasks"),
        api.get<DgmaxWeeklySummary>(`/performance/dgmax?from=${from}&to=${to}`),
      ]);
      setTasks(taskData);
      setDgmaxSummary(summaryData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load performance data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      load(weekStart, weekEnd);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  function goToWeek(offsetWeeks: number) {
    setWeekStart((prev) => addDays(prev, offsetWeeks * 7));
  }

  // Only the tasks the selected week actually scores, so the list below always
  // reconciles with the scoreboard above.
  const weekTasks = useMemo(() => {
    return tasks
      .filter((t) => t.dueDate >= weekStart && t.dueDate <= weekEnd)
      .map((t) => ({ ...t, scoreCategory: getTaskCategory(t, today) }))
      .filter((t): t is Task & { scoreCategory: TaskScoreCategory } => t.scoreCategory !== null);
  }, [tasks, weekStart, weekEnd, today]);

  const filteredTasks = useMemo(() => {
    const q = search.toLowerCase();
    return weekTasks.filter((t) => {
      const matchSearch =
        !q || t.title.toLowerCase().includes(q) || (t.doer?.name ?? "").toLowerCase().includes(q);
      const matchCat = categoryFilter === "ALL" || t.scoreCategory === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [weekTasks, search, categoryFilter]);

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

  return (
    <>
      <MobileHeader />
      <SideNav active="dashboard" />

      <main className="flex-1 md:ml-64 p-4 md:p-container-padding flex flex-col gap-4 max-w-[1440px] mx-auto w-full">
        <header className="border-b border-on-surface pb-3">
          <h2 className="font-headline-md text-headline-md text-on-surface uppercase font-bold">
            Performance
          </h2>
        </header>

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
          <Stat label="Team Score" value={`${totals.negativeScore}%`} />
          <Stat label="Assigned" value={totals.assigned} />
          <Stat label="On Time" value={totals.green} />
          <Stat label="Late Done" value={totals.yellow} />
          <Stat label="Not Done" value={totals.red} />
          <Stat label="Not Yet Due" value={totals.pending} />
        </div>

        <p className="text-[11px] text-on-surface-variant font-data-mono border border-on-surface/25 px-3 py-2 leading-relaxed">
          Per Task % = 100 ÷ Assigned &nbsp;·&nbsp; Score = −((Not Done × Per Task %) + (Late Done × Per Task % × {dgmaxSummary?.lateDoneWeight ?? 60}%))
          <br />
          <span className="opacity-70">0% is a perfect week; the score only goes down from there. Tasks not yet due are excluded.</span>
        </p>

        {/* Employee Scoreboard */}
        <section className="flex flex-col gap-2">
          <h3 className="font-label-sm text-xs uppercase text-on-surface-variant">Employee Scores</h3>
          <div className="border border-on-surface overflow-x-auto">
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
              <tbody className="font-body-md text-sm text-on-surface">
                {loading && (
                  <tr><td colSpan={7} className="py-6 text-center font-data-mono text-on-surface-variant">Loading…</td></tr>
                )}
                {!loading && (dgmaxSummary?.summaries.length ?? 0) === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center font-data-mono text-on-surface-variant">No data for this week.</td></tr>
                )}
                {dgmaxSummary?.summaries.map((row, i) => (
                  <tr key={row.doerId} className="border-b border-on-surface/15 hover:bg-surface-container-low transition-colors">
                    <td className="py-2 px-3 text-center font-data-mono text-on-surface-variant">{i + 1}</td>
                    <td className="py-2 px-3">{row.doerName}</td>
                    <td className="py-2 px-3 text-center font-data-mono">{row.assignedTasks}</td>
                    <td className="py-2 px-3 text-center font-data-mono">{row.greenCount}</td>
                    <td className="py-2 px-3 text-center font-data-mono">{row.yellowCount}</td>
                    <td className="py-2 px-3 text-center font-data-mono">{row.redCount}</td>
                    <td className="py-2 px-3 text-right font-data-mono font-bold">{row.negativeScore}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Task-level detail */}
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-label-sm text-xs uppercase text-on-surface-variant">
              Tasks This Week ({filteredTasks.length})
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search task or doer…"
                className="border border-on-surface bg-surface px-2 py-1 font-data-mono text-xs text-on-surface focus:outline-none min-w-[200px]"
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="border border-on-surface bg-surface px-2 py-1 font-label-sm text-xs uppercase text-on-surface focus:outline-none"
              >
                <option value="ALL">All</option>
                <option value="Green">On Time</option>
                <option value="Yellow">Late Done</option>
                <option value="Red">Not Done</option>
                <option value="Pending">Not Yet Due</option>
              </select>
            </div>
          </div>

          <div className="border border-on-surface overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead className="font-label-sm text-[11px] uppercase text-on-surface-variant border-b border-on-surface">
                <tr>
                  <th className="py-2 px-3 font-normal">Task</th>
                  <th className="py-2 px-3 font-normal w-40">Doer</th>
                  <th className="py-2 px-3 font-normal w-28 text-center">Due Date</th>
                  <th className="py-2 px-3 font-normal w-28 text-center">Status</th>
                  <th className="py-2 px-3 font-normal w-32 text-right">Category</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-sm text-on-surface">
                {loading && (
                  <tr><td colSpan={5} className="py-6 text-center font-data-mono text-on-surface-variant">Loading…</td></tr>
                )}
                {!loading && filteredTasks.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center font-data-mono text-on-surface-variant">No tasks for this week.</td></tr>
                )}
                {filteredTasks.map((t) => (
                  <tr key={t.id} className="border-b border-on-surface/15 last:border-b-0 hover:bg-surface-container-low transition-colors">
                    <td className="py-2 px-3">{t.title}</td>
                    <td className="py-2 px-3 text-on-surface-variant">{t.doer?.name ?? "—"}</td>
                    <td className="py-2 px-3 text-center font-data-mono">{formatDMY(t.dueDate)}</td>
                    <td className="py-2 px-3 text-center font-data-mono text-on-surface-variant">{t.status}</td>
                    <td className="py-2 px-3 text-right font-label-sm text-xs uppercase">{CATEGORY_LABEL[t.scoreCategory]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

export default function PerformancePage() {
  return (
    <AuthGuard>
      <PerformanceInner />
    </AuthGuard>
  );
}
