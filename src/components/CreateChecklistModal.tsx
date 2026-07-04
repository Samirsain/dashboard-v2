"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { Doer } from "@/lib/types";

export default function CreateChecklistModal({
  doers,
  onClose,
  onCreated,
}: {
  doers: Doer[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [taskName, setTaskName] = useState("");
  const [frequency, setFrequency] = useState("Daily");
  const [assignedDoerId, setAssignedDoerId] = useState(doers[0]?.id ?? "");
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
    } else {
      if (!calendarDate) {
        setError("Please select a date from the calendar.");
        setSubmitting(false);
        return;
      }
      
      const dateObj = new Date(calendarDate);
      const parts = calendarDate.split("-");
      const ddStr = parts[2];
      const mm = parseInt(parts[1], 10);
      const dd = parseInt(ddStr, 10);

      if (frequency === "Weekly") {
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        finalFreqValue = days[dateObj.getUTCDay()]; // e.g. "Monday"
      } else if (frequency === "Monthly") {
        finalFreqValue = dd.toString(); // e.g. "15"
      } else {
        // Quarterly, HalfYearly, Yearly
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
    }

    try {
      await api.post("/checklist/templates", {
        taskName,
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
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
                <option value="HalfYearly">Half Yearly</option>
                <option value="Yearly">Yearly</option>
              </select>
            </div>
          </div>

          {/* Unified Date Picker for all frequencies except Daily */}
          {frequency !== "Daily" && (
            <div>
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Pick a Date from Calendar
              </label>
              <input
                required
                type="date"
                value={calendarDate}
                onChange={(e) => setCalendarDate(e.target.value)}
                className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 font-data-mono text-data-mono text-on-surface focus:outline-none"
              />
              <p className="text-xs text-on-surface-variant mt-1 uppercase font-data-mono">
                {frequency === "Weekly" && "System will automatically select this day of the week (e.g. Monday)."}
                {frequency === "Monthly" && "System will automatically select this date of the month (e.g. 15th)."}
                {(frequency === "Quarterly" || frequency === "HalfYearly" || frequency === "Yearly") && 
                  `System will auto-calculate upcoming ${frequency.toLowerCase()} dates based on this starting date.`}
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
