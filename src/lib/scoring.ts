import type { Task, TaskScoreCategory } from "./types";

/**
 * Mirrors the backend's getTaskCategory (backend/src/utils/dgmaxScoring.ts).
 *
 * Used only to label individual rows in task lists — every *score* on screen
 * comes from the backend engine, which is the single source of truth.
 *
 *  Green   = On Time    — completed on or before its due date
 *  Yellow  = Late Done  — completed after its due date
 *  Red     = Not Done   — still incomplete and the due date has passed
 *  Pending = not yet due — excluded from scoring entirely
 */
export function getTaskCategory(task: Task, todayIso: string): TaskScoreCategory | null {
  if (task.status === "Cancelled" || !task.dueDate) return null;
  if (task.status === "Completed") {
    const completedDate = task.updatedAt ? task.updatedAt.slice(0, 10) : todayIso;
    return completedDate > task.dueDate ? "Yellow" : "Green";
  }
  return task.dueDate < todayIso ? "Red" : "Pending";
}

/** Human label for a category, in DGMAX's terms. */
export const CATEGORY_LABEL: Record<TaskScoreCategory, string> = {
  Green: "On Time",
  Yellow: "Late Done",
  Red: "Not Done",
  Pending: "Not Yet Due",
};
