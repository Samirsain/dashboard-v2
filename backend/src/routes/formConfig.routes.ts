import { Router } from "express";
import { formConfigController } from "../controllers/formConfig.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { idParamSchema } from "../validation/user.schema";
import { createFormConfigSchema, updateFormMembersSchema } from "../validation/formConfig.schema";
import { setFormResponseStatusSchema, rowParamSchema } from "../validation/formResponseStatus.schema";

const router = Router();

router.use(requireAuth);

// Reading forms/responses is scoped per-user in the service (a doer only
// sees forms they've been granted access to; Admin sees all). Registering,
// removing, managing access, and setting a response's Working/Complete
// status are all Admin-only.
router.get("/", formConfigController.list);
router.get("/service-account", formConfigController.serviceAccount);
router.get("/:id/responses", validate({ params: idParamSchema }), formConfigController.responses);
router.get("/:id/statuses", validate({ params: idParamSchema }), formConfigController.statuses);
router.patch(
  "/:id/statuses/:row",
  requireRole("Admin"),
  validate({ params: rowParamSchema, body: setFormResponseStatusSchema }),
  formConfigController.setStatus
);
router.post(
  "/",
  requireRole("Admin"),
  validate({ body: createFormConfigSchema }),
  formConfigController.create
);
router.patch(
  "/:id/members",
  requireRole("Admin"),
  validate({ params: idParamSchema, body: updateFormMembersSchema }),
  formConfigController.updateMembers
);
router.delete(
  "/:id",
  requireRole("Admin"),
  validate({ params: idParamSchema }),
  formConfigController.remove
);

export default router;
