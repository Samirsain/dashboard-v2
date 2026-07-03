import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { loginSchema, registerSchema } from "../validation/auth.schema";

const router = Router();

router.post("/login", validate({ body: loginSchema }), authController.login);
router.post("/register", validate({ body: registerSchema }), authController.register);
router.get("/me", requireAuth, authController.me);

export default router;
