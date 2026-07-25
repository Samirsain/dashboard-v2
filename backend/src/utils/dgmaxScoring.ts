import type { Task, ChecklistInstance, User, TaskScoreCategory, DgmaxEmployeeSummary, DgmaxWeeklySummary } from "../types";

export const DEFAULT_LATE_DONE_WEIGHT = 60;

/**
 * DGMAX Negative Performance Scoring System.
 *
 * Every employee starts a week at 100. Only delays and incomplete work pull
 * the score down — see DGMAX-negative-scoring.md for the original spec.
 *
 * Category for a single task/checklist item, given today's date:
 *  - Green ("On Time")   — completed on or before its due date.
 *  - Yellow ("Late Done") — completed after its due date.
 *  - Red ("Not Done")     — still incomplete and its due date has passed.
 *  - Pending              — still incomplete, not yet due. Excluded from
 *                            scoring entirely (hasn't had a chance to be late
 *                            or missed yet) — it simply isn't counted until
 *                            it resolves one way or the other.
 * Cancelled items, or items with no due date, return null (not counted at all).
 */
export function getTaskCategory(task: Task, todayIso: string): TaskScoreCategory | null {
  if (task.status === "Cancelled" || !task.dueDate) return null;
  if (task.status === "Completed") {
    const completedDate = task.updatedAt ? task.updatedAt.slice(0, 10) : todayIso;
    return completedDate > task.dueDate ? "Yellow" : "Green";
  }
  return task.dueDate < todayIso ? "Red" : "Pending";
}

/** Same categorization for a checklist instance. */
export function getChecklistCategory(c: ChecklistInstance, todayIso: string): TaskScoreCategory | null {
  if (!c.date) return null;
  if (c.status === "Completed") {
    const completedDate = c.completedAt ? c.completedAt.slice(0, 10) : todayIso;
    return completedDate > c.date ? "Yellow" : "Green";
  }
  return c.date < todayIso ? "Red" : "Pending";
}

/**
 * Builds the DGMAX weekly summary for every active (non-Admin) doer, scoped
 * to tasks/checklist items whose due date falls within [fromDate, toDate]
 * (inclusive, both YYYY-MM-DD — normally a Monday..Sunday week).
 *
 * Formula per doer:
 *   Assigned      = Green + Yellow + Red   (Pending excluded)
 *   Per Task %    = 100 / Assigned
 *   Not Done Pen. = Red    x Per Task %
 *   Late Done Pen.= Yellow x Per Task % x (lateDoneWeight / 100)
 *   Negative      = -(Not Done Pen. + Late Done Pen.)
 *   Score         = clamp(100 + Negative, 0, 100)
 */
export function buildDgmaxWeeklySummary(
  users: User[],
  tasks: Task[],
  checklistInstances: ChecklistInstance[],
  todayIso: string,
  fromDate: string,
  toDate: string,
  lateDoneWeight: number = DEFAULT_LATE_DONE_WEIGHT
): DgmaxWeeklySummary {
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

  const inWindow = (dateStr: string) => dateStr >= fromDate && dateStr <= toDate;

  for (const t of tasks) {
    if (!inWindow(t.dueDate)) continue;
    const s = summaryMap.get(t.assignedDoerId);
    if (!s) continue;
    const cat = getTaskCategory(t, todayIso);
    if (!cat) continue;
    if (t.status === "Completed") s.completedTasks++;
    if (cat === "Green") s.greenCount++;
    else if (cat === "Yellow") s.yellowCount++;
    else if (cat === "Red") s.redCount++;
    else s.pendingCount++;
  }

  for (const c of checklistInstances) {
    if (!inWindow(c.date)) continue;
    const s = summaryMap.get(c.assignedDoerId);
    if (!s) continue;
    const cat = getChecklistCategory(c, todayIso);
    if (!cat) continue;
    if (c.status === "Completed") s.completedTasks++;
    if (cat === "Green") s.greenCount++;
    else if (cat === "Yellow") s.yellowCount++;
    else if (cat === "Red") s.redCount++;
    else s.pendingCount++;
  }

  const summaries = Array.from(summaryMap.values())
    .map((s) => {
      s.assignedTasks = s.greenCount + s.yellowCount + s.redCount;
      if (s.assignedTasks > 0) {
        const perTaskPct = 100 / s.assignedTasks;
        const notDonePenalty = s.redCount * perTaskPct;
        const lateDonePenalty = s.yellowCount * perTaskPct * (weight / 100);
        s.negativeScore = -Math.round((notDonePenalty + lateDonePenalty) * 100) / 100;
        s.performanceScore = Math.max(0, Math.min(100, Math.round((100 + s.negativeScore) * 100) / 100));
      } else {
        s.negativeScore = 0;
        s.performanceScore = 100;
      }
      return s;
    })
    // Higher score first; tie -> whoever completed more work ranks higher.
    .sort((a, b) => b.performanceScore - a.performanceScore || b.completedTasks - a.completedTasks);

  const totals = { assigned: 0, completed: 0, green: 0, yellow: 0, red: 0, pending: 0, performanceScore: 0 };
  for (const s of summaries) {
    totals.assigned += s.assignedTasks;
    totals.completed += s.completedTasks;
    totals.green += s.greenCount;
    totals.yellow += s.yellowCount;
    totals.red += s.redCount;
    totals.pending += s.pendingCount;
  }
  totals.performanceScore =
    summaries.length > 0
      ? Math.round((summaries.reduce((sum, s) => sum + s.performanceScore, 0) / summaries.length) * 100) / 100
      : 100;

  const weekLabel = `${formatDMY(fromDate)} to ${formatDMY(toDate)}`;

  return { weekLabel, fromDate, toDate, lateDoneWeight: weight, summaries, totals };
}

function formatDMY(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}
