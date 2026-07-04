import { Router } from "express";
import { checklistController } from "../controllers/checklist.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { idParamSchema } from "../validation/user.schema";
import {
  createChecklistTemplateSchema,
  updateChecklistTemplateSchema,
} from "../validation/checklist.schema";

const router = Router();

router.use(requireAuth);

// Templates
router.get("/templates", checklistController.listTemplates);
router.get("/templates/:id", validate({ params: idParamSchema }), checklistController.getTemplate);
router.post(
  "/templates",
  validate({ body: createChecklistTemplateSchema }),
  checklistController.createTemplate
);
router.patch(
  "/templates/:id",
  validate({ params: idParamSchema, body: updateChecklistTemplateSchema }),
  checklistController.updateTemplate
);
router.delete(
  "/templates/:id",
  validate({ params: idParamSchema }),
  checklistController.removeTemplate
);

// Instances (today's generated checklist)
router.get("/instances", checklistController.listInstances);
router.get("/today", checklistController.listToday);
router.post(
  "/instances/:id/complete",
  validate({ params: idParamSchema }),
  checklistController.completeInstance
);
router.post("/generate", checklistController.generateToday);

export default router;
