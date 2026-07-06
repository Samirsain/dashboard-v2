import { Router } from "express";
import authRoutes from "./auth.routes";
import usersRoutes from "./users.routes";
import tasksRoutes from "./tasks.routes";
import checklistRoutes from "./checklist.routes";
import dashboardRoutes from "./dashboard.routes";
import activityRoutes from "./activity.routes";
import { hasGoogleCredentials, hasSupabaseCredentials } from "../config/env";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      database: hasSupabaseCredentials() ? "supabase" : "unconfigured",
      supabaseConfigured: hasSupabaseCredentials(),
      googleSheetsBackupConfigured: hasGoogleCredentials(),
      time: new Date().toISOString(),
    },
  });
});

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/tasks", tasksRoutes);
router.use("/checklist", checklistRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/activity", activityRoutes);

export default router;
