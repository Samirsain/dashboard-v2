import { env } from "../config/env";
import type { AttendanceStatus } from "../types";

/** Minutes since midnight for `date`, in the configured timezone. */
export function minutesSinceMidnight(date: Date, timeZone = env.scheduler.timezone): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

// Office-hours Policy Timings:
// Office Start: 9:30 AM | Office End: 6:30 PM (18:30)
// Step 1: Initial Status from Check-in
//   9:30 AM - 9:45 AM  -> Present (P)
//   9:46 AM - 11:00 AM -> Late (L)
//   11:01 AM - 2:30 PM -> Half Day (H)
//   After 2:30 PM      -> Absent (A)
const ON_TIME_END_MINUTES = 9 * 60 + 45; // 09:45 AM
const LATE_END_MINUTES = 11 * 60; // 11:00 AM
const HALF_DAY_END_MINUTES = 14 * 60 + 30; // 02:30 PM (14:30)
const OFFICE_END_MINUTES = 18 * 60 + 30; // 06:30 PM (18:30)

export interface AttendanceCalculationResult {
  status: AttendanceStatus;
  lateMinutes: number;
  earlyExitMinutes: number;
  workingMinutes: number;
}

/**
 * Computes final attendance status, late minutes, early exit minutes, and working minutes
 * using Check-in Time and Check-out Time per the Attendance Policy Rules.
 */
export function computeAttendance(
  checkInDate?: Date | null,
  checkOutDate?: Date | null
): AttendanceCalculationResult {
  // Step 6: If Check-in is missing -> Absent
  if (!checkInDate) {
    return { status: "Absent", lateMinutes: 0, earlyExitMinutes: 0, workingMinutes: 0 };
  }

  const inMins = minutesSinceMidnight(checkInDate);
  const lateMinutes = inMins > ON_TIME_END_MINUTES ? inMins - ON_TIME_END_MINUTES : 0;

  // Step 1: Initial Status from Check-in
  let initialStatus: AttendanceStatus;
  if (inMins <= ON_TIME_END_MINUTES) {
    initialStatus = "Present";
  } else if (inMins <= LATE_END_MINUTES) {
    initialStatus = "Late";
  } else if (inMins <= HALF_DAY_END_MINUTES) {
    initialStatus = "Half Day";
  } else {
    initialStatus = "Absent";
  }

  // Step 5: If Check-out is missing -> Pending Checkout
  if (!checkOutDate) {
    return {
      status: "Pending Checkout",
      lateMinutes,
      earlyExitMinutes: 0,
      workingMinutes: 0,
    };
  }

  // Step 2: Working Hours = Check-out Time - Check-in Time
  const outMins = minutesSinceMidnight(checkOutDate);
  const earlyExitMinutes = outMins < OFFICE_END_MINUTES ? OFFICE_END_MINUTES - outMins : 0;
  const workingMinutes = Math.max(0, Math.round((checkOutDate.getTime() - checkInDate.getTime()) / 60000));

  // Step 3: Apply Final Attendance Rules
  let finalStatus: AttendanceStatus;

  // Rule 4: If Check-in is after 2:30 PM -> Absent regardless of working hours
  if (inMins > HALF_DAY_END_MINUTES) {
    finalStatus = "Absent";
  }
  // Rule 1: Working Hours < 4 hours (240 mins) -> Absent
  else if (workingMinutes < 240) {
    finalStatus = "Absent";
  }
  // Rule 2: Working Hours >= 4 hours and < 8 hours (240 mins <= workingMinutes < 480 mins) -> Half Day
  else if (workingMinutes < 480) {
    finalStatus = "Half Day";
  }
  // Rule 3: Working Hours >= 8 hours (480 mins) -> Keep Check-in Status
  else {
    finalStatus = initialStatus;
  }

  return {
    status: finalStatus,
    lateMinutes,
    earlyExitMinutes,
    workingMinutes,
  };
}

/** Whole minutes between two ISO timestamps. */
export function minutesBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return Math.max(0, Math.round((end - start) / 60000));
}

/** How far `date` (interpreted as a UTC instant) actually is from the wall-clock time in `timeZone`, in minutes. */
function timezoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return (asUtc - date.getTime()) / 60000;
}

/**
 * Converts a wall-clock date + "HH:MM" time, as read in `timeZone`, into the
 * matching UTC instant (ISO string) — used to save an admin-entered
 * check-in/check-out time back as a proper timestamp. Handles DST correctly.
 */
export function zonedTimeToUtcIso(
  dateStr: string,
  timeStr: string,
  timeZone = env.scheduler.timezone
): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!, 0));
  const offsetMinutes = timezoneOffsetMinutes(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60000).toISOString();
}
