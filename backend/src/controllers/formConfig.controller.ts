import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { env } from "../config/env";
import { formConfigService } from "../services/formConfig.service";
import { formResponsesService } from "../services/formResponses.service";
import type { CreateFormConfigInput } from "../validation/formConfig.schema";

/** The service account email a form's Sheet must be shared with. Not secret. */
function resolveServiceAccountEmail(): string {
  if (env.google.serviceAccountEmail) return env.google.serviceAccountEmail;
  if (env.google.serviceAccountJson) {
    try {
      const parsed = JSON.parse(env.google.serviceAccountJson) as { client_email?: string };
      return parsed.client_email ?? "";
    } catch {
      return "";
    }
  }
  return "";
}

export const formConfigController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await formConfigService.list());
  }),

  serviceAccount: asyncHandler(async (_req: Request, res: Response) => {
    ok(res, { email: resolveServiceAccountEmail() });
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
