import { Router } from "express";
import { activityController } from "../controllers/activity.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.use(requireAuth);

router.get("/", activityController.list);
router.get("/today", activityController.today);

export default router;
