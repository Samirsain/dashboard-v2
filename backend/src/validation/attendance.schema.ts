import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const attendanceDateQuerySchema = z.object({
  date: isoDate.optional(),
  employeeId: z.string().min(1).optional(),
});

export const attendanceRangeQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
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

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:MM");

export const editAttendanceSchema = z.object({
  employeeId: z.string().min(1),
  date: isoDate,
  // Omit a field to leave it unchanged; empty string clears the time.
  checkInTime: z.union([timeString, z.literal("")]).optional(),
  checkOutTime: z.union([timeString, z.literal("")]).optional(),
  // Manual override; omit to auto-calculate the status from the times above.
  status: z.union([z.enum(["Present", "Late", "Half Day", "Absent", "Leave"]), z.literal("")]).optional(),
  remarks: z.string().optional(),
});

export type AttendanceDateQuery = z.infer<typeof attendanceDateQuerySchema>;
export type AttendanceRangeQuery = z.infer<typeof attendanceRangeQuerySchema>;
export type MarkStatusInput = z.infer<typeof markStatusSchema>;
export type CheckInOutInput = z.infer<typeof checkInOutSchema>;
export type RemarksInput = z.infer<typeof remarksSchema>;
export type EditAttendanceInput = z.infer<typeof editAttendanceSchema>;
