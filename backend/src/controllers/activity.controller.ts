import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok } from "../utils/response";
import { activityService } from "../services/activity.service";

export const activityController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await activityService.list());
  }),

  today: asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await activityService.listToday());
  }),
};
