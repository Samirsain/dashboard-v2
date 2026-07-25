import type { Task, User, Revision, TaskScoreCategory, DgmaxEmployeeSummary, DgmaxWeeklySummary } from "../types";
import { calculatePerformance, DEFAULT_LATE_DONE_WEIGHT } from "./performanceScoring";

export { DEFAULT_LATE_DONE_WEIGHT };

/**
 * DGMAX Negative Performance Scoring System.
 *
 * Every employee starts a week at 100. Only delays and incomplete work pull
 * the score down — see DGMAX-negative-scoring.md for the original spec.
 *
 * Only Task List tasks are scored. Checklist items are recurring routine work
 * and are deliberately left out of the score entirely.
 *
 * Scoring always measures against the task's ORIGINAL due date — the deadline
 * first committed to — not the current one. Revising a task genuinely moves its
 * working deadline (it stops showing as overdue, the doer gets the new date),
 * but it cannot buy back a clean score: a task revised and then finished is
 * "Late Done", exactly as the spec describes it. Without this, extending a due
 * date and finishing before the new one scored as On Time, so a task could be
 * pushed indefinitely and still come out at a perfect 0%.
 *
 * Category for a single task, given today's date:
 *  - Green ("On Time")   — completed on or before its original due date.
 *  - Yellow ("Late Done") — completed after its original due date (this is the
 *                            revised-then-completed case).
 *  - Red ("Not Done")     — still incomplete and its original due date passed.
 *  - Pending              — still incomplete, not yet due. Excluded from
 *                            scoring entirely (hasn't had a chance to be late
 *                            or missed yet) — it simply isn't counted until
 *                            it resolves one way or the other.
 * Cancelled items, or items with no due date, return null (not counted at all).
 */
export function getTaskCategory(
  task: Task,
  todayIso: string,
  originalDueDate?: string
): TaskScoreCategory | null {
  const dueDate = originalDueDate || task.dueDate;
  if (task.status === "Cancelled" || !dueDate) return null;
  if (task.status === "Completed") {
    const completedDate = task.updatedAt ? task.updatedAt.slice(0, 10) : todayIso;
    return completedDate > dueDate ? "Yellow" : "Green";
  }
  return dueDate < todayIso ? "Red" : "Pending";
}

/**
 * taskId -> the due date the task originally carried, taken from the oldest
 * revision's "old due date". Tasks that were never revised are absent, and the
 * caller falls back to the task's own dueDate.
 */
export function buildOriginalDueDates(revisions: Revision[]): Map<string, string> {
  const earliest = new Map<string, Revision>();
  for (const r of revisions) {
    if (!r.taskId || !r.oldDueDate) continue;
    const current = earliest.get(r.taskId);
    if (!current || r.revisedAt < current.revisedAt) earliest.set(r.taskId, r);
  }
  return new Map(Array.from(earliest, ([taskId, r]) => [taskId, r.oldDueDate]));
}

/**
 * Builds the DGMAX weekly summary for every active (non-Admin) doer, scoped to
 * Task List tasks whose due date falls within [fromDate, toDate] (inclusive,
 * both YYYY-MM-DD — normally a Monday..Sunday week). Checklist items are not
 * scored.
 *
 * Assigned = Green + Yellow + Red (Pending excluded — not yet scoreable). The
 * arithmetic itself lives in calculatePerformance(), the single source of truth.
 */
export function buildDgmaxWeeklySummary(
  users: User[],
  tasks: Task[],
  revisions: Revision[],
  todayIso: string,
  fromDate: string,
  toDate: string,
  lateDoneWeight: number = DEFAULT_LATE_DONE_WEIGHT
): DgmaxWeeklySummary {
  const originalDueDates = buildOriginalDueDates(revisions);
  const doers = users.filter((u) => u.status === "Active" && u.role !== "Admin");
  const weight = Math.min(100, Math.max(0, lateDoneWeight));

  const summaryMap = new Map<string, DgmaxEmployeeSummary>();
  for (const d of doers) {
    summaryMap.set(d.id, {
      doerId: d.id,
      doerName: d.name,
      department: d.department || "-",
      assignedTasks: 0,
      completedTasks: 0,
      greenCount: 0,
      yellowCount: 0,
      redCount: 0,
      pendingCount: 0,
      negativeScore: 0,
      performanceScore: 100,
    });
  }

  const inWindow = (dateStr: string) => !!dateStr && dateStr >= fromDate && dateStr <= toDate;

  for (const t of tasks) {
    // The week a task counts in follows its original deadline, so revising a
    // due date cannot move a miss into a different week either.
    const dueDate = originalDueDates.get(t.id) || t.dueDate;
    // A completed task belongs to the week it was completed in (updatedAt).
    // An incomplete/overdue task belongs to the week its dueDate falls in.
    // If the task was completed, check both: dueDate in window OR completedAt (updatedAt) in window.
    // If not completed, only count if dueDate is in window.
    const completedAt = t.status === "Completed" && t.updatedAt ? t.updatedAt.slice(0, 10) : null;
    const belongsToWindow = completedAt ? inWindow(completedAt) || inWindow(dueDate) : inWindow(dueDate);
    if (!belongsToWindow) continue;

    const s = summaryMap.get(t.assignedDoerId);
    if (!s) continue;
    const cat = getTaskCategory(t, todayIso, dueDate);
    if (!cat) continue;
    if (t.status === "Completed") s.completedTasks++;
    if (cat === "Green") s.greenCount++;
    else if (cat === "Yellow") s.yellowCount++;
    else if (cat === "Red") s.redCount++;
    else s.pendingCount++;
  }

  const summaries = Array.from(summaryMap.values())
    .map((s) => {
      s.assignedTasks = s.greenCount + s.yellowCount + s.redCount;
      const result = calculatePerformance(
        { assigned: s.assignedTasks, onTime: s.greenCount, lateDone: s.yellowCount, notDone: s.redCount },
        weight
      );
      s.negativeScore = result.negativeScore;
      s.performanceScore = result.performanceScore;
      return s;
    })
    // Least negative first (0 is a perfect week); tie -> more completed work ranks higher.
    .sort((a, b) => b.negativeScore - a.negativeScore || b.completedTasks - a.completedTasks);

  const totals = { assigned: 0, completed: 0, green: 0, yellow: 0, red: 0, pending: 0, negativeScore: 0, performanceScore: 0 };
  for (const s of summaries) {
    totals.assigned += s.assignedTasks;
    totals.completed += s.completedTasks;
    totals.green += s.greenCount;
    totals.yellow += s.yellowCount;
    totals.red += s.redCount;
    totals.pending += s.pendingCount;
  }
  if (summaries.length > 0) {
    totals.negativeScore = Math.round((summaries.reduce((sum, s) => sum + s.negativeScore, 0) / summaries.length) * 100) / 100;
    totals.performanceScore = Math.round((100 + totals.negativeScore) * 100) / 100;
  } else {
    totals.negativeScore = 0;
    totals.performanceScore = 100;
  }

  const weekLabel = `${formatDMY(fromDate)} to ${formatDMY(toDate)}`;

  return { weekLabel, fromDate, toDate, lateDoneWeight: weight, summaries, totals };
}

function formatDMY(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}
