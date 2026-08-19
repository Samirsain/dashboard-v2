import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { workflowService } from "../services/workflow.service";
import { canManageWorkflow } from "../utils/access";
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

  updateTemplate: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreateWorkflowTemplateInput;
    ok(res, await workflowService.updateTemplate(req.params.id as string, input));
  }),

  removeTemplate: asyncHandler(async (req: Request, res: Response) => {
    await workflowService.removeTemplate(req.params.id as string);
    ok(res, { deleted: true });
  }),

  exportTemplate: asyncHandler(async (req: Request, res: Response) => {
    ok(res, await workflowService.exportTemplateData(req.params.id as string));
  }),

  /** Everything in flight across every template — the manager's landing view. */
  overview: asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await workflowService.getOverview());
  }),

  listInstances: asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as WorkflowInstanceStatus | undefined;
    ok(res, await workflowService.listInstances({ status }));
  }),

  getInstance: asyncHandler(async (req: Request, res: Response) => {
    ok(res, await workflowService.getInstanceDetail(req.params.id as string));
  }),

  removeInstance: asyncHandler(async (req: Request, res: Response) => {
    await workflowService.removeInstance(req.params.id as string);
    ok(res, { deleted: true });
  }),

  /** The signed-in user's own workflow steps — the whole of the Doer's view. */
  mySteps: asyncHandler(async (req: Request, res: Response) => {
    ok(res, await workflowService.listStepsForDoer(req.user!.sub));
  }),

  startInstance: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as StartWorkflowInstanceInput;
    created(res, await workflowService.startInstance({ ...input, requestedBy: req.user!.sub }));
  }),

  completeStep: asyncHandler(async (req: Request, res: Response) => {
    const stepNo = Number(req.params.stepNo);
    ok(
      res,
      await workflowService.completeStep(
        req.params.id as string,
        stepNo,
        req.user!.sub,
        canManageWorkflow(req.user)
      )
    );
  }),

  rejectStep: asyncHandler(async (req: Request, res: Response) => {
    const stepNo = Number(req.params.stepNo);
    ok(
      res,
      await workflowService.rejectStep(
        req.params.id as string,
        stepNo,
        req.user!.sub,
        (req.body as { reason: string }).reason,
        canManageWorkflow(req.user)
      )
    );
  }),
};
