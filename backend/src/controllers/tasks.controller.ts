import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { tasksService } from "../services/tasks.service";
import { checklistService } from "../services/checklist.service";
import { usersService } from "../services/users.service";
import { canViewAllData, canCreateTask } from "../utils/access";
import { buildListVisibility } from "../utils/listAccess";
import { listsService } from "../services/lists.service";
import { AppError } from "../utils/AppError";
import type { CreateTaskInput, RevisionInput, TaskFilterQuery, UpdateTaskInput } from "../validation/task.schema";

export const tasksController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const filters = { ...(req.query as unknown as TaskFilterQuery) };
    // Normal doers only ever see their own tasks, whichever sheet those sit in
    // — hiding work someone is on the hook for would just break them.
    if (!canViewAllData(req.user)) {
      filters.assignedDoerId = req.user!.sub;
    }
    const tasks = await tasksService.list(filters);

    // View-all users other than the MD are still held to their sheet
    // membership from Settings. Without this a PC saw every task in every
    // sheet, so unticking one there had no effect.
    if (canViewAllData(req.user) && req.user?.role !== "MD") {
      const lists = await listsService.list();
      const canSee = buildListVisibility(req.user, lists);
      ok(res, tasks.filter((t) => canSee(t.listId, "task")));
      return;
    }

    ok(res, tasks);
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const task = await tasksService.getById(req.params.id as string);
    ok(res, task);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreateTaskInput;
    const task = await tasksService.create({ ...input, createdBy: req.user!.sub });
    created(res, task);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as UpdateTaskInput;
    // Marking a task done / editing its own fields stays open to the doer who
    // holds it, but moving a task to somebody else is a management decision —
    // otherwise anyone could hand their own overdue work to a colleague and
    // shed the penalty with it.
    if (input.assignedDoerId !== undefined && !canCreateTask(req.user)) {
      throw AppError.forbidden("Only MD/PC can reassign a task to a different doer.");
    }
    const task = await tasksService.update(req.params.id as string, input, req.user!.sub);
    ok(res, task);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await tasksService.remove(req.params.id as string, req.user!.sub);
    ok(res, { deleted: true });
  }),

  revise: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as RevisionInput;
    const task = await tasksService.revise(req.params.id as string, input, req.user!.sub);
    ok(res, task);
  }),

  revisionHistory: asyncHandler(async (req: Request, res: Response) => {
    const history = await tasksService.getRevisionHistory(req.params.id as string);
    ok(res, history);
  }),

  // Admin-only (enforced by requireRole("Admin") on the route) — permanently
  // deletes every Completed task, used to reset Team Performance scoring.
  removeCompleted: asyncHandler(async (_req: Request, res: Response) => {
    const deleted = await tasksService.removeCompleted();
    ok(res, { deleted });
  }),

  /**
   * "Someone's on long leave, hand off everything they're on the hook for" —
   * moves every OPEN task and active checklist template from one doer to
   * another in one action, e.g. from Settings. Only unfinished work moves:
   * Completed/Cancelled tasks and Inactive templates stay put, since there's
   * nothing left to do on them.
   *
   * Reassigning a checklist template already carries onto its still-Pending
   * generated instances (checklistService.updateTemplate does this), so
   * today's/this-week's occurrences move immediately too, not just future ones.
   */
  reassignAllWork: asyncHandler(async (req: Request, res: Response) => {
    const { fromDoerId, toDoerId } = req.body as { fromDoerId: string; toDoerId: string };
    if (!fromDoerId || !toDoerId) {
      throw AppError.badRequest("fromDoerId and toDoerId are required");
    }
    if (fromDoerId === toDoerId) {
      throw AppError.badRequest("Pick a different doer to reassign to");
    }
    // Fail fast with a clear message rather than letting a bad id surface as
    // a confusing per-item error partway through the loop below.
    await usersService.getById(toDoerId);

    const [openTasks, templates] = await Promise.all([
      tasksService.listRaw({ assignedDoerId: fromDoerId }),
      checklistService.listTemplates(),
    ]);

    const tasksToMove = openTasks.filter(
      (t) => t.status !== "Completed" && t.status !== "Cancelled"
    );
    const templatesToMove = templates.filter(
      (t) => t.assignedDoerId === fromDoerId && t.status === "Active"
    );

    await Promise.all([
      ...tasksToMove.map((t) =>
        tasksService.update(t.id, { assignedDoerId: toDoerId }, req.user!.sub)
      ),
      ...templatesToMove.map((t) =>
        checklistService.updateTemplate(t.id, { assignedDoerId: toDoerId })
      ),
    ]);

    ok(res, {
      tasksReassigned: tasksToMove.length,
      checklistsReassigned: templatesToMove.length,
    });
  }),
};
