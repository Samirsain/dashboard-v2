import type { JwtClaims } from "../types";

/**
 * Who can do what, enforced server-side.
 *
 * MD has everything. PC is a deputy: full access EXCEPT four things that stay
 * with the MD alone —
 *   1. deleting a task
 *   2. deleting a doer
 *   3. Team Performance (the scoreboard)
 *   4. editing attendance records
 *
 * A plain Doer is scoped to their own rows. Every check reads the role off the
 * request's JWT and nothing is stored per user, so demoting someone from PC
 * back to Doer drops them to plain Doer access once their token refreshes.
 *
 * Mirrors src/lib/access.ts — keep the two in sync. The four MD-only
 * capabilities are enforced on their routes with requireRole("MD"); the
 * helpers here cover the checks that happen inside controllers.
 */

/** The deputy tier: everything a PC is trusted with, and MD by extension. */
function isManager(user: JwtClaims | undefined): boolean {
  return user?.role === "MD" || user?.role === "PC";
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
