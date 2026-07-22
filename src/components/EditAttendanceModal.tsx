"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Attendance, AttendanceStatus } from "@/lib/types";

const STATUS_OPTIONS: (AttendanceStatus | "")[] = ["Present", "Late", "Half Day", "Absent", "Leave"];

/** "2026-07-20T04:15:00.000Z" -> "09:45" (in the browser's local time, which matches office hours). */
function toTimeInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function EditAttendanceModal({
  employeeId,
  employeeName,
  date,
  attendance,
  onClose,
  onSaved,
}: {
  employeeId: string;
  employeeName: string;
  date: string;
  attendance: Attendance | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [checkInTime, setCheckInTime] = useState(toTimeInput(attendance?.checkIn ?? ""));
  const [checkOutTime, setCheckOutTime] = useState(toTimeInput(attendance?.checkOut ?? ""));
  const [autoStatus, setAutoStatus] = useState(true);
  const [status, setStatus] = useState<AttendanceStatus | "">(attendance?.status ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.patch("/attendance/edit", {
        employeeId,
        date,
        checkInTime,
        checkOutTime,
        ...(autoStatus ? {} : { status }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save attendance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm bg-surface-container-lowest border-2 border-on-surface">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md">
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">Edit Attendance</h3>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase"
          >
            Close
          </button>
        </div>

        <div className="p-stack-lg flex flex-col gap-4">
          <p className="font-data-mono text-data-mono text-on-surface-variant">
            {employeeName} — {date}
          </p>

          {error && (
            <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">{error}</p>
          )}

          <div className="flex flex-col gap-1">
            <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">Check-In Time</label>
            <input
              type="time"
              value={checkInTime}
              onChange={(e) => setCheckInTime(e.target.value)}
              className="border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-data-mono text-on-surface focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">Check-Out Time</label>
            <input
              type="time"
              value={checkOutTime}
              onChange={(e) => setCheckOutTime(e.target.value)}
              className="border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-data-mono text-on-surface focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2 font-label-sm text-label-sm uppercase text-on-surface-variant cursor-pointer">
            <input
              type="checkbox"
              checked={autoStatus}
              onChange={(e) => setAutoStatus(e.target.checked)}
            />
            Auto-calculate status from times
          </label>

          {!autoStatus && (
            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Status (manual override)
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AttendanceStatus | "")}
                className="border-2 border-on-surface bg-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
              >
                <option value="">Not Marked</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
