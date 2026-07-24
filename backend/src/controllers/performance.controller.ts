import type { Request, Response, NextFunction } from "express";
import { usersService } from "../services/users.service";
import { tasksService } from "../services/tasks.service";
import { checklistService } from "../services/checklist.service";
import { archiveService } from "../services/archive.service";
import { buildDgmaxWeeklySummary } from "../utils/dgmaxScoring";
import { todayIso } from "../utils/date";

function currentWeekLabel(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export const performanceController = {
  async getDgmaxSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const today = todayIso();
      const weekLabel = (req.query.week as string) || currentWeekLabel();
      const [users, tasks, checklistInstances] = await Promise.all([
        usersService.list(),
        tasksService.list({}),
        checklistService.listInstances({}),
      ]);

      const summary = buildDgmaxWeeklySummary(users, tasks, checklistInstances, today, weekLabel);
      res.json({ status: "success", data: summary });
    } catch (err) {
      next(err);
    }
  },

  async archiveWeek(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const weekLabel = req.body.weekLabel || currentWeekLabel();
      const remarks = req.body.remarks || {};
      const archivedBy = (req as unknown as { user?: { sub?: string } }).user?.sub || "Admin";

      const created = await archiveService.archiveWeek(weekLabel, remarks, archivedBy);
      res.status(201).json({ status: "success", data: created });
    } catch (err) {
      next(err);
    }
  },

  async listArchives(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const weekLabel = req.query.weekLabel as string | undefined;
      const employeeId = req.query.employeeId as string | undefined;

      const archives = await archiveService.listArchives(weekLabel, employeeId);
      res.json({ status: "success", data: archives });
    } catch (err) {
      next(err);
    }
  },
};
