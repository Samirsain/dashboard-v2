import type { Revision } from "../types";

/**
 * taskId -> the due date the task originally carried, taken from the oldest
 * revision's "old due date". Tasks that were never revised are absent, and
 * callers fall back to the task's own (current) dueDate.
 *
 * Revising a task rewrites its Due Date in place, so the current value only
 * ever reflects the LATEST extension. The original commitment survives only in
 * the revisions history, which is append-only — that's what this recovers.
 *
 * Used by both the scoring engine and the task list, so a revised task can't
 * read as "planned 25th, done 25th, on time" in the UI while being scored as
 * late underneath.
 */
export function buildOriginalDueDates(revisions: Revision[]): Map<string, string> {
  const earliest = new Map<string, Revision>();
  for (const r of revisions) {
    if (!r.taskId || !r.oldDueDate) continue;
    const current = earliest.get(r.taskId);
    if (!current || r.revisedAt < current.revisedAt) earliest.set(r.taskId, r);
  }
  return new Map(Array.from(earliest, ([taskId, r]) => [taskId, r.oldDueDate]));
}
