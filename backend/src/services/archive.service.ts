import { sheetsConfig } from "../config/sheets.config";
import { dataService, type SheetRecord } from "./data.service";
import { usersService } from "./users.service";
import { tasksService } from "./tasks.service";
import { checklistService } from "./checklist.service";
import { generateId } from "../utils/id";
import { todayIso } from "../utils/date";
import { buildDgmaxWeeklySummary } from "../utils/dgmaxScoring";
import type { WeeklyArchive } from "../types";

const entity = sheetsConfig.weeklyArchives;

function toWeeklyArchive(record: SheetRecord): WeeklyArchive {
  return {
    id: record["Archive ID"] ?? "",
    weekLabel: record["Week Label"] ?? "",
    employeeId: record["Employee ID"] ?? "",
    employeeName: record["Employee Name"] ?? "",
    department: record["Department"] ?? "",
    assignedTasks: Number(record["Assigned Tasks"] ?? "0") || 0,
    completedTasks: Number(record["Completed Tasks"] ?? "0") || 0,
    greenCount: Number(record["Green Count"] ?? "0") || 0,
    yellowCount: Number(record["Yellow Count"] ?? "0") || 0,
    redCount: Number(record["Red Count"] ?? "0") || 0,
    pendingCount: Number(record["Pending Count"] ?? "0") || 0,
    performanceScore: Number(record["Performance Score"] ?? "0") || 0,
    managerRemarks: record["Manager Remarks"] ?? "",
    archivedBy: record["Archived By"] ?? "",
    archivedAt: record["Archived At"] ?? "",
  };
}

export const archiveService = {
  async archiveWeek(
    weekLabel: string,
    remarks: Record<string, string>, // employeeId -> remark
    archivedBy: string
  ): Promise<WeeklyArchive[]> {
    const today = todayIso();
    const [users, tasks, checklistInstances] = await Promise.all([
      usersService.list(),
      tasksService.list({}),
      checklistService.listInstances({}),
    ]);

    const summary = buildDgmaxWeeklySummary(users, tasks, checklistInstances, today, weekLabel);
    const nowIso = new Date().toISOString();

    const created: WeeklyArchive[] = [];

    for (const s of summary.summaries) {
      const record: SheetRecord = {
        "Archive ID": generateId("ARC"),
        "Week Label": weekLabel,
        "Employee ID": s.doerId,
        "Employee Name": s.doerName,
        Department: s.department,
        "Assigned Tasks": String(s.assignedTasks),
        "Completed Tasks": String(s.completedTasks),
        "Green Count": String(s.greenCount),
        "Yellow Count": String(s.yellowCount),
        "Red Count": String(s.redCount),
        "Pending Count": String(s.pendingCount),
        "Performance Score": String(s.performanceScore),
        "Manager Remarks": remarks[s.doerId] || "",
        "Archived By": archivedBy,
        "Archived At": nowIso,
      };

      const saved = await dataService.append(entity, record);
      created.push(toWeeklyArchive(saved));
    }

    return created;
  },

  async listArchives(weekLabel?: string, employeeId?: string): Promise<WeeklyArchive[]> {
    const records = await dataService.findAll(entity);
    return records
      .map(toWeeklyArchive)
      .filter((r) => (!weekLabel || r.weekLabel === weekLabel) && (!employeeId || r.employeeId === employeeId))
      .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
  },
};
