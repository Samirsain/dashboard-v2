import type { Task, ChecklistInstance, User, TaskScoreCategory, DgmaxEmployeeSummary, DgmaxWeeklySummary } from "../types";

/**
 * Determines the DGMAX Task Score Category for a single task:
 *  - GREEN:  Completed on or before Due Date with 0 revisions.
 *  - YELLOW: Completed, but required 1 or more revisions.
 *  - RED:    Completed after Due Date OR currently overdue.
 *  - PENDING: Still active/pending and not yet past Due Date.
 */
export function getTaskCategory(task: Task, todayIso: string): TaskScoreCategory {
  const isCompleted = task.status === "Completed";
  const isCancelled = task.status === "Cancelled";

  if (isCancelled) return "Pending";

  if (!isCompleted) {
    // Active task — if past due date, it's RED (overdue); otherwise PENDING.
    if (task.dueDate && task.dueDate < todayIso) {
      return "Red";
    }
    return "Pending";
  }

  // Completed task:
  const completedDate = task.updatedAt ? task.updatedAt.slice(0, 10) : todayIso;
  const isLateCompletion = task.dueDate && completedDate > task.dueDate;

  if (isLateCompletion) {
    return "Red";
  }

  if (task.revisionCount > 0) {
    return "Yellow";
  }

  return "Green";
}

/**
 * Determines DGMAX Category for a checklist instance.
 */
export function getChecklistCategory(c: ChecklistInstance, todayIso: string): TaskScoreCategory {
  const isCompleted = c.status === "Completed";
  if (!isCompleted) {
    if (c.date && c.date < todayIso) return "Red";
    return "Pending";
  }
  const completedDate = c.completedAt ? c.completedAt.slice(0, 10) : todayIso;
  if (c.date && completedDate > c.date) return "Red";
  return "Green";
}

/**
 * Generates the DGMAX Weekly Summary across all active doers for a given set of tasks & checklist items.
 */
export function buildDgmaxWeeklySummary(
  users: User[],
  tasks: Task[],
  checklistInstances: ChecklistInstance[],
  todayIso: string,
  weekLabel = ""
): DgmaxWeeklySummary {
  const doers = users.filter((u) => u.status === "Active" && u.role !== "Admin");

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
    });
  }

  // Process Tasks
  for (const t of tasks) {
    const s = summaryMap.get(t.assignedDoerId);
    if (!s) continue;
    s.assignedTasks++;
    if (t.status === "Completed") s.completedTasks++;

    const cat = getTaskCategory(t, todayIso);
    if (cat === "Green") s.greenCount++;
    else if (cat === "Yellow") s.yellowCount++;
    else if (cat === "Red") s.redCount++;
    else if (cat === "Pending") s.pendingCount++;
  }

  // Process Checklist Instances
  for (const c of checklistInstances) {
    const s = summaryMap.get(c.assignedDoerId);
    if (!s) continue;
    s.assignedTasks++;
    if (c.status === "Completed") s.completedTasks++;

    const cat = getChecklistCategory(c, todayIso);
    if (cat === "Green") s.greenCount++;
    else if (cat === "Yellow") s.yellowCount++;
    else if (cat === "Red") s.redCount++;
    else if (cat === "Pending") s.pendingCount++;
  }

  const summaries = Array.from(summaryMap.values()).sort((a, b) =>
    a.doerName.localeCompare(b.doerName)
  );

  const totals = {
    assigned: 0,
    completed: 0,
    green: 0,
    yellow: 0,
    red: 0,
    pending: 0,
  };

  for (const s of summaries) {
    totals.assigned += s.assignedTasks;
    totals.completed += s.completedTasks;
    totals.green += s.greenCount;
    totals.yellow += s.yellowCount;
    totals.red += s.redCount;
    totals.pending += s.pendingCount;
  }

  return {
    weekLabel,
    fromDate: "",
    toDate: "",
    summaries,
    totals,
  };
}
