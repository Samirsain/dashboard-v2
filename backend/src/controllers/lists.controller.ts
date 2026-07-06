import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { listsService } from "../services/lists.service";
import type { ListType } from "../types";

export const listsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const type = req.query.type as ListType | undefined;
    ok(res, await listsService.list({ type, user: req.user }));
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { name, type, memberIds } = req.body as {
      name: string;
      type: ListType;
      memberIds?: string[];
    };
    created(res, await listsService.create({ name, type, memberIds }));
  }),

  updateMembers: asyncHandler(async (req: Request, res: Response) => {
    const { memberIds } = req.body as { memberIds: string[] };
    ok(res, await listsService.updateMembers(req.params.id as string, memberIds));
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await listsService.remove(req.params.id as string);
    ok(res, { deleted: true });
  }),
};
