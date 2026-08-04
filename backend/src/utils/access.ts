import type { JwtClaims } from "../types";

/**
 * Who can do what, enforced server-side.
 *
 * MD has everything, always. PC is a deputy whose reach is a per-PC set of
 * toggles set from the "PC Management" column in Settings — some default
 * OFF (capabilities that used to be MD-exclusive: delete a task, Doer
 * Management, Team Performance, edit attendance), some default ON
 * (capabilities every PC already had unconditionally, now revocable: the
 * All Tasks page / creating tasks, Inventory, managing Workflow templates).
 * Deleting a doer specifically stays MD-only, un-toggleable, regardless of
 * Doer Management access — too destructive to hand off, and it keeps a PC
 * from ever removing the MD's own account.
 *
 * A plain Doer is scoped to their own rows. Every check reads the role/flags
 * off the request's JWT and nothing else is stored per user, so demoting
 * someone from PC back to Doer drops them to plain Doer access once their
 * token refreshes.
 *
 * Mirrors src/lib/access.ts — keep the two in sync. Role/permission-flag
 * changes on a user are themselves MD-only (see usersController.update) so a
 * PC with Doer Management access can't grant itself — or anyone else — more.
 */

/** The deputy tier: everything a PC is trusted with, and MD by extension. */
function isManager(user: JwtClaims | undefined): boolean {
  return user?.role === "MD" || user?.role === "PC";
}

function isMd(user: JwtClaims | undefined): boolean {
  return user?.role === "MD";
}

/** Delete a task. MD always; PC only if granted. */
export function canDeleteTask(user: JwtClaims | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canDeleteTask === true);
}

/** Open Doer Management (Settings). MD always; PC only if granted. */
export function canManageDoers(user: JwtClaims | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canManageDoers === true);
}

/** Open the Team Performance scoreboard. MD always; PC only if granted. */
export function canViewTeamPerformance(user: JwtClaims | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canViewTeamPerformance === true);
}

/** Edit an attendance record. MD always; PC only if granted. */
export function canEditAttendance(user: JwtClaims | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canEditAttendance === true);
}

/**
 * The All Tasks page, and by extension creating/reassigning a task — every
 * PC had this unconditionally before PC Management existed, so this one
 * defaults true rather than false: it's revocable, not opt-in.
 */
export function canAccessAllTasks(user: JwtClaims | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canAccessAllTasks === true);
}

/** Open Inventory (IMS). Defaults true — same reasoning as canAccessAllTasks. */
export function canAccessInventory(user: JwtClaims | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canAccessInventory === true);
}

/** Create/delete Workflow templates. Defaults true — same reasoning as canAccessAllTasks. */
export function canManageWorkflow(user: JwtClaims | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canManageWorkflow === true);
}

/** Register/remove a Google Form, manage its access, set response status. Defaults true. */
export function canManageForms(user: JwtClaims | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canManageForms === true);
}

/** Edit the Master Sheet. Defaults true. */
export function canManageMasterSheet(user: JwtClaims | undefined): boolean {
  return isMd(user) || (user?.role === "PC" && user.canManageMasterSheet === true);
}

/**
 * Who sees everyone's tasks/checklists rather than only their own: MD and PC
 * by role, plus any doer explicitly flagged canViewAll.
 */
export function canViewAllData(user: JwtClaims | undefined): boolean {
  if (!user) return false;
  if (isManager(user)) return true;
  return user.canViewAll === true;
}

/** Who can create/reassign tasks — the same toggle as the All Tasks page. */
export function canCreateTask(user: JwtClaims | undefined): boolean {
  return canAccessAllTasks(user);
}

/**
 * Who can mark attendance for other employees: MD, PC, or whoever is flagged
 * as the Attendance Manager. Editing an existing record is MD-only and is
 * enforced on the route rather than here.
 */
export function canMarkAttendance(user: JwtClaims | undefined): boolean {
  if (!user) return false;
  if (isManager(user)) return true;
  return user.isAttendanceManager === true;
}
