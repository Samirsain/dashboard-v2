import { sheetsConfig } from "../config/sheets.config";
import { dataService, type SheetRecord } from "./data.service";
import { usersService } from "./users.service";
import { generateId } from "../utils/id";
import { todayIso } from "../utils/date";
import { computeCheckInStatus, computeCheckOutStatus, minutesBetween, zonedTimeToUtcIso } from "../utils/attendanceTime";
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
    const { earlyExitMinutes, forcedHalfDay, forcedLate } = computeCheckOutStatus(new Date());
    const workingMinutes = minutesBetween(existing["CheckIn"] as string, nowIso);
    // Early departure can only make the day worse, never better: before 5 PM
    // forces Half Day; before 6:15 PM downgrades a Present day to Late.
    const current = ((existing["Status"] as AttendanceStatus) || "Present") as AttendanceStatus;
    let status: AttendanceStatus = current;
    if (forcedHalfDay && (current === "Present" || current === "Late")) status = "Half Day";
    else if (forcedLate && current === "Present") status = "Late";
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

  /**
   * Admin edit: directly set check-in/check-out time (HH:MM, or "" to clear)
   * and/or status for any date — past or today. Status auto-recalculates from
   * the resulting times using the current policy unless an explicit status is
   * passed, which always wins. Creates the row if it doesn't exist yet.
   */
  async editRecord(
    employeeId: string,
    date: string,
    patch: { checkInTime?: string; checkOutTime?: string; status?: AttendanceStatus | ""; remarks?: string },
    markedBy: string
  ): Promise<Attendance> {
    const existing = await findRow(employeeId, date);

    let checkInIso = (existing?.["CheckIn"] as string) ?? "";
    if (patch.checkInTime !== undefined) {
      checkInIso = patch.checkInTime ? zonedTimeToUtcIso(date, patch.checkInTime) : "";
    }
    let checkOutIso = (existing?.["CheckOut"] as string) ?? "";
    if (patch.checkOutTime !== undefined) {
      checkOutIso = patch.checkOutTime ? zonedTimeToUtcIso(date, patch.checkOutTime) : "";
    }

    let computedStatus: AttendanceStatus | "" = (existing?.["Status"] as AttendanceStatus) || "";
    let lateMinutes = 0;
    let earlyExitMinutes = 0;
    let workingMinutes = 0;

    if (checkInIso) {
      const inResult = computeCheckInStatus(new Date(checkInIso));
      computedStatus = inResult.status;
      lateMinutes = inResult.lateMinutes;
    }
    if (checkInIso && checkOutIso) {
      const out = computeCheckOutStatus(new Date(checkOutIso));
      earlyExitMinutes = Math.max(0, out.earlyExitMinutes);
      workingMinutes = minutesBetween(checkInIso, checkOutIso);
      if (out.forcedHalfDay && (computedStatus === "Present" || computedStatus === "Late")) computedStatus = "Half Day";
      else if (out.forcedLate && computedStatus === "Present") computedStatus = "Late";
    }

    // An explicit status (including clearing it back to "") always overrides the computed one.
    const finalStatus = patch.status !== undefined ? patch.status : computedStatus;

    const dbPatch: Partial<SheetRecord> = {
      CheckIn: checkInIso,
      CheckOut: checkOutIso,
      Status: finalStatus,
      "Late Minutes": String(lateMinutes),
      "Early Exit Minutes": String(earlyExitMinutes),
      "Working Minutes": String(workingMinutes),
    };
    if (patch.remarks !== undefined) dbPatch["Remarks"] = patch.remarks;

    return upsert(employeeId, date, dbPatch, markedBy);
  },

  /**
   * Re-applies the current office-hours policy to every attendance row that
   * has a CheckIn timestamp, recomputing Status / Late Minutes / Early Exit /
   * Working Minutes from the recorded times. Rows without a CheckIn (manually
   * marked Absent/Leave) are left untouched. Returns how many rows changed.
   */
  async recomputeAll(markedBy: string): Promise<number> {
    const records = await dataService.findAll(entity);
    let updated = 0;
    for (const r of records) {
      const checkIn = r["CheckIn"] as string;
      if (!checkIn) continue;

      const { status: inStatus, lateMinutes } = computeCheckInStatus(new Date(checkIn));
      let status: AttendanceStatus = inStatus;
      let earlyExitMinutes = 0;
      let workingMinutes = Number(r["Working Minutes"] ?? "0") || 0;

      const checkOut = r["CheckOut"] as string;
      if (checkOut) {
        const out = computeCheckOutStatus(new Date(checkOut));
        earlyExitMinutes = Math.max(0, out.earlyExitMinutes);
        workingMinutes = minutesBetween(checkIn, checkOut);
        if (out.forcedHalfDay && (status === "Present" || status === "Late")) status = "Half Day";
        else if (out.forcedLate && status === "Present") status = "Late";
      }

      const patch: Partial<SheetRecord> = {};
      if ((r["Status"] ?? "") !== status) patch["Status"] = status;
      if ((Number(r["Late Minutes"] ?? "0") || 0) !== lateMinutes) patch["Late Minutes"] = String(lateMinutes);
      if ((Number(r["Early Exit Minutes"] ?? "0") || 0) !== earlyExitMinutes)
        patch["Early Exit Minutes"] = String(earlyExitMinutes);
      if ((Number(r["Working Minutes"] ?? "0") || 0) !== workingMinutes)
        patch["Working Minutes"] = String(workingMinutes);

      if (Object.keys(patch).length === 0) continue;
      await dataService.updateById(entity, r["Attendance ID"] as string, {
        ...patch,
        MarkedBy: markedBy,
        UpdatedAt: new Date().toISOString(),
      });
      updated++;
    }
    return updated;
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

  /** Per-employee attendance counts for every day in [from, to] (inclusive). */
  async range(
    from: string,
    to: string
  ): Promise<Array<{ employee: User; counts: Record<AttendanceStatus, number>; totalMarked: number }>> {
    const [users, records] = await Promise.all([usersService.list(), dataService.findAll(entity)]);
    const inRange = records.filter((r) => {
      const date = r["Date"] as string;
      return date >= from && date <= to;
    });
    const byEmployee = new Map<string, SheetRecord[]>();
    for (const r of inRange) {
      const employeeId = r["Employee ID"] as string;
      const list = byEmployee.get(employeeId) ?? [];
      list.push(r);
      byEmployee.set(employeeId, list);
    }
    return users
      .filter((u) => u.status === "Active" && u.role !== "Admin")
      .map((employee) => {
        const counts: Record<AttendanceStatus, number> = {
          Present: 0,
          Late: 0,
          "Half Day": 0,
          Absent: 0,
          Leave: 0,
        };
        let totalMarked = 0;
        for (const r of byEmployee.get(employee.id) ?? []) {
          const status = r["Status"] as AttendanceStatus | "";
          if (status) {
            counts[status]++;
            totalMarked++;
          }
        }
        return { employee, counts, totalMarked };
      })
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  },

  /** All active employees for `date`, each joined with their attendance row (or null if unmarked). */
  async day(date: string): Promise<Array<{ employee: User; attendance: Attendance | null }>> {
    const [users, records] = await Promise.all([usersService.list(), dataService.findAll(entity)]);
    const byEmployee = new Map(records.filter((r) => r["Date"] === date).map((r) => [r["Employee ID"], r]));
    return users
      .filter((u) => u.status === "Active" && u.role !== "Admin")
      .map((employee) => {
        const row = byEmployee.get(employee.id);
        return { employee, attendance: row ? toAttendance(row) : null };
      })
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  },

  /** Permanently deletes every attendance record for every employee/date. Irreversible. */
  async clearAll(): Promise<number> {
    return dataService.deleteAll(entity);
  },
};
