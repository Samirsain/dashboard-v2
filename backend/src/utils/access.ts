import type { JwtClaims } from "../types";

/**
 * Who can do what, enforced server-side.
 *
 * MD has everything, always. PC is a deputy: full access, plus four
 * capabilities the MD grants (or doesn't) individually per PC from the "PC
 * Management" column in Settings —
 *   1. deleting a task
 *   2. Doer Management (Settings — add/rename/reset password/list access)
 *   3. Team Performance (the scoreboard)
 *   4. editing attendance records
 * Each defaults to false, so a freshly promoted PC starts with none of them
 * until the MD opts them in. Deleting a doer specifically stays MD-only,
 * un-toggleable, regardless of Doer Management access — too destructive to
 * hand off, and it keeps a PC from ever removing the MD's own account.
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
 * Who sees everyone's tasks/checklists rather than only their own: MD and PC
 * by role, plus any doer explicitly flagged canViewAll.
 */
export function canViewAllData(user: JwtClaims | undefined): boolean {
  if (!user) return false;
  if (isManager(user)) return true;
  return user.canViewAll === true;
}

/** Who can create tasks. */
export function canCreateTask(user: JwtClaims | undefined): boolean {
  return isManager(user);
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
