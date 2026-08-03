import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { usersService } from "../services/users.service";
import { listsService } from "../services/lists.service";
import { logger } from "../utils/logger";
import type { CreateUserInput, ResetPasswordInput, UpdateUserInput } from "../validation/user.schema";

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

    // Seed the new account into the default OFFICE sheets. Sheet access is now
    // genuinely enforced, so without this a brand-new person (a PC especially)
    // would log in able to see nothing at all until the MD ticked boxes by
    // hand. Best-effort: a failure here must not undo a successful signup.
    try {
      const lists = await listsService.list();
      const offices = lists.filter((l) => l.name.trim().toUpperCase().startsWith("OFFICE"));
      for (const office of offices) {
        if (office.memberIds.includes(user.id)) continue;
        await listsService.updateMembers(office.id, [...office.memberIds, user.id]);
      }
    } catch (err) {
      logger.error({ err, userId: user.id }, "Could not add new user to the default OFFICE lists");
    }

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

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const { newPassword } = req.body as ResetPasswordInput;
    await usersService.resetPassword(req.params.id as string, newPassword);
    ok(res, { reset: true });
  }),
};
