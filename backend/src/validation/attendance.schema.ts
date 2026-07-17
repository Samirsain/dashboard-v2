import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const attendanceDateQuerySchema = z.object({
  date: isoDate.optional(),
  employeeId: z.string().min(1).optional(),
});

export const markStatusSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1),
  date: isoDate.optional(),
  status: z.enum(["Present", "Late", "Half Day", "Absent", "Leave"]),
});

export const checkInOutSchema = z.object({
  employeeId: z.string().min(1),
  date: isoDate.optional(),
});

export const remarksSchema = z.object({
  employeeId: z.string().min(1),
  date: isoDate.optional(),
  remarks: z.string(),
});

export type AttendanceDateQuery = z.infer<typeof attendanceDateQuerySchema>;
export type MarkStatusInput = z.infer<typeof markStatusSchema>;
export type CheckInOutInput = z.infer<typeof checkInOutSchema>;
export type RemarksInput = z.infer<typeof remarksSchema>;
