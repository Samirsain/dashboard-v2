import { Router } from "express";
import { usersController } from "../controllers/users.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole, requirePermission, forbidAssistant } from "../middleware/role.middleware";
import { canManageDoers } from "../utils/access";
import {
  createUserSchema,
  idParamSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "../validation/user.schema";

const router = Router();

router.use(requireAuth);

// Doer Management (create/update/reset-password) is MD-only by default, but
// a PC can be granted it individually — see canManageDoers. Role and
// permission-flag changes stay MD-only regardless (enforced in the
// controller, since PATCH also carries plain profile edits a permitted PC
// can make). Deleting a doer never delegates. GET stays open to everyone so
// the rest of the app can still resolve names/roles.
router.get("/", usersController.list);
router.get("/:id", validate({ params: idParamSchema }), usersController.getById);
router.post(
  "/",
  requirePermission(canManageDoers),
  validate({ body: createUserSchema }),
  usersController.create
);
router.patch(
  "/:id",
  requirePermission(canManageDoers),
  validate({ params: idParamSchema, body: updateUserSchema }),
  usersController.update
);
router.delete(
  "/:id",
  requireRole("MD"),
  forbidAssistant,
  validate({ params: idParamSchema }),
  usersController.remove
);
router.post(
  "/:id/reset-password",
  requirePermission(canManageDoers),
  validate({ params: idParamSchema, body: resetPasswordSchema }),
  usersController.resetPassword
);

export default router;
