import { Router } from "express";
import { formConfigController } from "../controllers/formConfig.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { idParamSchema } from "../validation/user.schema";
import { createFormConfigSchema } from "../validation/formConfig.schema";

const router = Router();

router.use(requireAuth);

// Any signed-in user can view registered forms and read their responses;
// only Admin/Manager/PC register or remove a form.
router.get("/", formConfigController.list);
router.get("/:id/responses", validate({ params: idParamSchema }), formConfigController.responses);
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
