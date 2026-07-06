"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { Doer, List } from "@/lib/types";

export default function CreateChecklistModal({
  doers,
  lists = [],
  onClose,
  onCreated,
}: {
  doers: Doer[];
  lists?: List[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [taskName, setTaskName] = useState("");
  const [frequency, setFrequency] = useState("Daily");
  const [assignedDoerId, setAssignedDoerId] = useState(doers[0]?.id ?? "");
  const [listId, setListId] = useState("");
  const [calendarDate, setCalendarDate] = useState(""); // YYYY-MM-DD

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    
    let finalFreqValue = "";

    if (frequency === "Daily") {
      finalFreqValue = "1";
    } else if (frequency === "Weekly") {
      if (!calendarDate) {
        setError("Please select a day of the week.");
        setSubmitting(false);
        return;
      }
      finalFreqValue = calendarDate;
    } else if (frequency === "Monthly (By Date)") {
      if (!calendarDate) {
        setError("Please select a date from the calendar.");
        setSubmitting(false);
        return;
      }
      const parts = calendarDate.split("-");
      const dayNum = parseInt(parts[2], 10);
      finalFreqValue = String(dayNum);
    } else if (frequency === "Monthly (By Day)") {
      if (!calendarDate) {
        setError("Please select the occurrence and day.");
        setSubmitting(false);
        return;
      }
      finalFreqValue = calendarDate;
    } else {
      if (!calendarDate) {
        setError("Please select a starting date.");
        setSubmitting(false);
        return;
      }
      
      const parts = calendarDate.split("-");
      const mm = parseInt(parts[1], 10);
      const ddStr = parts[2];

      const dates = [];
      let interval = 12; // Yearly
      if (frequency === "Quarterly") interval = 3;
      if (frequency === "HalfYearly") interval = 6;
      
      for (let i = 0; i < 12 / interval; i++) {
        const currentMm = ((mm - 1 + i * interval) % 12) + 1;
        dates.push(`${currentMm.toString().padStart(2, '0')}-${ddStr}`);
      }
      finalFreqValue = dates.join(",");
    }

    try {
      await api.post("/checklist/templates", {
        taskName,
        listId,
        description: "",
        frequency,
        frequencyValue: finalFreqValue,
        assignedDoerId,
        priority: "Normal",
        department: "",
        status: "Active",
      });
      // Generate today's checklist right away so the new template appears if applicable
      await api.post("/checklist/generate");
      
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create checklist template.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-surface-container-lowest border-2 border-on-surface">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md">
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">
            Create Checklist Task
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-stack-md p-stack-lg">
          <div>
            <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
              Task
            </label>
            <input
              required
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="What needs to be done?"
              className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
            />
          </div>

          {lists.length > 0 && (
            <div>
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                List
              </label>
              <select
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
              >
                <option value="">— No list —</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-stack-md">
            <div>
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Assign To
              </label>
              <select
                required
                value={assignedDoerId}
                onChange={(e) => setAssignedDoerId(e.target.value)}
                className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
              >
                {doers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Frequency
              </label>
              <select
                value={frequency}
                onChange={(e) => {
                  setFrequency(e.target.value);
                  setCalendarDate(""); // reset on change
                }}
                className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
              >
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly (By Date)">Monthly (By Date)</option>
                <option value="Monthly (By Day)">Monthly (By Day)</option>
                <option value="Quarterly">Quarterly</option>
                <option value="HalfYearly">Half Yearly</option>
                <option value="Yearly">Yearly</option>
              </select>
            </div>
          </div>

          {frequency === "Weekly" && (
            <div>
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Select Day
              </label>
              <select
                required
                value={calendarDate}
                onChange={(e) => setCalendarDate(e.target.value)}
                className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
              >
                <option value="" disabled>Select a day</option>
                <option value="Monday">Monday</option>
                <option value="Tuesday">Tuesday</option>
                <option value="Wednesday">Wednesday</option>
                <option value="Thursday">Thursday</option>
                <option value="Friday">Friday</option>
                <option value="Saturday">Saturday</option>
                <option value="Sunday">Sunday</option>
              </select>
            </div>
          )}

          {frequency === "Monthly (By Date)" && (
            <div>
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Select Date
              </label>
              <input
                required
                type="date"
                value={calendarDate}
                onChange={(e) => setCalendarDate(e.target.value)}
                className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
              />
              <p className="text-xs text-on-surface-variant mt-1 uppercase font-data-mono">
                System will extract the day of the month from your selected date.
              </p>
            </div>
          )}

          {frequency === "Monthly (By Day)" && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                  Occurrence
                </label>
                <select
                  required
                  value={calendarDate.split(" ")[0] || ""}
                  onChange={(e) => setCalendarDate(`${e.target.value} ${calendarDate.split(" ")[1] || "Monday"}`)}
                  className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
                >
                  <option value="" disabled>Select</option>
                  <option value="First">First</option>
                  <option value="Second">Second</option>
                  <option value="Third">Third</option>
                  <option value="Fourth">Fourth</option>
                  <option value="Last">Last</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                  Day
                </label>
                <select
                  required
                  value={calendarDate.split(" ")[1] || ""}
                  onChange={(e) => setCalendarDate(`${calendarDate.split(" ")[0] || "First"} ${e.target.value}`)}
                  className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
                >
                  <option value="" disabled>Select</option>
                  <option value="Monday">Monday</option>
                  <option value="Tuesday">Tuesday</option>
                  <option value="Wednesday">Wednesday</option>
                  <option value="Thursday">Thursday</option>
                  <option value="Friday">Friday</option>
                  <option value="Saturday">Saturday</option>
                  <option value="Sunday">Sunday</option>
                </select>
              </div>
            </div>
          )}

          {(frequency === "Quarterly" || frequency === "HalfYearly" || frequency === "Yearly") && (
            <div>
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Pick Starting Date from Calendar
              </label>
              <input
                required
                type="date"
                value={calendarDate}
                onChange={(e) => setCalendarDate(e.target.value)}
                className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 font-data-mono text-data-mono text-on-surface focus:outline-none"
              />
              <p className="text-xs text-on-surface-variant mt-1 uppercase font-data-mono">
                System will auto-calculate upcoming {frequency.toLowerCase()} dates based on this starting date.
              </p>
            </div>
          )}

          {error && (
            <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-stack-sm justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || doers.length === 0}
              className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
