import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { authService } from "../services/auth.service";
import type { LoginInput, RegisterInput } from "../validation/auth.schema";

export const authController = {
  login: asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as LoginInput;
    const result = await authService.login(email, password);
    ok(res, result);
  }),

  register: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as RegisterInput;
    const result = await authService.register(input);
    created(res, result);
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    ok(res, req.user);
  }),
};
