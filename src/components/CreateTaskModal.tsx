"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { Doer, List, Task, TaskPriority } from "@/lib/types";

export default function CreateTaskModal({
  doers,
  lists = [],
  defaultListId = "",
  onClose,
  onCreated,
}: {
  doers: Doer[];
  lists?: List[];
  defaultListId?: string;
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [assignedDoerId, setAssignedDoerId] = useState(doers[0]?.id ?? "");
  const [listId, setListId] = useState(defaultListId);
  const [priority, setPriority] = useState<TaskPriority>("Normal");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const task = await api.post<Task>("/tasks", {
        title,
        assignedDoerId,
        listId,
        priority,
        dueDate,
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
                <option value="Normal">Normal</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
          </div>

          {lists.length > 0 && (
            <div>
              <label className={label}>List</label>
              <select value={listId} onChange={(e) => setListId(e.target.value)} className={field}>
                <option value="">— No list —</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
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
              {submitting ? "Creating..." : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
