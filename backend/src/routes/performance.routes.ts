import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { performanceController } from "../controllers/performance.controller";

const router = Router();

router.use(requireAuth);

// Team Performance is the MD's scoreboard — a PC does not get to see how the
// team is scored, so this stays MD-only rather than the usual MD + PC.
router.get("/dgmax", requireRole("MD"), performanceController.getDgmaxSummary);

export default router;
