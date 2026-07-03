import cron from "node-cron";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { runDailyJob } from "./dailyJob";

let task: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  if (!env.scheduler.enabled) {
    logger.info("Scheduler disabled via SCHEDULER_ENABLED=false");
    return;
  }

  if (!cron.validate(env.scheduler.dailyCron)) {
    logger.error(
      { cron: env.scheduler.dailyCron },
      "Invalid SCHEDULER_DAILY_CRON expression — scheduler not started"
    );
    return;
  }

  task = cron.schedule(env.scheduler.dailyCron, () => {
    runDailyJob().catch((error) => logger.error({ err: error }, "Daily job crashed"));
  }, {
    timezone: env.scheduler.timezone,
  });

  logger.info(
    { cron: env.scheduler.dailyCron, timezone: env.scheduler.timezone },
    "Scheduler started"
  );
}

export function stopScheduler(): void {
  task?.stop();
  task = null;
}

export { runDailyJob } from "./dailyJob";
