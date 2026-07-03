import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { AppError } from "../utils/AppError";

interface ValidationTargets {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/** Validates req.body / req.params / req.query against Zod schemas, replacing them with parsed values. */
export function validate(targets: ValidationTargets) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (targets.body) {
        req.body = targets.body.parse(req.body);
      }
      if (targets.params) {
        req.params = targets.params.parse(req.params) as typeof req.params;
      }
      if (targets.query) {
        req.query = targets.query.parse(req.query) as typeof req.query;
      }
      next();
    } catch (error) {
      next(AppError.badRequest(formatZodError(error), "VALIDATION_ERROR"));
    }
  };
}

function formatZodError(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray((error as { issues: unknown[] }).issues)
  ) {
    const issues = (error as { issues: Array<{ path: (string | number)[]; message: string }> })
      .issues;
    return issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; ");
  }
  return "Invalid request";
}
