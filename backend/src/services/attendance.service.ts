import { sheetsConfig } from "../config/sheets.config";
import { dataService, type SheetRecord } from "./data.service";
import { usersService } from "./users.service";
import { generateId } from "../utils/id";
import { todayIso } from "../utils/date";
import {
  computeAttendance,
  isCheckoutOverdue,
  minutesSinceCheckIn,
  zonedTimeToUtcIso,
} from "../utils/attendanceTime";
import { AppError } from "../utils/AppError";
import type { Attendance, AttendanceStatus, User } from "../types";

const entity = sheetsConfig.attendance;

/** One "checked in but never checked out" warning, joined with the employee it belongs to. */
export interface CheckoutAlert {
  employee: User;
  attendance: Attendance;
  /** Minutes since check-in, i.e. how long they have been "in" without an out. */
  elapsedMinutes: number;
}

/** Empty per-status buckets — one shape reused for counts and for date lists. */
function emptyStatusMap<T>(make: () => T): Record<AttendanceStatus, T> {
  return {
    Present: make(),
    Late: make(),
    "Half Day": make(),
    Absent: make(),
    Leave: make(),
    "Pending Checkout": make(),
  };
}

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
    const nowIso = new Date().toISOString();
    const calc = computeAttendance(new Date(), null);
    return upsert(
      employeeId,
      date,
      { CheckIn: nowIso, Status: calc.status, "Late Minutes": String(calc.lateMinutes) },
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
    const checkInDate = new Date(existing["CheckIn"] as string);
    const checkOutDate = new Date(nowIso);
    const calc = computeAttendance(checkInDate, checkOutDate);
    return upsert(
      employeeId,
      date,
      {
        CheckOut: nowIso,
        Status: calc.status,
        "Working Minutes": String(calc.workingMinutes),
        "Early Exit Minutes": String(calc.earlyExitMinutes),
        "Late Minutes": String(calc.lateMinutes),
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
      const calc = computeAttendance(
        new Date(checkInIso),
        checkOutIso ? new Date(checkOutIso) : null
      );
      computedStatus = calc.status;
      lateMinutes = calc.lateMinutes;
      earlyExitMinutes = calc.earlyExitMinutes;
      workingMinutes = calc.workingMinutes;
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

      const checkOut = r["CheckOut"] as string;
      const calc = computeAttendance(
        new Date(checkIn),
        checkOut ? new Date(checkOut) : null
      );

      const patch: Partial<SheetRecord> = {};
      if ((r["Status"] ?? "") !== calc.status) patch["Status"] = calc.status;
      if ((Number(r["Late Minutes"] ?? "0") || 0) !== calc.lateMinutes)
        patch["Late Minutes"] = String(calc.lateMinutes);
      if ((Number(r["Early Exit Minutes"] ?? "0") || 0) !== calc.earlyExitMinutes)
        patch["Early Exit Minutes"] = String(calc.earlyExitMinutes);
      if ((Number(r["Working Minutes"] ?? "0") || 0) !== calc.workingMinutes)
        patch["Working Minutes"] = String(calc.workingMinutes);

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

  /**
   * Per-employee attendance counts for every day in [from, to] (inclusive),
   * plus the actual dates behind each count — so the report can answer
   * "which days exactly was this person on Leave / Half Day?" without a
   * second round-trip.
   */
  async range(
    from: string,
    to: string
  ): Promise<
    Array<{
      employee: User;
      counts: Record<AttendanceStatus, number>;
      dates: Record<AttendanceStatus, string[]>;
      totalMarked: number;
    }>
  > {
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
      .filter((u) => u.status === "Active" && u.role !== "MD")
      .map((employee) => {
        const counts = emptyStatusMap<number>(() => 0);
        const dates = emptyStatusMap<string[]>(() => []);
        let totalMarked = 0;
        for (const r of byEmployee.get(employee.id) ?? []) {
          const status = r["Status"] as AttendanceStatus | "";
          // A status written by an older policy that no longer exists is
          // ignored rather than crashing the whole report.
          if (!status || !(status in counts)) continue;
          counts[status]++;
          dates[status].push(r["Date"] as string);
          totalMarked++;
        }
        for (const list of Object.values(dates)) list.sort();
        return { employee, counts, dates, totalMarked };
      })
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  },

  /**
   * Every employee who checked in and never checked out, once the alert
   * threshold has passed — across all dates, not just today, so a check-out
   * forgotten last week still surfaces. Longest-pending first. Pass
   * `employeeId` to narrow it to one person (what a doer sees on their own page).
   */
  async pendingCheckouts(employeeId?: string, now: Date = new Date()): Promise<CheckoutAlert[]> {
    const [users, records] = await Promise.all([usersService.list(), dataService.findAll(entity)]);
    const byId = new Map(
      users.filter((u) => u.status === "Active" && u.role !== "MD").map((u) => [u.id, u])
    );
    const alerts: CheckoutAlert[] = [];
    for (const r of records) {
      const rowEmployeeId = (r["Employee ID"] as string) ?? "";
      if (employeeId && rowEmployeeId !== employeeId) continue;
      if (!isCheckoutOverdue((r["CheckIn"] as string) ?? "", (r["CheckOut"] as string) ?? "", now)) continue;
      const employee = byId.get(rowEmployeeId);
      if (!employee) continue; // inactive/deleted employee — nothing to act on
      alerts.push({
        employee,
        attendance: toAttendance(r),
        elapsedMinutes: minutesSinceCheckIn(r["CheckIn"] as string, now),
      });
    }
    return alerts.sort((a, b) => b.elapsedMinutes - a.elapsedMinutes);
  },

  /** All active employees for `date`, each joined with their attendance row (or null if unmarked). */
  async day(date: string): Promise<Array<{ employee: User; attendance: Attendance | null }>> {
    const [users, records] = await Promise.all([usersService.list(), dataService.findAll(entity)]);
    const byEmployee = new Map(records.filter((r) => r["Date"] === date).map((r) => [r["Employee ID"], r]));
    return users
      .filter((u) => u.status === "Active" && u.role !== "MD")
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
