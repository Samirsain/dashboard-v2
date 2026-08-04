import type { Doer } from "./types";

/**
 * Who can do what.
 *
 * MD has everything, always. PC is a deputy whose reach is a per-PC set of
 * toggles set from the "PC Management" column in Settings — some default
 * OFF (capabilities that used to be MD-exclusive: delete a task, Doer
 * Management, Team Performance, edit attendance), some default ON
 * (capabilities every PC already had unconditionally, now revocable: the
 * All Tasks page / creating tasks, Inventory, managing Workflow templates).
 * Deleting a doer specifically stays MD-only and isn't toggleable, even with
 * Doer Management access — see canDeleteDoer below.
 *
 * A plain Doer only ever sees and acts on their own work. Every check below
 * reads the current role/flags and nothing else is stored per user, so
 * demoting someone from PC back to Doer drops them straight back to plain
 * Doer access.
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

/**
 * See everyone's tasks/checklists (not just your own) and create tasks. MD
 * always; PC only if granted in PC Management (defaults on — every PC had
 * this unconditionally before PC Management existed).
 */
export function canAccessAllTasks(user: Doer | null | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canAccessAllTasks === true);
}

/** Open Inventory. MD always; PC only if granted in PC Management (defaults on). */
export function canAccessInventory(user: Doer | null | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canAccessInventory === true);
}

/** Create/delete Workflow templates. MD always; PC only if granted in PC Management (defaults on). */
export function canManageWorkflow(user: Doer | null | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canManageWorkflow === true);
}

/** Mark attendance for other employees. PC can mark; only MD can edit a record. */
export function canMarkAttendance(user: Doer | null | undefined): boolean {
  if (!user) return false;
  if (isManager(user)) return true;
  return user.isAttendanceManager === true;
}

// ---- MD-always, PC-if-granted ----------------------------------------------

/** Delete a task. MD always; PC only if granted in PC Management. */
export function canDeleteTask(user: Doer | null | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canDeleteTask === true);
}

/**
 * Open Settings / Doer Management at all — add, rename, reset passwords,
 * toggle list access. MD always; PC only if granted in PC Management. Note
 * this does NOT cover deleting a doer — see canDeleteDoer.
 */
export function canManageDoers(user: Doer | null | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canManageDoers === true);
}

/**
 * Delete a doer specifically — always MD-only, not toggleable even with
 * Doer Management access. Too destructive to hand off, and it keeps a PC
 * from ever being able to remove the MD's own account.
 */
export function canDeleteDoer(user: Doer | null | undefined): boolean {
  return isMd(user);
}

/** Create, rename and delete lists. Part of Doer Management. */
export function canManageLists(user: Doer | null | undefined): boolean {
  return canManageDoers(user);
}

/** Open the Team Performance scoreboard. MD always; PC only if granted in PC Management. */
export function canViewTeamPerformance(user: Doer | null | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canViewTeamPerformance === true);
}

/** Edit an attendance record's times/status. MD always; PC only if granted in PC Management. */
export function canEditAttendance(user: Doer | null | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canEditAttendance === true);
}
