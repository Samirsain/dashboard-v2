"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Doer } from "@/lib/types";

/**
 * "Someone's on long leave, move everything they're on the hook for" —
 * bulk-hands off every open task and active checklist template from one doer
 * to another in one action. Completed/Cancelled tasks and Inactive templates
 * are left alone: there's nothing left to do on them.
 */
export default function ReassignWorkModal({
  fromDoer: fixedFromDoer,
  doers,
  onClose,
  onReassigned,
}: {
  /**
   * Pre-selected source doer (e.g. Settings, opened from that doer's row).
   * Omit to let the user pick who they're moving work off of — e.g. from All
   * Tasks, where there's no row context to pre-select from.
   */
  fromDoer?: Doer;
  /** Everyone who can be the source and/or receive the work. */
  doers: Doer[];
  onClose: () => void;
  onReassigned: (result: { tasksReassigned: number; checklistsReassigned: number }) => void;
}) {
  const [fromDoerId, setFromDoerId] = useState(fixedFromDoer?.id ?? "");
  const [toDoerId, setToDoerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sources = doers.filter((d) => d.status === "Active");
  const fromDoer = fixedFromDoer ?? doers.find((d) => d.id === fromDoerId);
  const targets = doers.filter((d) => d.id !== fromDoerId && d.status === "Active");

  async function handleSubmit() {
    if (!fromDoerId) {
      setError("Pick whose work is moving.");
      return;
    }
    if (!toDoerId) {
      setError("Pick who this work should go to.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post<{ tasksReassigned: number; checklistsReassigned: number }>(
        "/tasks/reassign-all-work",
        { fromDoerId, toDoerId }
      );
      onReassigned(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reassign work.");
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    "mt-1 min-h-[40px] w-full border border-on-surface bg-surface px-3 py-2 text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface";
  const label = "font-label-sm text-label-sm uppercase text-on-surface-variant";
  const toDoer = targets.find((d) => d.id === toDoerId);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-y-auto border-2 border-on-surface bg-surface-container-lowest">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md sticky top-0 bg-surface-container-lowest">
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">
            Reassign All Work
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase"
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-stack-md p-stack-lg">
          <p className="font-body-md text-body-md text-on-surface">
            {fixedFromDoer ? (
              <>
                Moves every unfinished task and active checklist from{" "}
                <strong>{fixedFromDoer.name}</strong> to whoever you pick below — for example
                while they&apos;re on leave.
              </>
            ) : (
              "Moves every unfinished task and active checklist from one doer to another — for example while they're on leave."
            )}{" "}
            Already-completed or cancelled work stays exactly where it is.
          </p>

          {!fixedFromDoer && (
            <div>
              <label className={label}>Reassign work from</label>
              <select
                value={fromDoerId}
                onChange={(e) => {
                  setFromDoerId(e.target.value);
                  setToDoerId("");
                }}
                className={field}
              >
                <option value="">Select a doer…</option>
                {sources.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.employeeCode ? `(${d.employeeCode})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={label}>Reassign to</label>
            <select
              value={toDoerId}
              onChange={(e) => setToDoerId(e.target.value)}
              className={field}
            >
              <option value="">Select a doer…</option>
              {targets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.employeeCode ? `(${d.employeeCode})` : ""}
                </option>
              ))}
            </select>
            {targets.length === 0 && (
              <p className="mt-1 font-label-sm text-label-sm text-error">
                No other active doer to reassign to.
              </p>
            )}
          </div>

          {toDoer && fromDoer && (
            <p className="border border-on-surface/30 px-3 py-2 font-data-mono text-[11px] text-on-surface-variant">
              Every open task and active checklist currently on {fromDoer.name} will move to{" "}
              {toDoer.name}. From then on, {toDoer.name} is the one scored for it — including
              anything already overdue.
            </p>
          )}

          {error && (
            <p className="font-body-sm text-sm text-error border border-error px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-stack-sm pt-2 border-t border-on-surface/30">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-surface text-on-surface border-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !toDoerId || !fromDoerId}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-on-surface text-surface border-on-surface hover:opacity-90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Reassigning…" : "Reassign All Work"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
