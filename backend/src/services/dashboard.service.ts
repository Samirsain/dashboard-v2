import { tasksService } from "./tasks.service";
import { checklistService } from "./checklist.service";
import { activityService } from "./activity.service";
import { todayIso } from "../utils/date";
import type { DashboardSummary } from "../types";

export const dashboardService = {
  /** The at-a-glance numbers used by the dashboard's KPI cards. */
  async getSummary(today = todayIso()): Promise<DashboardSummary> {
    const [allTasks, overdue, dueToday, upcoming, revisionToday, checklistToday] =
      await Promise.all([
        tasksService.list(),
        tasksService.getOverdue(today),
        tasksService.getDueToday(today),
        tasksService.getUpcoming(3, today),
        tasksService.getRevisedToday(today),
        checklistService.listToday(today),
      ]);

    return {
      totalTasks: allTasks.length,
      completed: allTasks.filter((t) => t.status === "Completed").length,
      pending: allTasks.filter((t) => t.status === "Pending" || t.status === "In Progress").length,
      urgent: allTasks.filter((t) => t.priority === "Urgent" || t.priority === "Critical").length,
      overdue: overdue.length,
      revisionToday: revisionToday.length,
      checklistToday: checklistToday.length,
      todaysDue: dueToday.length,
      upcoming: upcoming.length,
    };
  },

  /** Full dashboard payload: summary cards + the underlying lists for each section. */
  async getFullDashboard(today = todayIso()) {
    const [
      summary,
      todaysTasks,
      urgentTasks,
      overdueTasks,
      upcomingTasks,
      revisionTodayTasks,
      checklistToday,
      completedToday,
      activityTimeline,
    ] = await Promise.all([
      this.getSummary(today),
      tasksService.getDueToday(today),
      tasksService.list({ priority: "Urgent" }),
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
      sections: {
        todaysTasks,
        urgentTasks,
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
