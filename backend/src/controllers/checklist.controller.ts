import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { checklistService } from "../services/checklist.service";
import type {
  CreateChecklistTemplateInput,
  UpdateChecklistTemplateInput,
} from "../validation/checklist.schema";

export const checklistController = {
  listTemplates: asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await checklistService.listTemplates());
  }),

  getTemplate: asyncHandler(async (req: Request, res: Response) => {
    ok(res, await checklistService.getTemplateById(req.params.id as string));
  }),

  createTemplate: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreateChecklistTemplateInput;
    created(res, await checklistService.createTemplate(input));
  }),

  updateTemplate: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as UpdateChecklistTemplateInput;
    ok(res, await checklistService.updateTemplate(req.params.id as string, input));
  }),

  removeTemplate: asyncHandler(async (req: Request, res: Response) => {
    await checklistService.removeTemplate(req.params.id as string);
    ok(res, { deleted: true });
  }),

  listInstances: asyncHandler(async (req: Request, res: Response) => {
    const { date, status, assignedTo } = req.query as Record<string, string | undefined>;
    ok(
      res,
      await checklistService.listInstances({
        date,
        status: status as never,
        assignedTo,
      })
    );
  }),

  listToday: asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await checklistService.listToday());
  }),

  completeInstance: asyncHandler(async (req: Request, res: Response) => {
    const instance = await checklistService.completeInstance(
      req.params.id as string,
      req.user!.sub
    );
    ok(res, instance);
  }),

  /** Manual trigger for the generation algorithm — mainly useful for testing/ops. */
  generateToday: asyncHandler(async (_req: Request, res: Response) => {
    const generated = await checklistService.generateInstancesForDate();
    created(res, generated);
  }),
};
