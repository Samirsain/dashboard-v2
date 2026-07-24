import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { performanceController } from "../controllers/performance.controller";

const router = Router();

router.use(requireAuth);

router.get("/dgmax", performanceController.getDgmaxSummary);
router.post("/archive", requireRole("Admin"), performanceController.archiveWeek);
router.get("/archives", performanceController.listArchives);

export default router;
