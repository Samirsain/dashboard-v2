import { Router } from "express";
import { workflowController } from "../controllers/workflow.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
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
  requireRole("Admin"),
  validate({ body: createWorkflowTemplateSchema }),
  workflowController.createTemplate
);
router.delete(
  "/templates/:id",
  requireRole("Admin"),
  validate({ params: idParamSchema }),
  workflowController.removeTemplate
);

// Instances (runs) — any authenticated user can start a run and act on their
// own step, same openness as marking a task/checklist item done.
router.get("/instances", workflowController.listInstances);
router.get("/instances/:id", validate({ params: idParamSchema }), workflowController.getInstance);
router.post(
  "/instances",
  validate({ body: startWorkflowInstanceSchema }),
  workflowController.startInstance
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
