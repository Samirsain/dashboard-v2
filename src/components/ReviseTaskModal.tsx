"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { formatDMY } from "@/lib/format";
import type { Task } from "@/lib/types";

export default function ReviseTaskModal({
  task,
  onClose,
  onRevised,
}: {
  task: Task;
  onClose: () => void;
  onRevised: () => void;
}) {
  const [newDueDate, setNewDueDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/tasks/${task.id}/revision`, {
        newDueDate,
        reason,
      });
      onRevised();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revise task.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-y-auto border border-on-surface bg-surface">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md">
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">
            Revise Task: {task.title}
          </h3>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-stack-md p-stack-lg">
          <div className="text-on-surface-variant font-data-mono text-data-mono uppercase">
            Current Due Date: <span className="text-on-surface">{formatDMY(task.dueDate)}</span>
          </div>

          <div>
            <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
              New Due Date
            </label>
            <input
              required
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 font-data-mono text-data-mono text-on-surface focus:outline-none"
            />
          </div>

          <div>
            <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
              Reason for Revision (Optional)
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="E.g., Client requested delay"
              className="mt-1 min-h-[40px] w-full border border-on-surface bg-surface px-3 py-2 text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface"
            />
          </div>

          {error && (
            <p className="font-label-sm text-sm text-error border border-error px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-stack-sm justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-surface text-on-surface border-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-on-surface text-surface border-on-surface hover:opacity-90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Revising..." : "Submit Revision"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
