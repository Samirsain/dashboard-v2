import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(1),
  employeeCode: z.string().min(1).optional(),
  mobile: z.string().min(1),
  email: z.string().email(),
  department: z.string().min(1),
  role: z.enum(["MD", "PC", "Doer"]),
  status: z.enum(["Active", "Inactive"]).default("Active"),
  // Kept short to allow the existing "EM@01" employee-code convention.
  password: z.string().min(4),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  employeeCode: z.string().min(1).optional(),
  mobile: z.string().min(1).optional(),
  email: z.string().email().optional(),
  department: z.string().min(1).optional(),
  role: z.enum(["MD", "PC", "Doer"]).optional(),
  status: z.enum(["Active", "Inactive"]).optional(),
  isAttendanceManager: z.boolean().optional(),
  isAssistant: z.boolean().optional(),
  canDeleteTask: z.boolean().optional(),
  canManageDoers: z.boolean().optional(),
  canViewTeamPerformance: z.boolean().optional(),
  canEditAttendance: z.boolean().optional(),
  canAccessAllTasks: z.boolean().optional(),
  canAccessInventory: z.boolean().optional(),
  canManageWorkflow: z.boolean().optional(),
  canManageForms: z.boolean().optional(),
  canManageMasterSheet: z.boolean().optional(),
});

export const idParamSchema = z.object({
  id: z.string().min(1),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(4),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
