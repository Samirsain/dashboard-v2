import { Router } from "express";
import { workflowController } from "../controllers/workflow.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";
import { canManageWorkflow } from "../utils/access";
import { idParamSchema } from "../validation/user.schema";
import {
  createWorkflowTemplateSchema,
  rejectStepSchema,
  startWorkflowInstanceSchema,
  stepNoParamSchema,
  updateWorkflowTemplateSchema,
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
router.patch(
  "/templates/:id",
  requirePermission(canManageWorkflow),
  validate({ params: idParamSchema, body: updateWorkflowTemplateSchema }),
  workflowController.updateTemplate
);
router.delete(
  "/templates/:id",
  requirePermission(canManageWorkflow),
  validate({ params: idParamSchema }),
  workflowController.removeTemplate
);
// Registered before "/templates/:id" would matter if "export" collided with
// an id, but Express matches this literal path fine either way since it's
// nested one level deeper.
router.get(
  "/templates/:id/export",
  requirePermission(canManageWorkflow),
  validate({ params: idParamSchema }),
  workflowController.exportTemplate
);

// Cross-template live status. Management-only: it deliberately shows every
// person's outstanding work, which is exactly what a doer's view must not.
router.get("/overview", requirePermission(canManageWorkflow), workflowController.overview);

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
  validate({ params: stepNoParamSchema, body: rejectStepSchema }),
  workflowController.rejectStep
);

export default router;
