import { Router } from "express";
import { usersController } from "../controllers/users.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole, forbidAssistant } from "../middleware/role.middleware";
import {
  createUserSchema,
  idParamSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "../validation/user.schema";

const router = Router();

router.use(requireAuth);

// Doer Management (create/update/delete/reset-password) is MD-only — a PC
// doesn't get this at all, not even create/rename. GET stays open to everyone
// so the rest of the app can still resolve names/roles.
router.get("/", usersController.list);
router.get("/:id", validate({ params: idParamSchema }), usersController.getById);
router.post(
  "/",
  requireRole("MD"),
  validate({ body: createUserSchema }),
  usersController.create
);
router.patch(
  "/:id",
  requireRole("MD"),
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
  requireRole("MD"),
  validate({ params: idParamSchema, body: resetPasswordSchema }),
  usersController.resetPassword
);

export default router;
