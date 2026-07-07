import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

export const createTaskSchema = z.object({
  title: z.string().min(1),
  listId: z.string().default(""),
  description: z.string().default(""),
  assignedDoerId: z.string().min(1, "assignedDoerId (DOERLIST Doer ID) is required"),
  priority: z.enum(["Low", "Normal", "Urgent", "Critical"]),
  dueDate: isoDate,
  department: z.string().default(""),
  repeatType: z.enum(["None", "Daily", "Weekly", "Monthly (By Date)", "Monthly (By Day)"]).default("None"),
  repeatValue: z.string().default(""),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  listId: z.string().optional(),
  description: z.string().optional(),
  assignedDoerId: z.string().min(1).optional(),
  priority: z.enum(["Low", "Normal", "Urgent", "Critical"]).optional(),
  dueDate: isoDate.optional(),
  status: z.enum(["Pending", "In Progress", "Completed", "Cancelled"]).optional(),
  department: z.string().optional(),
  repeatType: z.enum(["None", "Daily", "Weekly", "Monthly (By Date)", "Monthly (By Day)"]).optional(),
  repeatValue: z.string().optional(),
});

export const revisionSchema = z.object({
  newDueDate: isoDate,
  reason: z.string().default(""),
  comment: z.string().default(""),
});

export const taskFilterQuerySchema = z.object({
  assignedDoerId: z.string().optional(),
  status: z.enum(["Pending", "In Progress", "Completed", "Cancelled"]).optional(),
  priority: z.enum(["Low", "Normal", "Urgent", "Critical"]).optional(),
  department: z.string().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type RevisionInput = z.infer<typeof revisionSchema>;
export type TaskFilterQuery = z.infer<typeof taskFilterQuerySchema>;
