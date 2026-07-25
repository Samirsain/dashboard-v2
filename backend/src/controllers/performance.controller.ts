import type { Request, Response, NextFunction } from "express";
import { usersService } from "../services/users.service";
import { tasksService } from "../services/tasks.service";
import { checklistService } from "../services/checklist.service";
import { archiveService } from "../services/archive.service";
import { buildDgmaxWeeklySummary, DEFAULT_LATE_DONE_WEIGHT } from "../utils/dgmaxScoring";
import { todayIso, mondayOfIso, addDaysIso, isValidIsoDate } from "../utils/date";

/** Resolves the [from, to] week window from query params, defaulting to the current Mon-Sun week. */
function resolveWeekRange(req: Request): { from: string; to: string } {
  const q = req.query as { from?: string; to?: string; week?: string };
  if (q.from && q.to && isValidIsoDate(q.from) && isValidIsoDate(q.to)) {
    return { from: q.from, to: q.to };
  }
  // Snap whatever date we were given (or today) back to its Monday.
  const from = mondayOfIso(q.week && isValidIsoDate(q.week) ? q.week : undefined);
  return { from, to: addDaysIso(from, 6) };
}

function resolveLateWeight(req: Request): number {
  const raw = Number((req.query as { lateWeight?: string }).lateWeight);
  return Number.isFinite(raw) ? raw : DEFAULT_LATE_DONE_WEIGHT;
}

export const performanceController = {
  async getDgmaxSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const today = todayIso();
      const { from, to } = resolveWeekRange(req);
      const lateWeight = resolveLateWeight(req);
      const [users, tasks, checklistInstances] = await Promise.all([
        usersService.list(),
        tasksService.list({}),
        checklistService.listInstances({}),
      ]);

      const summary = buildDgmaxWeeklySummary(users, tasks, checklistInstances, today, from, to, lateWeight);
      res.json({ status: "success", data: summary });
    } catch (err) {
      next(err);
    }
  },

  async archiveWeek(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as { from?: string; to?: string; weekLabel?: string; lateWeight?: number; remarks?: Record<string, string> };
      const from = body.from && isValidIsoDate(body.from) ? body.from : mondayOfIso();
      const to = body.to && isValidIsoDate(body.to) ? body.to : addDaysIso(from, 6);
      const lateWeight = Number(body.lateWeight) || DEFAULT_LATE_DONE_WEIGHT;
      const weekLabel = body.weekLabel || `${from} to ${to}`;
      const remarks = body.remarks || {};
      const archivedBy = (req as unknown as { user?: { sub?: string } }).user?.sub || "Admin";

      const created = await archiveService.archiveWeek(weekLabel, from, to, lateWeight, remarks, archivedBy);
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
