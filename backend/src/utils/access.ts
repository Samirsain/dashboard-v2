import type { JwtClaims } from "../types";

/**
 * Employee Codes hardcoded with full admin-level task access (view every
 * employee's tasks, create tasks) regardless of their `role`/`canViewAll`
 * columns in the DB. Used for accounts where flipping those columns through
 * Settings isn't reliable — grants the specific capability directly off the
 * JWT's employeeCode instead of a DB lookup.
 */
const HARDCODED_FULL_TASK_ACCESS_CODES = ["TM03"];

function hasHardcodedFullTaskAccess(user: JwtClaims | undefined): boolean {
  if (!user?.employeeCode) return false;
  return HARDCODED_FULL_TASK_ACCESS_CODES.includes(user.employeeCode.toUpperCase());
}

/**
 * Who is allowed to see everyone's tasks/checklists (not just their own):
 *  - Admin — always, by role.
 *  - Any doer explicitly flagged canViewAll (e.g. a senior who isn't an admin).
 *  - Anyone on the hardcoded full-task-access list.
 *
 * Everyone else (a normal Doer) is scoped to the rows assigned to them.
 */
export function canViewAllData(user: JwtClaims | undefined): boolean {
  if (!user) return false;
  if (user.role === "Admin") return true;
  if (hasHardcodedFullTaskAccess(user)) return true;
  return user.canViewAll === true;
}

/**
 * Who can create tasks:
 *  - Admin — always, by role.
 *  - Anyone on the hardcoded full-task-access list.
 */
export function canCreateTask(user: JwtClaims | undefined): boolean {
  if (!user) return false;
  if (user.role === "Admin") return true;
  return hasHardcodedFullTaskAccess(user);
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
