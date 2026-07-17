import { sheetsConfig } from "../config/sheets.config";
import { dataService, type SheetRecord } from "./data.service";
import { usersService } from "./users.service";
import { generateId } from "../utils/id";
import { todayIso } from "../utils/date";
import { computeCheckInStatus, computeCheckOutStatus, minutesBetween } from "../utils/attendanceTime";
import { AppError } from "../utils/AppError";
import type { Attendance, AttendanceStatus, User } from "../types";

const entity = sheetsConfig.attendance;

function toAttendance(record: SheetRecord): Attendance {
  return {
    id: record["Attendance ID"] ?? "",
    employeeId: record["Employee ID"] ?? "",
    date: record["Date"] ?? "",
    checkIn: record["CheckIn"] ?? "",
    checkOut: record["CheckOut"] ?? "",
    status: (record["Status"] ?? "") as AttendanceStatus | "",
    lateMinutes: Number(record["Late Minutes"] ?? "0") || 0,
    workingMinutes: Number(record["Working Minutes"] ?? "0") || 0,
    earlyExitMinutes: Number(record["Early Exit Minutes"] ?? "0") || 0,
    remarks: record["Remarks"] ?? "",
    markedBy: record["MarkedBy"] ?? "",
    createdAt: record["CreatedAt"] ?? "",
    updatedAt: record["UpdatedAt"] ?? "",
  };
}

async function findRow(employeeId: string, date: string): Promise<SheetRecord | null> {
  const records = await dataService.findAll(entity);
  return records.find((r) => r["Employee ID"] === employeeId && r["Date"] === date) ?? null;
}

async function upsert(
  employeeId: string,
  date: string,
  patch: Partial<SheetRecord>,
  markedBy: string
): Promise<Attendance> {
  const nowIso = new Date().toISOString();
  const existing = await findRow(employeeId, date);
  if (existing) {
    const saved = await dataService.updateById(entity, existing["Attendance ID"] as string, {
      ...patch,
      MarkedBy: markedBy,
      UpdatedAt: nowIso,
    });
    return toAttendance(saved);
  }
  const record: SheetRecord = {
    "Attendance ID": generateId("ATT"),
    "Employee ID": employeeId,
    Date: date,
    CheckIn: "",
    CheckOut: "",
    Status: "",
    "Late Minutes": "0",
    "Working Minutes": "0",
    "Early Exit Minutes": "0",
    Remarks: "",
    MarkedBy: markedBy,
    CreatedAt: nowIso,
    UpdatedAt: nowIso,
    ...patch,
  };
  const saved = await dataService.append(entity, record);
  return toAttendance(saved);
}

export const attendanceService = {
  async markStatus(
    employeeIds: string[],
    date: string,
    status: AttendanceStatus,
    markedBy: string
  ): Promise<Attendance[]> {
    // Absent/Leave carry no check-in/out — reset them so a re-mark is clean.
    const clearsTimes = status === "Absent" || status === "Leave";
    return Promise.all(
      employeeIds.map((employeeId) =>
        upsert(
          employeeId,
          date,
          {
            Status: status,
            ...(clearsTimes
              ? { CheckIn: "", CheckOut: "", "Late Minutes": "0", "Working Minutes": "0", "Early Exit Minutes": "0" }
              : {}),
          },
          markedBy
        )
      )
    );
  },

  async checkIn(employeeId: string, date: string, markedBy: string): Promise<Attendance> {
    const existing = await findRow(employeeId, date);
    if (existing && existing["CheckIn"]) {
      throw AppError.conflict("Already checked in for this date.", "ALREADY_CHECKED_IN");
    }
    const { status, lateMinutes } = computeCheckInStatus(new Date());
    return upsert(
      employeeId,
      date,
      { CheckIn: new Date().toISOString(), Status: status, "Late Minutes": String(lateMinutes) },
      markedBy
    );
  },

  async checkOut(employeeId: string, date: string, markedBy: string): Promise<Attendance> {
    const existing = await findRow(employeeId, date);
    if (!existing || !existing["CheckIn"]) {
      throw AppError.badRequest("Check in before checking out.", "NOT_CHECKED_IN");
    }
    if (existing["CheckOut"]) {
      throw AppError.conflict("Already checked out for this date.", "ALREADY_CHECKED_OUT");
    }
    const nowIso = new Date().toISOString();
    const { earlyExitMinutes, forcedHalfDay } = computeCheckOutStatus(new Date());
    const workingMinutes = minutesBetween(existing["CheckIn"] as string, nowIso);
    const status: AttendanceStatus = forcedHalfDay ? "Half Day" : (existing["Status"] as AttendanceStatus) || "Present";
    return upsert(
      employeeId,
      date,
      {
        CheckOut: nowIso,
        Status: status,
        "Working Minutes": String(workingMinutes),
        "Early Exit Minutes": String(Math.max(0, earlyExitMinutes)),
      },
      markedBy
    );
  },

  async setRemarks(employeeId: string, date: string, remarks: string, markedBy: string): Promise<Attendance> {
    return upsert(employeeId, date, { Remarks: remarks }, markedBy);
  },

  async today(employeeId: string): Promise<Attendance | null> {
    const row = await findRow(employeeId, todayIso());
    return row ? toAttendance(row) : null;
  },

  async history(employeeId: string): Promise<Attendance[]> {
    const records = await dataService.findAll(entity);
    return records
      .filter((r) => r["Employee ID"] === employeeId)
      .map(toAttendance)
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  /** All active employees for `date`, each joined with their attendance row (or null if unmarked). */
  async day(date: string): Promise<Array<{ employee: User; attendance: Attendance | null }>> {
    const [users, records] = await Promise.all([usersService.list(), dataService.findAll(entity)]);
    const byEmployee = new Map(records.filter((r) => r["Date"] === date).map((r) => [r["Employee ID"], r]));
    return users
      .filter((u) => u.status === "Active")
      .map((employee) => {
        const row = byEmployee.get(employee.id);
        return { employee, attendance: row ? toAttendance(row) : null };
      })
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  },
};
