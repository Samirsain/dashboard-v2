import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok } from "../utils/response";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";
import { runBackupJob } from "../scheduler/backupJob";

const router = Router();

/**
 * Manually trigger a Supabase -> Google Sheets backup. Meant to be called by an
 * external scheduler (e.g. a free GitHub Actions cron) so backups stay reliable
 * even when the in-process node-cron can't run because a free-tier host has
 * spun the server down — the incoming request wakes it and runs the backup.
 *
 * Auth: a shared secret in BACKUP_TOKEN, sent as `x-backup-token` header or
 * `?token=` query. If BACKUP_TOKEN isn't set, the endpoint is disabled (503).
 */
router.post(
  "/run",
  asyncHandler(async (req, res) => {
    if (!env.backupToken) {
      throw AppError.serviceUnavailable(
        "Backup endpoint is disabled. Set BACKUP_TOKEN to enable it.",
        "BACKUP_DISABLED"
      );
    }
    const provided =
      (req.header("x-backup-token") ?? "") || (req.query.token as string | undefined) || "";
    if (provided !== env.backupToken) {
      throw AppError.unauthorized("Invalid backup token", "INVALID_BACKUP_TOKEN");
    }

    const result = await runBackupJob();
    ok(res, result);
  })
);

export default router;
