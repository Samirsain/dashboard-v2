import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { listsService } from "../services/lists.service";
import type { ListType } from "../types";

export const listsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const type = req.query.type as ListType | undefined;
    ok(res, await listsService.list(type));
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { name, type } = req.body as { name: string; type: ListType };
    created(res, await listsService.create({ name, type }));
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await listsService.remove(req.params.id as string);
    ok(res, { deleted: true });
  }),
};
