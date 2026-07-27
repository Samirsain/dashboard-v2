import type { Task, User, Revision, ChecklistInstance, TaskScoreCategory, DgmaxEmployeeSummary, DgmaxWeeklySummary } from "../types";
import { calculatePerformance, DEFAULT_LATE_DONE_WEIGHT } from "./performanceScoring";

export { DEFAULT_LATE_DONE_WEIGHT };

/** Daily rate (33% per day late) and cap (max 80% penalty for late done checklist items) */
export const CHECKLIST_DAILY_RATE = 33;
export const CHECKLIST_MAX_CAP = 80;

function getDaysLate(dateStr: string, completedAtStr: string): number {
  if (!completedAtStr || !dateStr) return 1;
  const completedDateStr = completedAtStr.slice(0, 10);
  if (completedDateStr <= dateStr) return 0;
  const d1 = new Date(dateStr + "T00:00:00Z").getTime();
  const d2 = new Date(completedDateStr + "T00:00:00Z").getTime();
  const diffDays = Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}

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
 * Builds the DGMAX weekly summary for every active (non-Admin) doer, scoped to:
 * 1. Task List tasks
 * 2. Checklist items
 *
 * Calculates Task Score, Checklist Score (with per-day late penalties), and
 * final Average Score for each doer.
 */
export function buildDgmaxWeeklySummary(
  users: User[],
  tasks: Task[],
  revisions: Revision[],
  checklists: ChecklistInstance[] = [],
  todayIso: string,
  fromDate: string,
  toDate: string,
  lateDoneWeight: number = DEFAULT_LATE_DONE_WEIGHT
): DgmaxWeeklySummary {
  const originalDueDates = buildOriginalDueDates(revisions);
  const doers = users.filter((u) => u.status === "Active" && u.role !== "Admin");
  const weight = Math.min(100, Math.max(0, lateDoneWeight));

  const summaryMap = new Map<string, DgmaxEmployeeSummary>();
  const checklistItemsMap = new Map<string, ChecklistInstance[]>();

  for (const d of doers) {
    summaryMap.set(d.id, {
      doerId: d.id,
      doerName: d.name,
      department: d.department || "-",
      // Task
      assignedTasks: 0,
      completedTasks: 0,
      greenCount: 0,
      yellowCount: 0,
      redCount: 0,
      pendingCount: 0,
      taskScore: 0,
      // Checklist
      assignedChecklists: 0,
      completedChecklists: 0,
      checklistGreenCount: 0,
      checklistYellowCount: 0,
      checklistRedCount: 0,
      checklistPendingCount: 0,
      checklistScore: 0,
      // Average
      negativeScore: 0,
      performanceScore: 100,
    });
    checklistItemsMap.set(d.id, []);
  }

  const inWindow = (dateStr: string) => !!dateStr && dateStr >= fromDate && dateStr <= toDate;

  // Process Tasks
  for (const t of tasks) {
    const dueDate = originalDueDates.get(t.id) || t.dueDate;
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

  // Process Checklists
  for (const c of checklists) {
    const completedAt = c.status === "Completed" && c.completedAt ? c.completedAt.slice(0, 10) : null;
    const belongsToWindow = completedAt ? inWindow(completedAt) || inWindow(c.date) : inWindow(c.date);
    if (!belongsToWindow) continue;

    const s = summaryMap.get(c.assignedDoerId);
    if (!s) continue;

    const listForDoer = checklistItemsMap.get(c.assignedDoerId);
    if (listForDoer) listForDoer.push(c);

    if (c.status === "Completed") {
      s.completedChecklists++;
      if (completedAt && completedAt <= c.date) {
        s.checklistGreenCount++;
      } else {
        s.checklistYellowCount++;
      }
    } else {
      if (c.date < todayIso) {
        s.checklistRedCount++;
      } else {
        s.checklistPendingCount++;
      }
    }
  }

  // Compute Scores per Doer
  const summaries = Array.from(summaryMap.values())
    .map((s) => {
      // 1. Task Score
      s.assignedTasks = s.greenCount + s.yellowCount + s.redCount;
      if (s.assignedTasks > 0) {
        const taskResult = calculatePerformance(
          { assigned: s.assignedTasks, onTime: s.greenCount, lateDone: s.yellowCount, notDone: s.redCount },
          weight
        );
        s.taskScore = taskResult.negativeScore;
      } else {
        s.taskScore = 0;
      }

      // 2. Checklist Score (Per-day penalty model: 33% per day late, max cap 80%)
      s.assignedChecklists = s.checklistGreenCount + s.checklistYellowCount + s.checklistRedCount;
      if (s.assignedChecklists > 0) {
        const itemSharePct = 100 / s.assignedChecklists;
        let totalPenalty = 0;
        const doerChecklists = checklistItemsMap.get(s.doerId) || [];

        for (const c of doerChecklists) {
          const completedAt = c.status === "Completed" && c.completedAt ? c.completedAt.slice(0, 10) : null;
          if (c.status === "Completed") {
            if (completedAt && completedAt > c.date) {
              const daysLate = getDaysLate(c.date, c.completedAt);
              const latePenaltyPct = Math.min(CHECKLIST_MAX_CAP, daysLate * CHECKLIST_DAILY_RATE);
              totalPenalty += itemSharePct * (latePenaltyPct / 100);
            }
          } else if (c.date < todayIso) {
            // Not Done -> full penalty
            totalPenalty += itemSharePct * 1.0;
          }
        }
        s.checklistScore = Math.round(-Math.min(100, Math.max(0, totalPenalty)) * 100) / 100;
      } else {
        s.checklistScore = 0;
      }

      // 3. Average Score of Task List & Checklist
      const hasTaskWork = s.assignedTasks > 0;
      const hasChecklistWork = s.assignedChecklists > 0;

      if (hasTaskWork && hasChecklistWork) {
        s.negativeScore = Math.round(((s.taskScore + s.checklistScore) / 2) * 100) / 100;
      } else if (hasTaskWork) {
        s.negativeScore = s.taskScore;
      } else if (hasChecklistWork) {
        s.negativeScore = s.checklistScore;
      } else {
        s.negativeScore = 0;
      }

      s.performanceScore = Math.round((100 + s.negativeScore) * 100) / 100;
      return s;
    })
    .sort((a, b) => b.negativeScore - a.negativeScore || b.completedTasks - a.completedTasks);

  // Totals across team
  const totals = { assigned: 0, completed: 0, green: 0, yellow: 0, red: 0, pending: 0, negativeScore: 0, performanceScore: 0 };
  for (const s of summaries) {
    totals.assigned += s.assignedTasks + s.assignedChecklists;
    totals.completed += s.completedTasks + s.completedChecklists;
    totals.green += s.greenCount + s.checklistGreenCount;
    totals.yellow += s.yellowCount + s.checklistYellowCount;
    totals.red += s.redCount + s.checklistRedCount;
    totals.pending += s.pendingCount + s.checklistPendingCount;
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
