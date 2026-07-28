import type { Doer } from "./types";

/**
 * Who can do what.
 *
 * MD has everything. PC is a deputy: full access EXCEPT four things that stay
 * with the MD alone —
 *   1. deleting a task
 *   2. Doer Management (Settings) — adding, renaming, deleting doers,
 *      resetting passwords, and managing list access, all of it
 *   3. Team Performance (the scoreboard)
 *   4. editing attendance records
 *
 * A plain Doer only ever sees and acts on their own work. Every check below
 * reads the current role and nothing is stored per user, so demoting someone
 * from PC back to Doer drops them straight back to plain Doer access.
 *
 * Mirrors backend/src/utils/access.ts — keep the two in sync.
 */

/** The deputy tier: everything a PC is trusted with, and MD by extension. */
function isManager(user: Doer | null | undefined): boolean {
  return user?.role === "MD" || user?.role === "PC";
}

function isMd(user: Doer | null | undefined): boolean {
  return user?.role === "MD";
}

/** See everyone's tasks/checklists (not just your own) and create tasks. */
export function canAccessAllTasks(user: Doer | null | undefined): boolean {
  return isManager(user);
}

/** Mark attendance for other employees. PC can mark; only MD can edit a record. */
export function canMarkAttendance(user: Doer | null | undefined): boolean {
  if (!user) return false;
  if (isManager(user)) return true;
  return user.isAttendanceManager === true;
}

// ---- MD-only ---------------------------------------------------------------

/** Delete a task. Blocked for PC. */
export function canDeleteTask(user: Doer | null | undefined): boolean {
  return isMd(user);
}

/**
 * Open Settings / Doer Management at all — add, rename, delete a doer, reset
 * passwords, toggle list access. A PC gets none of it, not even a read-only
 * peek; the whole page (and its nav link) is gated on this.
 */
export function canManageDoers(user: Doer | null | undefined): boolean {
  return isMd(user);
}

/** Delete a doer specifically — kept separate for the delete button's own guard. */
export function canDeleteDoer(user: Doer | null | undefined): boolean {
  return isMd(user);
}

/** Create, rename and delete lists. Part of Doer Management — MD only. */
export function canManageLists(user: Doer | null | undefined): boolean {
  return isMd(user);
}

/** Open the Team Performance scoreboard. Blocked for PC. */
export function canViewTeamPerformance(user: Doer | null | undefined): boolean {
  return isMd(user);
}

/** Edit an attendance record's times/status, or clear/recompute attendance. */
export function canEditAttendance(user: Doer | null | undefined): boolean {
  return isMd(user);
}
