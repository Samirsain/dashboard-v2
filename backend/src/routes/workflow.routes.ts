import { Router } from "express";
import { workflowController } from "../controllers/workflow.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";
import { canManageWorkflow } from "../utils/access";
import { idParamSchema } from "../validation/user.schema";
import {
  createWorkflowTemplateSchema,
  startWorkflowInstanceSchema,
  stepNoParamSchema,
} from "../validation/workflow.schema";

const router = Router();

router.use(requireAuth);

// Templates (the step chain: What/Who/How/TAT) are admin-managed configuration.
router.get("/templates", workflowController.listTemplates);
router.get("/templates/:id", validate({ params: idParamSchema }), workflowController.getTemplate);
router.post(
  "/templates",
  requirePermission(canManageWorkflow),
  validate({ body: createWorkflowTemplateSchema }),
  workflowController.createTemplate
);
router.delete(
  "/templates/:id",
  requirePermission(canManageWorkflow),
  validate({ params: idParamSchema }),
  workflowController.removeTemplate
);

// A doer's own steps — this is the entire Workflow page for anyone who can't
// manage workflows, so it stays open to every signed-in user.
router.get("/my-steps", workflowController.mySteps);

// Instances (runs). Starting one is a management decision, same as creating a
// template; acting on your OWN step stays open to every doer, like marking a
// task or checklist item done.
router.get("/instances", workflowController.listInstances);
router.get("/instances/:id", validate({ params: idParamSchema }), workflowController.getInstance);
router.post(
  "/instances",
  requirePermission(canManageWorkflow),
  validate({ body: startWorkflowInstanceSchema }),
  workflowController.startInstance
);
router.delete(
  "/instances/:id",
  requirePermission(canManageWorkflow),
  validate({ params: idParamSchema }),
  workflowController.removeInstance
);
router.post(
  "/instances/:id/steps/:stepNo/complete",
  validate({ params: stepNoParamSchema }),
  workflowController.completeStep
);
router.post(
  "/instances/:id/steps/:stepNo/reject",
  validate({ params: stepNoParamSchema }),
  workflowController.rejectStep
);

export default router;
