import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { checklistService } from "../services/checklist.service";
import { canViewAllData } from "../utils/access";
import { buildListVisibility } from "../utils/listAccess";
import { listsService } from "../services/lists.service";
import type {
  CreateChecklistTemplateInput,
  UpdateChecklistTemplateInput,
} from "../validation/checklist.schema";

/**
 * Checklist instances carry no list of their own — they inherit it from the
 * template that generated them, so scoping by sheet has to go through that.
 * Returns the instances the user is allowed to see.
 */
async function scopeInstancesToLists<T extends { templateId: string }>(
  user: Request["user"],
  instances: T[]
): Promise<T[]> {
  if (user?.role === "MD") return instances;
  const [templates, lists] = await Promise.all([
    checklistService.listTemplates(),
    listsService.list(),
  ]);
  const listIdByTemplate = new Map(templates.map((t) => [t.id, t.listId]));
  const canSee = buildListVisibility(user, lists);
  return instances.filter((i) => canSee(listIdByTemplate.get(i.templateId) ?? "", "checklist"));
}

export const checklistController = {
  listTemplates: asyncHandler(async (req: Request, res: Response) => {
    const templates = await checklistService.listTemplates();

    // A plain doer only needs their own recurring items.
    if (!canViewAllData(req.user)) {
      ok(res, templates.filter((t) => t.assignedDoerId === req.user!.sub));
      return;
    }
    // View-all users other than the MD are held to their sheet membership.
    if (req.user?.role !== "MD") {
      const lists = await listsService.list();
      const canSee = buildListVisibility(req.user, lists);
      ok(res, templates.filter((t) => canSee(t.listId, "checklist")));
      return;
    }
    ok(res, templates);
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
    const instances = await checklistService.listInstances({
      date,
      status: status as never,
      assignedDoerId: scopedDoerId,
    });
    // A doer keeps their own items whatever sheet those live in; view-all
    // users are held to their sheet membership.
    if (!canViewAllData(req.user)) {
      ok(res, instances);
      return;
    }
    ok(res, await scopeInstancesToLists(req.user, instances));
  }),

  listToday: asyncHandler(async (req: Request, res: Response) => {
    const all = await checklistService.listToday();
    if (!canViewAllData(req.user)) {
      ok(res, all.filter((i) => i.assignedDoerId === req.user!.sub));
      return;
    }
    ok(res, await scopeInstancesToLists(req.user, all));
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
