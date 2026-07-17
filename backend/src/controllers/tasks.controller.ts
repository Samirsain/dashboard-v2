import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { tasksService } from "../services/tasks.service";
import { canViewAllData } from "../utils/access";
import type { CreateTaskInput, RevisionInput, TaskFilterQuery, UpdateTaskInput } from "../validation/task.schema";

export const tasksController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const filters = { ...(req.query as unknown as TaskFilterQuery) };
    // Normal doers only ever see their own tasks; admins and
    // canViewAll doers see everything (optionally still narrowed by query).
    if (!canViewAllData(req.user)) {
      filters.assignedDoerId = req.user!.sub;
    }
    const tasks = await tasksService.list(filters);
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
};
