"use client";

import { useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import {
  Button,
  Card,
  EmptyState,
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
import { useAuth } from "@/lib/auth-context";
import { canViewTeamPerformance } from "@/lib/access";
import { formatDMY, formatPct } from "@/lib/format";
import { mondayOf, sundayOf, addDays, getWeekNumber } from "@/lib/week";
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
      const summaryData = await api.get<DgmaxWeeklySummary>(
        `/performance/dgmax?from=${from}&to=${to}`
      );
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
  const revisionWeight = dgmaxSummary?.revisionPenaltyPct ?? 20;

  function exportCSV() {
    const headers = ["Week", "Rank", "Employee Name", "Assigned Tasks", "Revisions", "Assigned Checklists", "Task Score", "Checklist Score", "Average Score"];
    const rows = (dgmaxSummary?.summaries ?? []).map((s, i) => [
      weekLabel, i + 1, s.doerName,
      s.assignedTasks, s.revisionCount, s.assignedChecklists, s.taskScore, s.checklistScore, s.negativeScore,
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
          <span className="font-data-mono text-xs font-bold text-on-surface sm:text-sm">
            Week {getWeekNumber(weekStart)} &bull; {formatDMY(weekStart)} — {formatDMY(weekEnd)}{" "}
            <span className="text-on-surface-variant font-normal">(Mon–Sun)</span>
          </span>
        </Toolbar>

        {error && <ErrorNote>{error}</ErrorNote>}

        {/* Formula */}
        <p className="border border-on-surface/25 px-3 py-2 font-data-mono text-[11px] leading-relaxed text-on-surface-variant">
          Task Score = −((Not Done × Per Task %) + (Late Done × Per Task % × {lateWeight}%) + (Revisions
          × Per Task % × {revisionWeight}%))
          &nbsp;·&nbsp;
          Checklist Score = −Per-Day Late Penalty (33%/day late, capped at 80%) · Not Done = −100% of
          that item
          <br />
          <strong className="text-on-surface">Final Doer Score = Average(Task Score, Checklist Score)</strong>
        </p>

        {/* Scoreboard */}
        <Card title="Employee Scores (Task + Checklist Average)" bodyClassName="">
          <TableWrap className="border-0">
            <table className={`${tableClass} min-w-[800px]`}>
              <thead className={theadClass}>
                <tr>
                  <th className={`${thClass} w-10 text-center`}>#</th>
                  <th className={thClass}>Employee</th>
                  <th className={`${thClass} text-center`}>Tasks (Done/Assigned)</th>
                  <th className={`${thClass} text-center`}>Revisions</th>
                  <th className={`${thClass} text-center`}>Task Score</th>
                  <th className={`${thClass} text-center`}>Checklists (Done/Assigned)</th>
                  <th className={`${thClass} text-center`}>Checklist Score</th>
                  <th className={`${thClass} text-right`}>Avg Score</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {loading && <StateRow colSpan={8}>Loading…</StateRow>}
                {!loading && (dgmaxSummary?.summaries.length ?? 0) === 0 && (
                  <StateRow colSpan={8}>No data for this week.</StateRow>
                )}
                {!loading &&
                  dgmaxSummary?.summaries.map((s, i) => (
                    <tr key={s.doerId} className={trClass}>
                      <td className={`${tdClass} text-center font-data-mono text-on-surface-variant`}>{i + 1}</td>
                      <td className={tdClass}>{s.doerName}</td>
                      <td className={`${tdClass} text-center font-data-mono`}>{s.completedTasks}/{s.assignedTasks}</td>
                      <td className={`${tdClass} text-center font-data-mono`}>{s.revisionCount ?? 0}</td>
                      <td className={`${tdClass} text-center font-data-mono`}>{formatPct(s.taskScore ?? 0)}</td>
                      <td className={`${tdClass} text-center font-data-mono`}>{s.completedChecklists ?? 0}/{s.assignedChecklists ?? 0}</td>
                      <td className={`${tdClass} text-center font-data-mono`}>{formatPct(s.checklistScore ?? 0)}</td>
                      <td className={`${tdClass} text-right font-data-mono font-bold`}>{formatPct(s.negativeScore)}</td>
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

/**
 * MD only. The nav hides this from a PC, but the route has to refuse them too —
 * otherwise typing the URL still loads the page (the API would 403, leaving a
 * broken-looking screen rather than an honest one).
 */
function TeamPerformanceGate() {
  const { user } = useAuth();
  if (!canViewTeamPerformance(user)) {
    return (
      <>
        <MobileHeader />
        <SideNav active="team-performance" />
        <PageBody>
          <PageHeader title="Team Performance" />
          <EmptyState>This page is available to the MD only.</EmptyState>
        </PageBody>
      </>
    );
  }
  return <TeamPerformanceInner />;
}

export default function TeamPerformancePage() {
  return (
    <AuthGuard>
      <TeamPerformanceGate />
    </AuthGuard>
  );
}
