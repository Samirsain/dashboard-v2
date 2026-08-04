import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { usersService } from "../services/users.service";
import type { JwtClaims } from "../types";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtClaims;
    }
  }
}

/**
 * Verifies the bearer token, then re-reads the doer's row so every permission
 * check downstream (requireRole, canViewAllData, canMarkAttendance, ...) sees
 * the CURRENT role/flags — not whatever they were when the token was issued.
 * Without this, promoting someone to PC (or demoting, or deactivating them) in
 * Settings had no effect until they logged out and back in: the JWT carried
 * the old role for its full 8h lifetime, so the sidebar (which reads the live
 * /auth/me) would show their new access while every API call still enforced
 * the old one — e.g. Inventory visible in the nav but 403ing on click.
 *
 * Costs one extra lookup per authenticated request, which is fine at this
 * app's scale and is the simplest way to keep permissions in sync without a
 * server-side session store.
 */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(AppError.unauthorized("Missing or malformed Authorization header"));
    return;
  }

  const token = header.slice("Bearer ".length);
  let claims: JwtClaims;
  try {
    claims = jwt.verify(token, env.jwt.secret) as JwtClaims;
  } catch {
    next(AppError.unauthorized("Invalid or expired token"));
    return;
  }

  let user;
  try {
    user = await usersService.getById(claims.sub);
  } catch {
    next(AppError.unauthorized("Account no longer exists"));
    return;
  }

  if (user.status !== "Active") {
    next(AppError.forbidden("This account is inactive"));
    return;
  }

  req.user = {
    sub: user.id,
    email: user.email,
    employeeCode: user.employeeCode,
    role: user.role,
    canViewAll: user.canViewAll,
    isAttendanceManager: user.isAttendanceManager,
    isAssistant: user.isAssistant,
    canDeleteTask: user.canDeleteTask,
    canManageDoers: user.canManageDoers,
    canViewTeamPerformance: user.canViewTeamPerformance,
    canEditAttendance: user.canEditAttendance,
    canAccessAllTasks: user.canAccessAllTasks,
    canAccessInventory: user.canAccessInventory,
    canManageWorkflow: user.canManageWorkflow,
  };
  next();
});
