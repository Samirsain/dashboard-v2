import { Router } from "express";
import { masterSheetController } from "../controllers/masterSheet.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
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
  requireRole("Admin"),
  validate({ body: createMasterSheetSchema }),
  masterSheetController.create
);
router.patch(
  "/:id",
  requireRole("Admin"),
  validate({ params: idParamSchema, body: updateMasterSheetSchema }),
  masterSheetController.update
);
router.delete(
  "/:id",
  requireRole("Admin"),
  validate({ params: idParamSchema }),
  masterSheetController.remove
);

export default router;
