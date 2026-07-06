import cron from "node-cron";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { runDailyJob } from "./dailyJob";
import { runBackupJob } from "./backupJob";

let dailyTask: cron.ScheduledTask | null = null;
let backupTask: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  if (!env.scheduler.enabled) {
    logger.info("Scheduler disabled via SCHEDULER_ENABLED=false");
    return;
  }

  if (cron.validate(env.scheduler.dailyCron)) {
    dailyTask = cron.schedule(
      env.scheduler.dailyCron,
      () => {
        runDailyJob().catch((error) => logger.error({ err: error }, "Daily job crashed"));
      },
      { timezone: env.scheduler.timezone }
    );
    logger.info(
      { cron: env.scheduler.dailyCron, timezone: env.scheduler.timezone },
      "Daily job scheduled"
    );
  } else {
    logger.error(
      { cron: env.scheduler.dailyCron },
      "Invalid SCHEDULER_DAILY_CRON expression — daily job not started"
    );
  }

  if (cron.validate(env.scheduler.backupCron)) {
    backupTask = cron.schedule(
      env.scheduler.backupCron,
      () => {
        runBackupJob().catch((error) => logger.error({ err: error }, "Backup job crashed"));
      },
      { timezone: env.scheduler.timezone }
    );
    logger.info(
      { cron: env.scheduler.backupCron, timezone: env.scheduler.timezone },
      "Backup job scheduled"
    );
  } else {
    logger.error(
      { cron: env.scheduler.backupCron },
      "Invalid SCHEDULER_BACKUP_CRON expression — backup job not started"
    );
  }
}

export function stopScheduler(): void {
  dailyTask?.stop();
  backupTask?.stop();
  dailyTask = null;
  backupTask = null;
}

export { runDailyJob } from "./dailyJob";
export { runBackupJob } from "./backupJob";
