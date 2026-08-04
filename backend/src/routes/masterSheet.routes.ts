import { Router } from "express";
import { masterSheetController } from "../controllers/masterSheet.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";
import { canManageMasterSheet } from "../utils/access";
import { idParamSchema } from "../validation/user.schema";
import {
  createMasterSheetSchema,
  updateMasterSheetSchema,
} from "../validation/masterSheet.schema";

const router = Router();

router.use(requireAuth);

// Any signed-in user can read the Master Sheet; only Admin edits it.
router.get("/", masterSheetController.list);
router.post(
  "/",
  requirePermission(canManageMasterSheet),
  validate({ body: createMasterSheetSchema }),
  masterSheetController.create
);
router.patch(
  "/:id",
  requirePermission(canManageMasterSheet),
  validate({ params: idParamSchema, body: updateMasterSheetSchema }),
  masterSheetController.update
);
router.delete(
  "/:id",
  requirePermission(canManageMasterSheet),
  validate({ params: idParamSchema }),
  masterSheetController.remove
);

export default router;
