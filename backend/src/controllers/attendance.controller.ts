import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok } from "../utils/response";
import { attendanceService } from "../services/attendance.service";
import { canMarkAttendance } from "../utils/access";
import { todayIso } from "../utils/date";
import { AppError } from "../utils/AppError";
import type {
  AttendanceDateQuery,
  AttendanceRangeQuery,
  MarkStatusInput,
  CheckInOutInput,
  RemarksInput,
} from "../validation/attendance.schema";

/** Attendance Managers (non-Admin) may only mark/edit today's attendance. */
function assertEditableDate(req: Request, date: string): void {
  if (req.user!.role === "Admin") return;
  if (date !== todayIso()) {
    throw AppError.forbidden("Only today's attendance can be marked.", "PAST_DATE_LOCKED");
  }
}

function requireMarker(req: Request): void {
  if (!canMarkAttendance(req.user)) {
    throw AppError.forbidden("Only the Attendance Manager or Admin can mark attendance.", "NOT_ATTENDANCE_MANAGER");
  }
}

export const attendanceController = {
  today: asyncHandler(async (req: Request, res: Response) => {
    ok(res, await attendanceService.today(req.user!.sub));
  }),

  history: asyncHandler(async (req: Request, res: Response) => {
    const { employeeId } = req.query as AttendanceDateQuery;
    // Admin/Attendance Manager may look up anyone; everyone else only themselves.
    const target = employeeId && canMarkAttendance(req.user) ? employeeId : req.user!.sub;
    ok(res, await attendanceService.history(target));
  }),

  day: asyncHandler(async (req: Request, res: Response) => {
    requireMarker(req);
    const { date } = req.query as AttendanceDateQuery;
    ok(res, await attendanceService.day(date ?? todayIso()));
  }),

  range: asyncHandler(async (req: Request, res: Response) => {
    requireMarker(req);
    const { from, to } = req.query as unknown as AttendanceRangeQuery;
    ok(res, await attendanceService.range(from, to));
  }),

  markStatus: asyncHandler(async (req: Request, res: Response) => {
    requireMarker(req);
    const { employeeIds, date, status } = req.body as MarkStatusInput;
    const targetDate = date ?? todayIso();
    assertEditableDate(req, targetDate);
    ok(res, await attendanceService.markStatus(employeeIds, targetDate, status, req.user!.sub));
  }),

  checkIn: asyncHandler(async (req: Request, res: Response) => {
    requireMarker(req);
    const { employeeId, date } = req.body as CheckInOutInput;
    const targetDate = date ?? todayIso();
    assertEditableDate(req, targetDate);
    ok(res, await attendanceService.checkIn(employeeId, targetDate, req.user!.sub));
  }),

  checkOut: asyncHandler(async (req: Request, res: Response) => {
    requireMarker(req);
    const { employeeId, date } = req.body as CheckInOutInput;
    const targetDate = date ?? todayIso();
    assertEditableDate(req, targetDate);
    ok(res, await attendanceService.checkOut(employeeId, targetDate, req.user!.sub));
  }),

  setRemarks: asyncHandler(async (req: Request, res: Response) => {
    requireMarker(req);
    const { employeeId, date, remarks } = req.body as RemarksInput;
    const targetDate = date ?? todayIso();
    assertEditableDate(req, targetDate);
    ok(res, await attendanceService.setRemarks(employeeId, targetDate, remarks, req.user!.sub));
  }),

  // Admin-only (enforced by requireRole("Admin") on the route) — permanently
  // wipes every attendance record for every employee/date.
  clearAll: asyncHandler(async (_req: Request, res: Response) => {
    const deleted = await attendanceService.clearAll();
    ok(res, { deleted });
  }),

  // Admin-only — re-applies the current office-hours policy to every existing
  // attendance row that has a check-in, fixing statuses recorded under old rules.
  recompute: asyncHandler(async (req: Request, res: Response) => {
    const updated = await attendanceService.recomputeAll(req.user!.sub);
    ok(res, { updated });
  }),

  // Admin-only — permanently wipes every attendance record EXCEPT the given date (defaults to today).
  clearHistory: asyncHandler(async (req: Request, res: Response) => {
    const { date } = req.query as AttendanceDateQuery;
    const keepDate = date ?? todayIso();
    const deleted = await attendanceService.clearHistoryExcept(keepDate);
    ok(res, { deleted, kept: keepDate });
  }),
};
