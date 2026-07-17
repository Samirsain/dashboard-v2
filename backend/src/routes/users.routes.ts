import { Router } from "express";
import { usersController } from "../controllers/users.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import {
  createUserSchema,
  idParamSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "../validation/user.schema";

const router = Router();

router.use(requireAuth);

router.get("/", usersController.list);
router.get("/:id", validate({ params: idParamSchema }), usersController.getById);
router.post(
  "/",
  requireRole("Admin"),
  validate({ body: createUserSchema }),
  usersController.create
);
router.patch(
  "/:id",
  requireRole("Admin"),
  validate({ params: idParamSchema, body: updateUserSchema }),
  usersController.update
);
router.delete(
  "/:id",
  requireRole("Admin"),
  validate({ params: idParamSchema }),
  usersController.remove
);
router.post(
  "/:id/reset-password",
  requireRole("Admin"),
  validate({ params: idParamSchema, body: resetPasswordSchema }),
  usersController.resetPassword
);

export default router;
