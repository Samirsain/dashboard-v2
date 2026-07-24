"use client";

import { useEffect, useState, useMemo } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import InitialsAvatar from "@/components/InitialsAvatar";
import { api, ApiError } from "@/lib/api";
import { formatDMY } from "@/lib/format";
import type { Task, Doer, DgmaxWeeklySummary, TaskScoreCategory } from "@/lib/types";

function getTodayIso() {
  const formatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
  return formatter.format(new Date());
}

function getTaskCategory(task: Task, todayIso: string): TaskScoreCategory {
  const isCompleted = task.status === "Completed";
  const isCancelled = task.status === "Cancelled";
  if (isCancelled) return "Pending";
  if (!isCompleted) {
    if (task.dueDate && task.dueDate < todayIso) return "Red";
    return "Pending";
  }
  const completedDate = task.updatedAt ? task.updatedAt.slice(0, 10) : todayIso;
  if (task.dueDate && completedDate > task.dueDate) return "Red";
  if (task.revisionCount > 0) return "Yellow";
  return "Green";
}

function ScoreBadge({ score }: { score: number }) {
  const grade =
    score >= 90 ? { label: "Excellent", color: "text-emerald-700 bg-emerald-100 border-emerald-500" }
    : score >= 70 ? { label: "Good", color: "text-blue-700 bg-blue-100 border-blue-500" }
    : score >= 50 ? { label: "Average", color: "text-amber-700 bg-amber-100 border-amber-500" }
    : { label: "Poor", color: "text-rose-700 bg-rose-100 border-rose-500" };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 border font-bold font-data-mono text-sm ${grade.color}`}>
      {score}% <span className="text-[10px] font-label-sm uppercase opacity-75">{grade.label}</span>
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 90 ? "bg-emerald-500"
    : score >= 70 ? "bg-blue-500"
    : score >= 50 ? "bg-amber-500"
    : "bg-rose-500";

  return (
    <div className="w-full bg-surface-variant h-1.5 rounded-full overflow-hidden mt-1">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
    </div>
  );
}

function CategoryBadge({ category }: { category: TaskScoreCategory }) {
  if (category === "Green") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-900 border border-emerald-500 font-label-sm text-xs font-bold uppercase rounded-sm">
        <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
        Green
      </span>
    );
  }
  if (category === "Yellow") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-500 font-label-sm text-xs font-bold uppercase rounded-sm">
        <span className="w-2 h-2 rounded-full bg-amber-600"></span>
        Yellow
      </span>
    );
  }
  if (category === "Red") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-100 text-rose-900 border border-rose-500 font-label-sm text-xs font-bold uppercase rounded-sm">
        <span className="w-2 h-2 rounded-full bg-rose-600"></span>
        Red
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-400 font-label-sm text-xs font-medium uppercase rounded-sm">
      <span className="w-2 h-2 rounded-full bg-slate-400"></span>
      Pending
    </span>
  );
}

function PerformanceInner() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [doers, setDoers] = useState<Doer[]>([]);
  const [dgmaxSummary, setDgmaxSummary] = useState<DgmaxWeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [taskData, doerData, summaryData] = await Promise.all([
          api.get<Task[]>("/tasks"),
          api.get<Doer[]>("/users"),
          api.get<DgmaxWeeklySummary>("/performance/dgmax"),
        ]);
        setTasks(taskData);
        setDoers(doerData);
        setDgmaxSummary(summaryData);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load performance data.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const todayIso = getTodayIso();

  const categorizedTasks = useMemo(() => {
    return tasks.map((t) => ({
      ...t,
      scoreCategory: getTaskCategory(t, todayIso),
    }));
  }, [tasks, todayIso]);

  const filteredTasks = useMemo(() => {
    return categorizedTasks.filter((t) => {
      const matchSearch =
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.doer?.name ?? "").toLowerCase().includes(search.toLowerCase());
      const matchCat = categoryFilter === "ALL" || t.scoreCategory === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [categorizedTasks, search, categoryFilter]);

  const totals = dgmaxSummary?.totals ?? {
    assigned: tasks.length,
    completed: tasks.filter((t) => t.status === "Completed").length,
    green: categorizedTasks.filter((t) => t.scoreCategory === "Green").length,
    yellow: categorizedTasks.filter((t) => t.scoreCategory === "Yellow").length,
    red: categorizedTasks.filter((t) => t.scoreCategory === "Red").length,
    pending: categorizedTasks.filter((t) => t.scoreCategory === "Pending").length,
    performanceScore: 0,
  };

  return (
    <>
      <MobileHeader />
      <SideNav active="dashboard" />

      <main className="flex-1 md:ml-64 p-4 md:p-container-padding flex flex-col gap-6 max-w-[1440px] mx-auto w-full">
        {/* Page Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-on-surface pb-4">
          <div>
            <h2 className="font-headline-xl text-headline-xl text-on-surface uppercase font-black tracking-tight">
              DGMAX Task Performance Module
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              Category-Based Performance Tracking · Green / Yellow / Red + Numerical Score
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-surface-container border-2 border-on-surface font-data-mono text-xs uppercase text-on-surface font-bold">
              {dgmaxSummary?.weekLabel || "Current Week"}
            </span>
          </div>
        </header>

        {error && (
          <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">{error}</p>
        )}

        {/* TEAM Overall Score Card */}
        <section className="grid grid-cols-2 md:grid-cols-7 gap-3">
          {/* Score Card - prominent */}
          <div className="col-span-2 md:col-span-1 bg-on-surface text-surface p-4 flex flex-col justify-between">
            <span className="font-label-sm text-xs uppercase font-bold opacity-70">Team Score</span>
            <div>
              <div className="font-data-mono text-4xl font-black">{totals.performanceScore}%</div>
              <div className="text-[10px] uppercase opacity-60 mt-1">
                {totals.performanceScore >= 90 ? "Excellent"
                  : totals.performanceScore >= 70 ? "Good"
                  : totals.performanceScore >= 50 ? "Average"
                  : "Needs Improvement"}
              </div>
            </div>
          </div>

          <div className="bg-surface border-2 border-on-surface p-4 flex flex-col justify-between">
            <span className="font-label-sm text-xs text-on-surface-variant uppercase font-bold">Assigned</span>
            <div className="font-data-mono text-3xl font-black text-on-surface mt-2">{totals.assigned}</div>
          </div>

          <div className="bg-surface border-2 border-on-surface p-4 flex flex-col justify-between">
            <span className="font-label-sm text-xs text-on-surface-variant uppercase font-bold">Completed</span>
            <div className="font-data-mono text-3xl font-black text-on-surface mt-2">{totals.completed}</div>
          </div>

          <div className="bg-emerald-50 border-2 border-emerald-600 p-4 flex flex-col justify-between">
            <span className="font-label-sm text-xs text-emerald-900 uppercase font-bold">🟢 Green</span>
            <div>
              <div className="font-data-mono text-3xl font-black text-emerald-800">{totals.green}</div>
              <span className="text-[10px] text-emerald-700 font-medium">1st Time On-Time · 100pts</span>
            </div>
          </div>

          <div className="bg-amber-50 border-2 border-amber-600 p-4 flex flex-col justify-between">
            <span className="font-label-sm text-xs text-amber-900 uppercase font-bold">🟡 Yellow</span>
            <div>
              <div className="font-data-mono text-3xl font-black text-amber-800">{totals.yellow}</div>
              <span className="text-[10px] text-amber-700 font-medium">Revision Required · 50pts</span>
            </div>
          </div>

          <div className="bg-rose-50 border-2 border-rose-600 p-4 flex flex-col justify-between">
            <span className="font-label-sm text-xs text-rose-900 uppercase font-bold">🔴 Red</span>
            <div>
              <div className="font-data-mono text-3xl font-black text-rose-800">{totals.red}</div>
              <span className="text-[10px] text-rose-700 font-medium">Overdue / Late · 0pts</span>
            </div>
          </div>

          <div className="bg-slate-50 border-2 border-slate-500 p-4 flex flex-col justify-between">
            <span className="font-label-sm text-xs text-slate-800 uppercase font-bold">⚪ Pending</span>
            <div>
              <div className="font-data-mono text-3xl font-black text-slate-800">{totals.pending}</div>
              <span className="text-[10px] text-slate-600 font-medium">In Progress</span>
            </div>
          </div>
        </section>

        {/* Score Formula Note */}
        <div className="flex items-center gap-2 text-[11px] text-on-surface-variant font-data-mono border border-on-surface/30 px-3 py-2 bg-surface-container">
          <span className="font-bold uppercase text-on-surface">Score Formula:</span>
          <span>Score = ((Green × 100) + (Yellow × 50) + (Red × 0)) ÷ (Green + Yellow + Red) × 100</span>
          <span className="ml-auto opacity-60">Pending tasks excluded from scoring</span>
        </div>

        {/* Employee Performance Breakdown Table */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b-2 border-on-surface pb-2">
            <h3 className="font-headline-md text-headline-md text-on-surface uppercase font-bold">
              Employee Performance Scores
            </h3>
          </div>

          <div className="w-full overflow-x-auto bg-surface-container-lowest border-2 border-on-surface">
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead className="bg-surface-container text-on-surface font-label-sm text-xs uppercase border-b-2 border-on-surface">
                <tr>
                  <th className="py-3 px-4 border-r border-surface-variant">Employee</th>
                  <th className="py-3 px-4 border-r border-surface-variant">Department</th>
                  <th className="py-3 px-4 border-r border-surface-variant text-center">Assigned</th>
                  <th className="py-3 px-4 border-r border-surface-variant text-center text-emerald-800 font-bold bg-emerald-50/50">
                    🟢 Green
                  </th>
                  <th className="py-3 px-4 border-r border-surface-variant text-center text-amber-800 font-bold bg-amber-50/50">
                    🟡 Yellow
                  </th>
                  <th className="py-3 px-4 border-r border-surface-variant text-center text-rose-800 font-bold bg-rose-50/50">
                    🔴 Red
                  </th>
                  <th className="py-3 px-4 border-r border-surface-variant text-center text-slate-700 font-bold bg-slate-50/50">
                    ⚪ Pending
                  </th>
                  <th className="py-3 px-4 text-center bg-on-surface/5 font-bold text-on-surface uppercase">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody className="font-body-md text-sm text-on-surface">
                {loading && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center font-data-mono text-on-surface-variant">
                      Loading employee task scores...
                    </td>
                  </tr>
                )}
                {!loading && (dgmaxSummary?.summaries.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center font-data-mono text-on-surface-variant">
                      No active task scoring data.
                    </td>
                  </tr>
                )}
                {dgmaxSummary?.summaries.map((row) => (
                  <tr key={row.doerId} className="border-b border-surface-variant hover:bg-surface-container-low transition-colors">
                    <td className="py-3 px-4 border-r border-surface-variant font-bold">
                      <div className="flex items-center gap-2">
                        <InitialsAvatar name={row.doerName} className="w-7 h-7 text-xs border border-on-surface" />
                        <span>{row.doerName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-on-surface-variant">{row.department}</td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono font-bold">
                      {row.assignedTasks}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono font-bold text-emerald-700 bg-emerald-50/30">
                      {row.greenCount}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono font-bold text-amber-700 bg-amber-50/30">
                      {row.yellowCount}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono font-bold text-rose-700 bg-rose-50/30">
                      {row.redCount}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-slate-600 bg-slate-50/30">
                      {row.pendingCount}
                    </td>
                    <td className="py-3 px-4 bg-on-surface/5">
                      <div className="flex flex-col">
                        <ScoreBadge score={row.performanceScore} />
                        <ScoreBar score={row.performanceScore} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Detailed Task Lifecycle Table */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-on-surface pb-2">
            <h3 className="font-headline-md text-headline-md text-on-surface uppercase font-bold">
              Task Execution & Review List
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search task or doer..."
                className="border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-xs text-on-surface focus:outline-none min-w-[220px]"
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="border-2 border-on-surface bg-surface px-3 py-1.5 font-label-sm text-xs uppercase text-on-surface focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                <option value="Green">Green (First-time)</option>
                <option value="Yellow">Yellow (Revisions)</option>
                <option value="Red">Red (Overdue / Late)</option>
                <option value="Pending">Pending (In Progress)</option>
              </select>
            </div>
          </div>

          <div className="w-full overflow-x-auto bg-surface-container-lowest border-2 border-on-surface">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-surface-container text-on-surface font-label-sm text-xs uppercase border-b-2 border-on-surface">
                <tr>
                  <th className="py-3 px-4 border-r border-surface-variant">Task Title</th>
                  <th className="py-3 px-4 border-r border-surface-variant w-40">Assigned Doer</th>
                  <th className="py-3 px-4 border-r border-surface-variant w-32 text-center">Due Date</th>
                  <th className="py-3 px-4 border-r border-surface-variant w-28 text-center">Revisions</th>
                  <th className="py-3 px-4 border-r border-surface-variant w-32 text-center">Status</th>
                  <th className="py-3 px-4 w-36 text-center">DGMAX Category</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-sm text-on-surface">
                {loading && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center font-data-mono text-on-surface-variant">
                      Loading tasks...
                    </td>
                  </tr>
                )}
                {!loading && filteredTasks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center font-data-mono text-on-surface-variant">
                      No tasks found matching criteria.
                    </td>
                  </tr>
                )}
                {filteredTasks.map((t) => (
                  <tr key={t.id} className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors">
                    <td className="py-3 px-4 border-r border-surface-variant font-medium">{t.title}</td>
                    <td className="py-3 px-4 border-r border-surface-variant text-on-surface-variant">
                      {t.doer?.name ?? "—"}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono">
                      {formatDMY(t.dueDate)}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono">
                      {t.revisionCount > 0 ? (
                        <span className="font-bold text-amber-800 bg-amber-100 px-2 py-0.5 border border-amber-400">
                          {t.revisionCount}×
                        </span>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono">
                      {t.status}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <CategoryBadge category={t.scoreCategory} />
                    </td>
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
