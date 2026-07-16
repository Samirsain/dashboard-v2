import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { formConfigService } from "../services/formConfig.service";
import { formResponsesService } from "../services/formResponses.service";
import type { CreateFormConfigInput } from "../validation/formConfig.schema";

export const formConfigController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await formConfigService.list());
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreateFormConfigInput;
    created(res, await formConfigService.create(input));
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await formConfigService.remove(req.params.id as string);
    ok(res, { deleted: true });
  }),

  responses: asyncHandler(async (req: Request, res: Response) => {
    ok(res, await formResponsesService.getResponses(req.params.id as string));
  }),
};
