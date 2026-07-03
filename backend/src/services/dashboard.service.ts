import { tasksService } from "./tasks.service";
import { checklistService } from "./checklist.service";
import { activityService } from "./activity.service";
import { usersService } from "./users.service";
import { addDaysIso, isBeforeToday, todayIso } from "../utils/date";
import type { DashboardSummary, DepartmentWiseTaskStat, Task, UserWiseTaskStat } from "../types";

function isOpen(task: Task): boolean {
  return task.status !== "Completed" && task.status !== "Cancelled";
}

export const dashboardService = {
  /** The at-a-glance numbers used by the dashboard's KPI cards. */
  async getSummary(today = todayIso()): Promise<DashboardSummary> {
    const [allTasks, checklistToday] = await Promise.all([
      tasksService.listRaw(),
      checklistService.listToday(today),
    ]);

    const overdue = allTasks.filter((t) => isBeforeToday(t.dueDate, today) && isOpen(t));
    const todaysTasks = allTasks.filter((t) => t.dueDate === today && t.status !== "Cancelled");
    const upcoming = allTasks.filter(
      (t) => t.dueDate > today && t.dueDate <= addDaysIso(today, 3) && t.status !== "Cancelled"
    );
    const todaysRevisions = allTasks.filter((t) => t.revisionDate === today);

    return {
      totalTasks: allTasks.length,
      pending: allTasks.filter((t) => t.status === "Pending" || t.status === "In Progress").length,
      completed: allTasks.filter((t) => t.status === "Completed").length,
      overdue: overdue.length,
      todaysTasks: todaysTasks.length,
      todaysRevisions: todaysRevisions.length,
      urgent: allTasks.filter((t) => t.priority === "Urgent").length,
      critical: allTasks.filter((t) => t.priority === "Critical").length,
      checklistToday: checklistToday.length,
      upcoming: upcoming.length,
    };
  },

  /** Per-doer task counts, using DOERLIST for names (never grouped by name). */
  async getUserWiseBreakdown(today = todayIso()): Promise<UserWiseTaskStat[]> {
    const [tasks, doers] = await Promise.all([tasksService.listRaw(), usersService.list()]);

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
  },

  async getDepartmentWiseBreakdown(today = todayIso()): Promise<DepartmentWiseTaskStat[]> {
    const tasks = await tasksService.listRaw();
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
  },

  /** Full dashboard payload: summary cards + breakdowns + the lists behind each section. */
  async getFullDashboard(today = todayIso()) {
    const [
      summary,
      userWiseTasks,
      departmentWiseTasks,
      todaysTasks,
      urgentTasks,
      criticalTasks,
      overdueTasks,
      upcomingTasks,
      revisionTodayTasks,
      checklistToday,
      completedToday,
      activityTimeline,
    ] = await Promise.all([
      this.getSummary(today),
      this.getUserWiseBreakdown(today),
      this.getDepartmentWiseBreakdown(today),
      tasksService.getDueToday(today),
      tasksService.list({ priority: "Urgent" }),
      tasksService.list({ priority: "Critical" }),
      tasksService.getOverdue(today),
      tasksService.getUpcoming(3, today),
      tasksService.getRevisedToday(today),
      checklistService.listToday(today),
      tasksService.list({ status: "Completed" }).then((tasks) =>
        tasks.filter((t) => t.updatedAt.slice(0, 10) === today)
      ),
      activityService.listToday(today),
    ]);

    return {
      summary,
      breakdowns: { userWiseTasks, departmentWiseTasks },
      sections: {
        todaysTasks,
        urgentTasks,
        criticalTasks,
        overdueTasks,
        upcomingTasks,
        revisionTodayTasks,
        checklistToday,
        completedToday,
        activityTimeline,
      },
    };
  },
};
