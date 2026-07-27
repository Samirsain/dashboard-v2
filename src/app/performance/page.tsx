"use client";

import { useEffect, useState, useMemo } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import Stat from "@/components/Stat";
import {
  Button,
  Card,
  ErrorNote,
  PageBody,
  PageHeader,
  StateRow,
  TableWrap,
  Toolbar,
  fieldInlineClass,
  tableClass,
  tdClass,
  thClass,
  theadClass,
  trClass,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDMY, formatPct } from "@/lib/format";
import { mondayOf, sundayOf, addDays, todayIso } from "@/lib/week";
import { getTaskCategory, CATEGORY_LABEL } from "@/lib/scoring";
import type { Task, DgmaxWeeklySummary, TaskScoreCategory } from "@/lib/types";

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

      <PageBody>
        <PageHeader title="Performance" />

        {/* Week Selector */}
        <Toolbar>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => goToWeek(-1)} aria-label="Previous week">← Prev</Button>
            <Button size="sm" onClick={() => setWeekStart(mondayOf())}>This Week</Button>
            <Button size="sm" onClick={() => goToWeek(1)} aria-label="Next week">Next →</Button>
          </div>
          <input
            type="date"
            aria-label="Jump to week"
            value={weekStart}
            onChange={(e) => e.target.value && setWeekStart(mondayOf(e.target.value))}
            className={`${fieldInlineClass} font-data-mono text-xs`}
          />
          <span className="font-data-mono text-xs text-on-surface sm:text-sm">
            {formatDMY(weekStart)} — {formatDMY(weekEnd)} <span className="text-on-surface-variant">(Mon–Sun)</span>
          </span>
        </Toolbar>

        {error && <ErrorNote>{error}</ErrorNote>}

        {/* Summary */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Team Avg Score" value={formatPct(totals.negativeScore)} />
          <Stat label="Total Work" value={totals.assigned} />
          <Stat label="On Time" value={totals.green} />
          <Stat label="Late Done" value={totals.yellow} />
          <Stat label="Not Done" value={totals.red} />
          <Stat label="Not Yet Due" value={totals.pending} />
        </div>

        <p className="border border-on-surface/25 px-3 py-2 font-data-mono text-[11px] leading-relaxed text-on-surface-variant">
          Task Score = −((Not Done × Per Task %) + (Late Done × Per Task % × {dgmaxSummary?.lateDoneWeight ?? 60}%))
          &nbsp;·&nbsp;
          Checklist Score = −Per-Day Late Penalty (33%/day late, capped at 80%)
          <br />
          <strong className="text-on-surface">Final Doer Score = Average(Task Score, Checklist Score)</strong>
        </p>

        {/* Employee Scoreboard */}
        <Card title="Employee Scores (Task + Checklist Average)" bodyClassName="">
          <TableWrap className="border-0">
            <table className={`${tableClass} min-w-[720px]`}>
              <thead className={theadClass}>
                <tr>
                  <th className={`${thClass} w-10 text-center`}>#</th>
                  <th className={thClass}>Employee</th>
                  <th className={`${thClass} text-center`}>Tasks (Done/Assigned)</th>
                  <th className={`${thClass} text-center`}>Task Score</th>
                  <th className={`${thClass} text-center`}>Checklists (Done/Assigned)</th>
                  <th className={`${thClass} text-center`}>Checklist Score</th>
                  <th className={`${thClass} text-right`}>Avg Score</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {loading && <StateRow colSpan={7}>Loading…</StateRow>}
                {!loading && (dgmaxSummary?.summaries.length ?? 0) === 0 && (
                  <StateRow colSpan={7}>No data for this week.</StateRow>
                )}
                {!loading && dgmaxSummary?.summaries.map((row, i) => (
                  <tr key={row.doerId} className={trClass}>
                    <td className={`${tdClass} text-center font-data-mono text-on-surface-variant`}>{i + 1}</td>
                    <td className={tdClass}>{row.doerName}</td>
                    <td className={`${tdClass} text-center font-data-mono`}>{row.completedTasks}/{row.assignedTasks}</td>
                    <td className={`${tdClass} text-center font-data-mono`}>{formatPct(row.taskScore ?? 0)}</td>
                    <td className={`${tdClass} text-center font-data-mono`}>{row.completedChecklists ?? 0}/{row.assignedChecklists ?? 0}</td>
                    <td className={`${tdClass} text-center font-data-mono`}>{formatPct(row.checklistScore ?? 0)}</td>
                    <td className={`${tdClass} text-right font-data-mono font-bold`}>{formatPct(row.negativeScore)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>

        {/* Task-level detail */}
        <Card
          title={`Tasks This Week (${filteredTasks.length})`}
          actions={
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search task or doer…"
                aria-label="Search tasks"
                className={`${fieldInlineClass} min-w-0 flex-1 text-xs sm:w-56 sm:flex-none`}
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by category"
                className={`${fieldInlineClass} text-xs uppercase`}
              >
                <option value="ALL">All</option>
                <option value="Green">On Time</option>
                <option value="Yellow">Late Done</option>
                <option value="Red">Not Done</option>
                <option value="Pending">Not Yet Due</option>
              </select>
            </>
          }
          bodyClassName=""
        >
          <TableWrap className="border-0">
            <table className={`${tableClass} min-w-[680px]`}>
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>Task</th>
                  <th className={thClass}>Doer</th>
                  <th className={`${thClass} text-center`}>Due Date</th>
                  <th className={`${thClass} text-center`}>Status</th>
                  <th className={`${thClass} text-right`}>Category</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {loading && <StateRow colSpan={5}>Loading…</StateRow>}
                {!loading && filteredTasks.length === 0 && (
                  <StateRow colSpan={5}>No tasks for this week.</StateRow>
                )}
                {!loading && filteredTasks.map((t) => (
                  <tr key={t.id} className={trClass}>
                    <td className={`${tdClass} min-w-[200px]`}>{t.title}</td>
                    <td className={`${tdClass} text-on-surface-variant`}>{t.doer?.name ?? "—"}</td>
                    <td className={`${tdClass} whitespace-nowrap text-center font-data-mono text-xs`}>{formatDMY(t.dueDate)}</td>
                    <td className={`${tdClass} text-center font-data-mono text-xs text-on-surface-variant`}>{t.status}</td>
                    <td className={`${tdClass} text-right font-label-sm text-xs uppercase`}>{CATEGORY_LABEL[t.scoreCategory]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      </PageBody>
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
