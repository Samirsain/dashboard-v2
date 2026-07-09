import { checklistService } from "../services/checklist.service";
import { tasksService } from "../services/tasks.service";
import { activityService } from "../services/activity.service";
import { hasGoogleCredentials } from "../config/env";
import { shouldGenerateRecurringTask, todayIso } from "../utils/date";
import { logger } from "../utils/logger";

async function generateRecurringTasks(): Promise<number> {
  const allTasks = await tasksService.listRaw();
  const today = todayIso();

  // Only rows that repeat and haven't already been rolled forward today —
  // this is the row itself, not a template producing separate copies, so
  // there's nothing to dedupe against: it just moves.
  const recurringTasks = allTasks.filter(
    (t) => t.repeatType && t.repeatType !== "None" && t.dueDate !== today
  );

  let generatedCount = 0;
  for (const task of recurringTasks) {
    if (shouldGenerateRecurringTask(task.repeatType, task.repeatValue)) {
      await tasksService.advanceRecurring(task.id, today);
      generatedCount++;
    }
  }
  return generatedCount;
}

/**
 * The daily automation described in the PRD:
 *   00:01 -> generate today's recurring checklist -> flag overdue tasks -> done
 * "Refresh Dashboard" isn't a server-side step — the dashboard is computed
 * on demand from live sheet data, so it's automatically up to date.
 */
export async function runDailyJob(): Promise<void> {
  if (!hasGoogleCredentials()) {
    logger.warn("Skipping daily job: Google Sheets credentials are not configured yet");
    return;
  }

  logger.info("Daily job starting: generate checklist + mark overdue");

  try {
    const generated = await checklistService.generateInstancesForDate();
    logger.info({ count: generated.length }, "Recurring checklist instances generated");
  } catch (error) {
    logger.error({ err: error }, "Daily job: checklist generation failed");
  }

  try {
    const generatedTasksCount = await generateRecurringTasks();
    logger.info({ count: generatedTasksCount }, "Recurring tasks generated");
  } catch (error) {
    logger.error({ err: error }, "Daily job: recurring tasks generation failed");
  }

  try {
    const [overdue, todaysLogs] = await Promise.all([
      tasksService.getOverdue(),
      activityService.listToday(),
    ]);
    logger.info({ count: overdue.length }, "Overdue tasks identified");

    const alreadyFlaggedToday = new Set(
      todaysLogs.filter((l) => l.action === "Flagged overdue").map((l) => l.task)
    );
    const toFlag = overdue.filter((task) => !alreadyFlaggedToday.has(task.title));

    await Promise.all(
      toFlag.map((task) =>
        activityService.log({
          user: "system",
          action: "Flagged overdue",
          task: task.title,
          detail: `Due date was ${task.dueDate}`,
        })
      )
    );
  } catch (error) {
    logger.error({ err: error }, "Daily job: overdue marking failed");
  }

  logger.info("Daily job complete");
}
