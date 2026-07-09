import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { masterSheetService } from "../services/masterSheet.service";
import type {
  CreateMasterSheetInput,
  UpdateMasterSheetInput,
} from "../validation/masterSheet.schema";

export const masterSheetController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await masterSheetService.list());
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreateMasterSheetInput;
    created(res, await masterSheetService.create(input));
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as UpdateMasterSheetInput;
    ok(res, await masterSheetService.update(req.params.id as string, input));
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await masterSheetService.remove(req.params.id as string);
    ok(res, { deleted: true });
  }),
};
