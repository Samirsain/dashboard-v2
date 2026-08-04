import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";
import { canViewTeamPerformance } from "../utils/access";
import { performanceController } from "../controllers/performance.controller";

const router = Router();

router.use(requireAuth);

// Team Performance is the MD's scoreboard — MD always, a PC only if granted
// it in PC Management.
router.get("/dgmax", requirePermission(canViewTeamPerformance), performanceController.getDgmaxSummary);

export default router;
