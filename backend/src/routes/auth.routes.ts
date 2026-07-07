import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authController } from "../controllers/auth.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { loginSchema, registerSchema } from "../validation/auth.schema";

const router = Router();

// Brute-force protection: cap login attempts per IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: "TOO_MANY_ATTEMPTS", message: "Too many login attempts. Please try again later." },
  },
});

router.post("/login", loginLimiter, validate({ body: loginSchema }), authController.login);
router.post("/register", validate({ body: registerSchema }), authController.register);
router.get("/me", requireAuth, authController.me);

export default router;
