import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  department: z.string().min(1),
  role: z.enum(["Admin", "Manager", "Doer"]),
  status: z.enum(["Active", "Inactive"]).default("Active"),
  password: z.string().min(8),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  department: z.string().min(1).optional(),
  role: z.enum(["Admin", "Manager", "Doer"]).optional(),
  status: z.enum(["Active", "Inactive"]).optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
