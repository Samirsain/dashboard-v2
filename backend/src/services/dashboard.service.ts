import { tasksService } from "./tasks.service";
import { checklistService } from "./checklist.service";
import { activityService } from "./activity.service";
import { usersService } from "./users.service";
import { addDaysIso, isBeforeToday, todayIso } from "../utils/date";
import type {
  DashboardSummary,
  DepartmentWiseTaskStat,
  Task,
  User,
  UserWiseTaskStat,
} from "../types";

function isOpen(task: Task): boolean {
  return task.status !== "Completed" && task.status !== "Cancelled";
}

/** Pure computation over an already-fetched task list — no I/O, safe to call as many times as needed per request. */
function computeSummary(
  tasks: Task[],
  checklistTodayCount: number,
  today: string
): DashboardSummary {
  const overdue = tasks.filter((t) => isBeforeToday(t.dueDate, today) && isOpen(t));
  const todaysTasks = tasks.filter((t) => t.dueDate === today && t.status !== "Cancelled");
  const upcoming = tasks.filter(
    (t) => t.dueDate > today && t.dueDate <= addDaysIso(today, 3) && t.status !== "Cancelled"
  );
  const todaysRevisions = tasks.filter((t) => t.revisionDate === today);

  return {
    totalTasks: tasks.length,
    pending: tasks.filter((t) => t.status === "Pending" || t.status === "In Progress").length,
    completed: tasks.filter((t) => t.status === "Completed").length,
    overdue: overdue.length,
    todaysTasks: todaysTasks.length,
    todaysRevisions: todaysRevisions.length,
    urgent: tasks.filter((t) => t.priority === "Urgent").length,
    critical: tasks.filter((t) => t.priority === "Critical").length,
    checklistToday: checklistTodayCount,
    upcoming: upcoming.length,
  };
}

function computeUserWiseBreakdown(tasks: Task[], doers: User[], today: string): UserWiseTaskStat[] {
  const statsByDoerId = new Map<string, UserWiseTaskStat>();
  for (const doer of doers) {
    statsByDoerId.set(doer.id, {
      doerId: doer.id,
      doerName: doer.name,
      total: 0,
      pending: 0,
      completed: 0,
      overdue: 0,
    });
  }

  for (const task of tasks) {
    let stat = statsByDoerId.get(task.assignedDoerId);
    if (!stat) {
      // Task references a Doer ID no longer in DOERLIST — still counted, labeled unknown.
      stat = {
        doerId: task.assignedDoerId,
        doerName: "Unknown Doer",
        total: 0,
        pending: 0,
        completed: 0,
        overdue: 0,
      };
      statsByDoerId.set(task.assignedDoerId, stat);
    }
    stat.total += 1;
    if (task.status === "Pending" || task.status === "In Progress") stat.pending += 1;
    if (task.status === "Completed") stat.completed += 1;
    if (isBeforeToday(task.dueDate, today) && isOpen(task)) stat.overdue += 1;
  }

  return Array.from(statsByDoerId.values()).sort((a, b) => b.total - a.total);
}

function computeDepartmentWiseBreakdown(tasks: Task[], today: string): DepartmentWiseTaskStat[] {
  const statsByDepartment = new Map<string, DepartmentWiseTaskStat>();

  for (const task of tasks) {
    const department = task.department || "Unassigned";
    let stat = statsByDepartment.get(department);
    if (!stat) {
      stat = { department, total: 0, pending: 0, completed: 0, overdue: 0 };
      statsByDepartment.set(department, stat);
    }
    stat.total += 1;
    if (task.status === "Pending" || task.status === "In Progress") stat.pending += 1;
    if (task.status === "Completed") stat.completed += 1;
    if (isBeforeToday(task.dueDate, today) && isOpen(task)) stat.overdue += 1;
  }

  return Array.from(statsByDepartment.values()).sort((a, b) => b.total - a.total);
}

export const dashboardService = {
  /** The at-a-glance numbers used by the dashboard's KPI cards. */
  async getSummary(today = todayIso()): Promise<DashboardSummary> {
    const [tasks, checklistToday] = await Promise.all([
      tasksService.listRaw(),
      checklistService.listToday(today),
    ]);
    return computeSummary(tasks, checklistToday.length, today);
  },

  /** Per-doer task counts, using DOERLIST for names (never grouped by name). */
  async getUserWiseBreakdown(today = todayIso()): Promise<UserWiseTaskStat[]> {
    const [tasks, doers] = await Promise.all([tasksService.listRaw(), usersService.list()]);
    return computeUserWiseBreakdown(tasks, doers, today);
  },

  async getDepartmentWiseBreakdown(today = todayIso()): Promise<DepartmentWiseTaskStat[]> {
    const tasks = await tasksService.listRaw();
    return computeDepartmentWiseBreakdown(tasks, today);
  },

  /**
   * Full dashboard payload: summary cards + breakdowns + the lists behind
   * each section. Fetches TASKLIST/DOERLIST exactly once and derives every
   * number/section from that in-memory data — previously this fanned out
   * into ~10 independent re-reads of the same sheets per page load.
   */
  async getFullDashboard(today = todayIso()) {
    const [tasks, doers, checklistToday, activityTimeline] = await Promise.all([
      tasksService.listRaw(),
      usersService.list(),
      checklistService.listToday(today),
      activityService.listToday(today),
    ]);

    const doerMap = new Map(doers.map((d) => [d.id, d]));
    const withDoer = (task: Task) => ({
      ...task,
      doer: doerMap.get(task.assignedDoerId)
        ? {
            id: doerMap.get(task.assignedDoerId)!.id,
            name: doerMap.get(task.assignedDoerId)!.name,
            mobile: doerMap.get(task.assignedDoerId)!.mobile,
            email: doerMap.get(task.assignedDoerId)!.email,
            department: doerMap.get(task.assignedDoerId)!.department,
            role: doerMap.get(task.assignedDoerId)!.role,
          }
        : null,
    });

    const open = tasks.filter(isOpen);
    const upperUpcoming = addDaysIso(today, 3);

    const summary = computeSummary(tasks, checklistToday.length, today);
    const userWiseTasks = computeUserWiseBreakdown(tasks, doers, today);
    const departmentWiseTasks = computeDepartmentWiseBreakdown(tasks, today);

    const todaysTasks = tasks.filter((t) => t.dueDate === today && t.status !== "Cancelled");
    const urgentTasks = tasks.filter((t) => t.priority === "Urgent");
    const criticalTasks = tasks.filter((t) => t.priority === "Critical");
    const overdueTasks = open.filter((t) => isBeforeToday(t.dueDate, today));
    const upcomingTasks = tasks.filter(
      (t) => t.dueDate > today && t.dueDate <= upperUpcoming && t.status !== "Cancelled"
    );
    const revisionTodayTasks = tasks.filter((t) => t.revisionDate === today);
    const completedToday = tasks.filter(
      (t) => t.status === "Completed" && t.updatedAt.slice(0, 10) === today
    );

    return {
      summary,
      breakdowns: { userWiseTasks, departmentWiseTasks },
      sections: {
        todaysTasks: todaysTasks.map(withDoer),
        urgentTasks: urgentTasks.map(withDoer),
        criticalTasks: criticalTasks.map(withDoer),
        overdueTasks: overdueTasks.map(withDoer),
        upcomingTasks: upcomingTasks.map(withDoer),
        revisionTodayTasks: revisionTodayTasks.map(withDoer),
        checklistToday,
        completedToday: completedToday.map(withDoer),
        activityTimeline,
      },
    };
  },
};
