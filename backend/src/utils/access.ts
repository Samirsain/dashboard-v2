import type { JwtClaims } from "../types";

/**
 * Who is allowed to see everyone's tasks/checklists (not just their own):
 *  - Admin — always, by role.
 *  - Any doer explicitly flagged canViewAll (e.g. a senior who isn't an admin).
 *
 * Everyone else (a normal Doer) is scoped to the rows assigned to them.
 */
export function canViewAllData(user: JwtClaims | undefined): boolean {
  if (!user) return false;
  if (user.role === "Admin") return true;
  return user.canViewAll === true;
}

/**
 * Who can mark attendance for other employees:
 *  - Admin — always, by role.
 *  - Whoever is flagged isAttendanceManager (a doer designated by an admin).
 *
 * Everyone else is read-only on attendance (their own record only).
 */
export function canMarkAttendance(user: JwtClaims | undefined): boolean {
  if (!user) return false;
  if (user.role === "Admin") return true;
  return user.isAttendanceManager === true;
}
