import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";
import type { UserRole } from "../types";

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
