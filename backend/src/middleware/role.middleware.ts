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
