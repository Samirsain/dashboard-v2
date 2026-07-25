import type { Request, Response, NextFunction } from "express";
import { usersService } from "../services/users.service";
import { tasksService } from "../services/tasks.service";
import { revisionsService } from "../services/revisions.service";
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

/**
 * Late Done penalty weight. Defaults to 60% and can be overridden per request
 * via ?lateWeight= so the figure stays tunable without a code change.
 */
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
      // Task List only — checklist items are routine work and are not scored.
      // Revisions come along so scoring can measure against original due dates.
      const [users, tasks, revisions] = await Promise.all([
        usersService.list(),
        tasksService.list({}),
        revisionsService.listAll(),
      ]);

      const summary = buildDgmaxWeeklySummary(users, tasks, revisions, today, from, to, lateWeight);
      res.json({ status: "success", data: summary });
    } catch (err) {
      next(err);
    }
  },
};
