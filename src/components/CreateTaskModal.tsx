"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { Doer, List, Task, TaskPriority } from "@/lib/types";

type RepeatType = "None" | "Daily" | "Weekly" | "Monthly (By Date)" | "Monthly (By Day)";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const NTH_OPTIONS = ["First", "Second", "Third", "Fourth", "Last"];

export default function CreateTaskModal({
  doers,
  lists = [],
  defaultListId = "",
  onClose,
  onCreated,
}: {
  doers: Doer[];
  /** Named task-lists to choose from, in addition to the implicit "Office" bucket. */
  lists?: List[];
  defaultListId?: string;
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [listId, setListId] = useState(defaultListId);
  const [assignedDoerId, setAssignedDoerId] = useState(doers[0]?.id ?? "");
  const [priority, setPriority] = useState<TaskPriority>("Normal");
  const [dueDate, setDueDate] = useState("");
  const [repeatType, setRepeatType] = useState<RepeatType>("None");
  const [repeatWeekday, setRepeatWeekday] = useState("Monday");
  const [repeatMonthDate, setRepeatMonthDate] = useState("");
  const [repeatNth, setRepeatNth] = useState("First");
  const [repeatNthDay, setRepeatNthDay] = useState("Monday");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function buildRepeatValue(): string {
    if (repeatType === "None" || repeatType === "Daily") return "";
    if (repeatType === "Weekly") return repeatWeekday;
    if (repeatType === "Monthly (By Date)") {
      if (!repeatMonthDate) return "";
      return String(parseInt(repeatMonthDate.split("-")[2] ?? "1", 10));
    }
    if (repeatType === "Monthly (By Day)") return `${repeatNth} ${repeatNthDay}`;
    return "";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (repeatType === "Monthly (By Date)" && !repeatMonthDate) {
      setError("Please select a date for monthly repeat.");
      return;
    }

    setSubmitting(true);
    try {
      const task = await api.post<Task>("/tasks", {
        title,
        assignedDoerId,
        listId,
        priority,
        dueDate,
        repeatType,
        repeatValue: buildRepeatValue(),
      });
      onCreated(task);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create task.");
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    "mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none";
  const label = "font-label-sm text-label-sm uppercase text-on-surface-variant";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-surface-container-lowest border-2 border-on-surface">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md">
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">Create Task</h3>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-stack-md p-stack-lg">
          <div>
            <label className={label}>Task Details</label>
            <textarea
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={2}
              placeholder="What is the task?"
              className={field}
            />
          </div>

          {lists.length > 0 && (
            <div>
              <label className={label}>List</label>
              <select
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                className={field}
              >
                <option value="">Office (Default)</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={label}>Doer</label>
            <select
              required
              value={assignedDoerId}
              onChange={(e) => setAssignedDoerId(e.target.value)}
              className={field}
            >
              {doers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-stack-md">
            <div>
              <label className={label}>Planned Date</label>
              <input
                required
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={`${field} font-data-mono`}
              />
            </div>
            <div>
              <label className={label}>Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className={field}
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="Urgent">Urgent</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className={label}>Repeat</label>
            <select
              value={repeatType}
              onChange={(e) => { setRepeatType(e.target.value as RepeatType); }}
              className={field}
            >
              <option value="None">None (One-time)</option>
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Monthly (By Date)">Monthly (By Date)</option>
              <option value="Monthly (By Day)">Monthly (By Day)</option>
            </select>
          </div>

          {repeatType === "Weekly" && (
            <div>
              <label className={label}>Repeat On</label>
              <select
                value={repeatWeekday}
                onChange={(e) => setRepeatWeekday(e.target.value)}
                className={field}
              >
                {WEEKDAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}

          {repeatType === "Monthly (By Date)" && (
            <div>
              <label className={label}>Repeat On Date</label>
              <input
                type="date"
                required
                value={repeatMonthDate}
                onChange={(e) => setRepeatMonthDate(e.target.value)}
                className={`${field} font-data-mono`}
              />
              <p className="mt-1 font-data-mono text-xs text-on-surface-variant uppercase">
                Day of month extracted from selected date
              </p>
            </div>
          )}

          {repeatType === "Monthly (By Day)" && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className={label}>Occurrence</label>
                <select
                  value={repeatNth}
                  onChange={(e) => setRepeatNth(e.target.value)}
                  className={field}
                >
                  {NTH_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className={label}>Day</label>
                <select
                  value={repeatNthDay}
                  onChange={(e) => setRepeatNthDay(e.target.value)}
                  className={field}
                >
                  {WEEKDAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          )}

          {repeatType !== "None" && (
            <p className="font-data-mono text-xs text-on-surface-variant border border-on-surface-variant px-3 py-2 uppercase">
              ℹ️ Recurring task — system will auto-generate a new instance each day it matches.
            </p>
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
              {submitting ? "Creating..." : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
