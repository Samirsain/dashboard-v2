import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok } from "../utils/response";
import { dashboardService } from "../services/dashboard.service";

export const dashboardController = {
  summary: asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await dashboardService.getSummary());
  }),

  full: asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await dashboardService.getFullDashboard());
  }),
};
