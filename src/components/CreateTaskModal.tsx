"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { Doer, Task, TaskPriority } from "@/lib/types";

export default function CreateTaskModal({
  doers,
  onClose,
  onCreated,
}: {
  doers: Doer[];
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedDoerId, setAssignedDoerId] = useState(doers[0]?.id ?? "");
  const [priority, setPriority] = useState<TaskPriority>("Normal");
  const [dueDate, setDueDate] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const task = await api.post<Task>("/tasks", {
        title,
        description,
        assignedDoerId,
        priority,
        dueDate,
        department,
      });
      onCreated(task);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create task.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-surface-container-lowest border-2 border-on-surface">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md">
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">
            Create Task
          </h3>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-stack-md p-stack-lg">
          <div>
            <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
              Title
            </label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
            />
          </div>

          <div>
            <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-stack-md">
            <div>
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Doer
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
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="Urgent">Urgent</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Due Date
              </label>
              <input
                required
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 font-data-mono text-data-mono text-on-surface focus:outline-none"
              />
            </div>

            <div>
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Department
              </label>
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
              />
            </div>
          </div>

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
