import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { workflowService } from "../services/workflow.service";
import type { CreateWorkflowTemplateInput, StartWorkflowInstanceInput } from "../validation/workflow.schema";
import type { WorkflowInstanceStatus } from "../types";

export const workflowController = {
  listTemplates: asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await workflowService.listTemplates());
  }),

  getTemplate: asyncHandler(async (req: Request, res: Response) => {
    ok(res, await workflowService.getTemplate(req.params.id as string));
  }),

  createTemplate: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreateWorkflowTemplateInput;
    created(res, await workflowService.createTemplate(input));
  }),

  removeTemplate: asyncHandler(async (req: Request, res: Response) => {
    await workflowService.removeTemplate(req.params.id as string);
    ok(res, { deleted: true });
  }),

  listInstances: asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as WorkflowInstanceStatus | undefined;
    ok(res, await workflowService.listInstances({ status }));
  }),

  getInstance: asyncHandler(async (req: Request, res: Response) => {
    ok(res, await workflowService.getInstanceDetail(req.params.id as string));
  }),

  startInstance: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as StartWorkflowInstanceInput;
    created(res, await workflowService.startInstance({ ...input, requestedBy: req.user!.sub }));
  }),

  completeStep: asyncHandler(async (req: Request, res: Response) => {
    const stepNo = Number(req.params.stepNo);
    ok(res, await workflowService.completeStep(req.params.id as string, stepNo, req.user!.sub));
  }),

  rejectStep: asyncHandler(async (req: Request, res: Response) => {
    const stepNo = Number(req.params.stepNo);
    ok(res, await workflowService.rejectStep(req.params.id as string, stepNo, req.user!.sub));
  }),
};
