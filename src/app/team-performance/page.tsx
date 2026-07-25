"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { DgmaxWeeklySummary, List, Task, Doer } from "@/lib/types";

/** Neutral outline badge — readable on the light surface, no filled colour blocks. */
function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "muted" | "alert" }) {
  const tones = {
    default: "border-on-surface text-on-surface",
    muted: "border-on-surface/40 text-on-surface-variant",
    alert: "border-error text-error",
  };
  return (
    <span className={`inline-block whitespace-nowrap border px-1.5 py-0.5 font-label-sm text-[10px] uppercase ${tones[tone]}`}>
      {children}
    </span>
  );
}

function TeamPerformanceInner() {
  const [dgmaxSummary, setDgmaxSummary] = useState<DgmaxWeeklySummary | null>(null);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [doers, setDoers] = useState<Doer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Monday of the currently-selected week. Week always runs Monday -> Sunday.
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const weekEnd = sundayOf(weekStart);
  const today = todayIso();

  async function loadData(from: string, to: string) {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, tasksData, listsData, doerData] = await Promise.all([
        api.get<DgmaxWeeklySummary>(`/performance/dgmax?from=${from}&to=${to}`),
        api.get<Task[]>("/tasks").catch(() => [] as Task[]),
        api.get<List[]>("/lists").catch(() => [] as List[]),
        api.get<Doer[]>("/users").catch(() => [] as Doer[]),
      ]);
      setDgmaxSummary(summaryData);
      setAllTasks(tasksData);
      setLists(listsData);
      setDoers(doerData);
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

  const isOverdue = (dueDate: string) => !!dueDate && dueDate < today;

  const listLabelFor = (listId: string) => {
    if (!listId) return "Office";
    const list = lists.find((l) => l.id === listId);
    return list ? list.name.trim().split(/\s+/)[0]?.toUpperCase() || "LIST" : "Office";
  };

  const weeklyTasks = useMemo(() => {
    return allTasks
      .filter((t) => {
        if (t.status === "Cancelled" || !t.dueDate) return false;
        const completedAt = t.status === "Completed" && t.updatedAt ? t.updatedAt.slice(0, 10) : null;
        if (completedAt) {
          return (
            (completedAt >= weekStart && completedAt <= weekEnd) ||
            (t.dueDate >= weekStart && t.dueDate <= weekEnd)
          );
        }
        return t.dueDate >= weekStart && t.dueDate <= weekEnd;
      })
      .sort((a, b) => {
        const aCompleted = a.status === "Completed";
        const bCompleted = b.status === "Completed";
        if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
        const aOverdue = isOverdue(a.dueDate);
        const bOverdue = isOverdue(b.dueDate);
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        const aToday = a.dueDate === today;
        const bToday = b.dueDate === today;
        if (aToday !== bToday) return aToday ? -1 : 1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, weekStart, weekEnd, today]);

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

      <PageBody>
        <PageHeader
          title="Team Performance"
          actions={
            <Button onClick={exportCSV} disabled={!dgmaxSummary?.summaries.length}>
              Export CSV
            </Button>
          }
        />

        {/* Week Selector */}
        <Toolbar>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => goToWeek(-1)} aria-label="Previous week">
              ← Prev
            </Button>
            <Button size="sm" onClick={() => setWeekStart(mondayOf())}>
              This Week
            </Button>
            <Button size="sm" onClick={() => goToWeek(1)} aria-label="Next week">
              Next →
            </Button>
          </div>
          <input
            type="date"
            aria-label="Jump to week"
            value={weekStart}
            onChange={(e) => e.target.value && setWeekStart(mondayOf(e.target.value))}
            className={`${fieldInlineClass} font-data-mono text-xs`}
          />
          <span className="font-data-mono text-xs text-on-surface sm:text-sm">
            {formatDMY(weekStart)} — {formatDMY(weekEnd)}{" "}
            <span className="text-on-surface-variant">(Mon–Sun)</span>
          </span>
        </Toolbar>

        {error && <ErrorNote>{error}</ErrorNote>}

        {/* Summary */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Team Score" value={formatPct(totals.negativeScore)} />
          <Stat label="Assigned" value={totals.assigned} />
          <Stat label="On Time" value={totals.green} />
          <Stat label="Late Done" value={totals.yellow} />
          <Stat label="Not Done" value={totals.red} />
          <Stat label="Not Yet Due" value={totals.pending} />
        </div>

        {/* Formula */}
        <p className="border border-on-surface/25 px-3 py-2 font-data-mono text-[11px] leading-relaxed text-on-surface-variant">
          Per Task % = 100 ÷ Assigned &nbsp;·&nbsp; Score = −((Not Done × Per Task %) + (Late Done × Per Task % × {lateWeight}%))
          <br />
          <span className="opacity-70">
            0% is a perfect week; the score only goes down from there. Tasks not yet due are excluded.
          </span>
        </p>

        {/* Scoreboard */}
        <Card title="Employee Scores" bodyClassName="">
          <TableWrap className="border-0">
            <table className={`${tableClass} min-w-[640px]`}>
              <thead className={theadClass}>
                <tr>
                  <th className={`${thClass} w-10 text-center`}>#</th>
                  <th className={thClass}>Employee</th>
                  <th className={`${thClass} text-center`}>Assigned</th>
                  <th className={`${thClass} text-center`}>On Time</th>
                  <th className={`${thClass} text-center`}>Late Done</th>
                  <th className={`${thClass} text-center`}>Not Done</th>
                  <th className={`${thClass} text-right`}>Score</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {loading && <StateRow colSpan={7}>Loading…</StateRow>}
                {!loading && (dgmaxSummary?.summaries.length ?? 0) === 0 && (
                  <StateRow colSpan={7}>No data for this week.</StateRow>
                )}
                {!loading &&
                  dgmaxSummary?.summaries.map((s, i) => (
                    <tr key={s.doerId} className={trClass}>
                      <td className={`${tdClass} text-center font-data-mono text-on-surface-variant`}>{i + 1}</td>
                      <td className={tdClass}>{s.doerName}</td>
                      <td className={`${tdClass} text-center font-data-mono`}>{s.assignedTasks}</td>
                      <td className={`${tdClass} text-center font-data-mono`}>{s.greenCount}</td>
                      <td className={`${tdClass} text-center font-data-mono`}>{s.yellowCount}</td>
                      <td className={`${tdClass} text-center font-data-mono`}>{s.redCount}</td>
                      <td className={`${tdClass} text-right font-data-mono font-bold`}>{formatPct(s.negativeScore)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>

        {/* Weekly Task List */}
        <Card
          title={`Weekly Task List (${weeklyTasks.length})`}
          actions={<span className="font-data-mono text-[11px] text-on-surface-variant">Mon–Sun scored work</span>}
          bodyClassName=""
        >
          <TableWrap className="border-0">
            <table className={`${tableClass} min-w-[760px]`}>
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>Task</th>
                  <th className={thClass}>List</th>
                  <th className={thClass}>Assigned To</th>
                  <th className={`${thClass} text-center`}>Due</th>
                  <th className={`${thClass} text-center`}>Completed</th>
                  <th className={`${thClass} text-center`}>Category</th>
                  <th className={`${thClass} text-center`}>Status</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {loading && <StateRow colSpan={7}>Loading tasks…</StateRow>}
                {!loading && weeklyTasks.length === 0 && (
                  <StateRow colSpan={7}>No tasks scheduled or completed for this week.</StateRow>
                )}
                {!loading &&
                  weeklyTasks.map((t) => {
                    const cat = getTaskCategory(t, today);
                    const overdue = isOverdue(t.dueDate);
                    return (
                      <tr key={t.id} className={trClass}>
                        <td className={`${tdClass} min-w-[200px]`}>
                          <span className="font-medium">{t.title}</span>
                          {(t.priority === "Urgent" || t.priority === "Critical") && (
                            <span className="ml-2 align-middle">
                              <Badge tone="alert">{t.priority}</Badge>
                            </span>
                          )}
                        </td>
                        <td className={`${tdClass} font-label-sm text-xs uppercase text-on-surface-variant`}>
                          {listLabelFor(t.listId)}
                        </td>
                        <td className={`${tdClass} text-on-surface-variant`}>
                          {t.doer?.name || doers.find((d) => d.id === t.assignedDoerId)?.name || t.assignedDoerId || "—"}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap text-center font-data-mono text-xs`}>
                          {formatDMY(t.dueDate)}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap text-center font-data-mono text-xs text-on-surface-variant`}>
                          {t.status === "Completed" && t.updatedAt ? formatDMY(t.updatedAt.slice(0, 10)) : "—"}
                        </td>
                        <td className={`${tdClass} text-center`}>
                          {cat ? <Badge tone="muted">{CATEGORY_LABEL[cat]}</Badge> : <span className="text-on-surface-variant">—</span>}
                        </td>
                        <td className={`${tdClass} text-center`}>
                          <Badge tone={overdue && t.status !== "Completed" ? "alert" : "default"}>
                            {t.status === "Completed" ? "Completed" : overdue ? "Overdue" : "Pending"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      </PageBody>
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
