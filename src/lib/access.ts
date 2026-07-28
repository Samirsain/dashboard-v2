import type { Doer } from "./types";

/**
 * Employee Codes hardcoded with full admin-level task access (view every
 * employee's tasks, create tasks) regardless of their `role`/`canViewAll`
 * columns in the DB. Mirrors backend/src/utils/access.ts — keep in sync.
 */
const HARDCODED_FULL_TASK_ACCESS_CODES: string[] = [];

function hasHardcodedFullTaskAccess(user: Doer | null | undefined): boolean {
  if (!user?.employeeCode) return false;
  return HARDCODED_FULL_TASK_ACCESS_CODES.includes(user.employeeCode.toUpperCase());
}

/** Who is allowed to see everyone's tasks (not just their own) and create tasks. */
export function canAccessAllTasks(user: Doer | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "MD" || user.role === "PC") return true;
  return hasHardcodedFullTaskAccess(user);
}

/** Who is allowed to mark attendance for every employee. */
export function canMarkAttendance(user: Doer | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "MD" || user.role === "PC") return true;
  if (hasHardcodedFullTaskAccess(user)) return true;
  return user.isAttendanceManager === true;
}

/**
 * PC is explicitly blocked from deleting tasks.
 * MD and hardcoded codes can delete. Plain Doers can never delete.
 */
export function canDeleteTask(user: Doer | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "PC") return false;
  if (user.role === "MD") return true;
  return hasHardcodedFullTaskAccess(user);
}
