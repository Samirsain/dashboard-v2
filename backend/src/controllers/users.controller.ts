import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { usersService } from "../services/users.service";
import type { CreateUserInput, UpdateUserInput } from "../validation/user.schema";

export const usersController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const users = await usersService.list();
    ok(res, users);
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const user = await usersService.getById(req.params.id as string);
    ok(res, user);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreateUserInput;
    const user = await usersService.create(input);
    created(res, user);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as UpdateUserInput;
    const user = await usersService.update(req.params.id as string, input);
    ok(res, user);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await usersService.remove(req.params.id as string);
    ok(res, { deleted: true });
  }),
};
