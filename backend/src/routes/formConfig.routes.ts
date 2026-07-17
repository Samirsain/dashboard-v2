import { Router } from "express";
import { formConfigController } from "../controllers/formConfig.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { idParamSchema } from "../validation/user.schema";
import { createFormConfigSchema } from "../validation/formConfig.schema";
import { setFormResponseStatusSchema, rowParamSchema } from "../validation/formResponseStatus.schema";

const router = Router();

router.use(requireAuth);

// Any signed-in user can view registered forms and read their responses;
// only Admin/Manager/PC register or remove a form, or set a response's
// Working/Complete status.
router.get("/", formConfigController.list);
router.get("/service-account", formConfigController.serviceAccount);
router.get("/:id/responses", validate({ params: idParamSchema }), formConfigController.responses);
router.get("/:id/statuses", validate({ params: idParamSchema }), formConfigController.statuses);
router.patch(
  "/:id/statuses/:row",
  requireRole("Admin", "Manager", "PC"),
  validate({ params: rowParamSchema, body: setFormResponseStatusSchema }),
  formConfigController.setStatus
);
router.post(
  "/",
  requireRole("Admin", "Manager", "PC"),
  validate({ body: createFormConfigSchema }),
  formConfigController.create
);
router.delete(
  "/:id",
  requireRole("Admin", "Manager"),
  validate({ params: idParamSchema }),
  formConfigController.remove
);

export default router;
