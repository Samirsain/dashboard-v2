import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { performanceController } from "../controllers/performance.controller";

const router = Router();

router.use(requireAuth);

router.get("/dgmax", performanceController.getDgmaxSummary);

export default router;
