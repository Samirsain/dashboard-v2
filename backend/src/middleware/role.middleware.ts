import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";
import { canCreateTask } from "../utils/access";
import type { JwtClaims, UserRole } from "../types";

/** Restricts a route to one or more roles. Must run after requireAuth. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden(`Requires one of roles: ${roles.join(", ")}`));
      return;
    }
    next();
  };
}

/**
 * Restricts a route to whoever the given check function allows — e.g.
 * requirePermission(canDeleteTask). Unlike requireRole this can pass a PC who
 * has that specific capability granted, not just MD.
 */
export function requirePermission(
  check: (user: JwtClaims | undefined) => boolean,
  message = "You don't have access to this."
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!check(req.user)) {
      next(AppError.forbidden(message));
      return;
    }
    next();
  };
}

/** Restricts a route to whoever canCreateTask allows (Admin, or hardcoded full-task-access codes). */
export function requireTaskCreateAccess(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(AppError.unauthorized());
    return;
  }
  if (!canCreateTask(req.user)) {
    next(AppError.forbidden("Only MD/PC can create tasks."));
    return;
  }
  next();
}

/**
 * Blocks assistant admins from a destructive action even though they otherwise
 * have admin access. Used on the delete-doer / delete-task routes so an
 * assistant can do everything an admin can except permanently remove records.
 * Must run after requireAuth.
 */
export function forbidAssistant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(AppError.unauthorized());
    return;
  }
  if (req.user.isAssistant) {
    next(AppError.forbidden("Assistant admins can't delete this.", "ASSISTANT_FORBIDDEN"));
    return;
  }
  next();
}
