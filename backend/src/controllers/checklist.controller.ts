import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { checklistService } from "../services/checklist.service";
import { canViewAllData } from "../utils/access";
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

  // Admin-only (enforced by requireRole("Admin") on the route) — permanently
  // deletes every Completed checklist instance, used to reset Team Performance scoring.
  removeCompletedInstances: asyncHandler(async (_req: Request, res: Response) => {
    const deleted = await checklistService.removeCompletedInstances();
    ok(res, { deleted });
  }),

  listInstances: asyncHandler(async (req: Request, res: Response) => {
    const { date, status, assignedDoerId } = req.query as Record<string, string | undefined>;
    // Normal doers are scoped to their own checklist items; view-all users see everyone's.
    const scopedDoerId = canViewAllData(req.user) ? assignedDoerId : req.user!.sub;
    ok(
      res,
      await checklistService.listInstances({
        date,
        status: status as never,
        assignedDoerId: scopedDoerId,
      })
    );
  }),

  listToday: asyncHandler(async (req: Request, res: Response) => {
    const all = await checklistService.listToday();
    const scoped = canViewAllData(req.user)
      ? all
      : all.filter((i) => i.assignedDoerId === req.user!.sub);
    ok(res, scoped);
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
