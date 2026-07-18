import type { Doer } from "./types";

/**
 * Employee Codes hardcoded with full admin-level task access (view every
 * employee's tasks, create tasks) regardless of their `role`/`canViewAll`
 * columns in the DB. Mirrors backend/src/utils/access.ts — keep in sync.
 */
const HARDCODED_FULL_TASK_ACCESS_CODES = ["TM03"];

function hasHardcodedFullTaskAccess(user: Doer | null | undefined): boolean {
  if (!user?.employeeCode) return false;
  return HARDCODED_FULL_TASK_ACCESS_CODES.includes(user.employeeCode.toUpperCase());
}

/** Who is allowed to see everyone's tasks (not just their own) and create tasks. */
export function canAccessAllTasks(user: Doer | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "Admin") return true;
  return hasHardcodedFullTaskAccess(user);
}
