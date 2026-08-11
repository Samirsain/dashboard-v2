"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { WorkflowInstance, WorkflowStepEvent, WorkflowTemplate } from "@/lib/types";

export default function StartWorkflowInstanceModal({
  templates,
  onClose,
  onStarted,
}: {
  templates: WorkflowTemplate[];
  onClose: () => void;
  onStarted: (result: { instance: WorkflowInstance; steps: WorkflowStepEvent[] }) => void;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  // Keyed by template so switching templates mid-entry doesn't carry one
  // template's answers into another's differently-shaped fields.
  const [valuesByTemplate, setValuesByTemplate] = useState<Record<string, string[]>>({});
  // Target dates for this template's "Whenever Needed" steps, keyed by step number.
  const [deadlinesByTemplate, setDeadlinesByTemplate] = useState<Record<string, Record<number, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const template = templates.find((t) => t.id === templateId);
  const fields = template?.fields ?? [];
  const values = valuesByTemplate[templateId] ?? [];
  const deadlines = deadlinesByTemplate[templateId] ?? {};
  const whenNeededSteps = (template?.steps ?? []).filter(
    (s) => s.tat.trim().toUpperCase() === "WHENEVER_NEEDED"
  );

  function setValue(index: number, value: string) {
    setValuesByTemplate((prev) => {
      const next = [...(prev[templateId] ?? [])];
      next[index] = value;
      return { ...prev, [templateId]: next };
    });
  }

  function setDeadline(stepNo: number, value: string) {
    setDeadlinesByTemplate((prev) => ({
      ...prev,
      [templateId]: { ...(prev[templateId] ?? {}), [stepNo]: value },
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post<{ instance: WorkflowInstance; steps: WorkflowStepEvent[] }>(
        "/workflow/instances",
        {
          templateId,
          details,
          // Sent positionally, matching the template's own field order.
          fieldValues: fields.map((_, i) => values[i] ?? ""),
          // Only templates without fields need a typed-in name.
          ...(fields.length === 0 ? { title } : {}),
          stepDeadlines: deadlines,
        }
      );
      onStarted(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start workflow.");
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    "mt-1 min-h-[40px] w-full border border-on-surface bg-surface px-3 py-2 text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface";
  const label = "font-label-sm text-label-sm uppercase text-on-surface-variant";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-y-auto border border-on-surface bg-surface">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md">
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">
            Start Workflow
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
            <label className={label}>Workflow Template</label>
            <select
              required
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className={field}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.steps.length} steps)
                </option>
              ))}
            </select>
          </div>

          {/* The template's own data fields. Templates created before fields
              existed have none, so they still just take a name. */}
          {fields.length === 0 ? (
            <div>
              <label className={label}>Title</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 30M Website"
                className={field}
              />
              <p className="mt-1 font-data-mono text-[10px] text-on-surface-variant uppercase">
                Which one this run is for — each gets its own chain
              </p>
            </div>
          ) : (
            fields.map((f, i) => (
              <div key={f.id}>
                <label className={label}>{f.label}</label>
                <input
                  required={i === 0}
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  value={values[i] ?? ""}
                  onChange={(e) => setValue(i, e.target.value)}
                  className={`${field} ${f.type === "text" ? "" : "font-data-mono"}`}
                />
                {i === 0 && (
                  <p className="mt-1 font-data-mono text-[10px] text-on-surface-variant uppercase">
                    This names the run
                  </p>
                )}
              </div>
            ))
          )}

          {/* "Whenever Needed" steps have no automatic deadline — pick one
              per step now so the doer isn't left with no target at all. */}
          {whenNeededSteps.length > 0 && (
            <div className="border-2 border-on-surface p-stack-md flex flex-col gap-2">
              <div>
                <span className={label}>Target Dates (Optional)</span>
                <p className="mt-0.5 font-data-mono text-[10px] text-on-surface-variant uppercase">
                  These steps have no fixed turnaround — give them a date if one applies
                </p>
              </div>
              {whenNeededSteps.map((s) => (
                <div key={s.id}>
                  <label className={label}>{s.what}</label>
                  <input
                    type="date"
                    value={deadlines[s.stepNo] ?? ""}
                    onChange={(e) => setDeadline(s.stepNo, e.target.value)}
                    className={`${field} font-data-mono`}
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <label className={label}>Details (Optional)</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              placeholder="Any extra info for the team"
              className={field}
            />
          </div>

          {error && (
            <p className="font-body-sm text-sm text-error border border-error px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-stack-sm">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-surface text-on-surface border-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || templates.length === 0}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-on-surface text-surface border-on-surface hover:opacity-90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Starting..." : "Start Workflow"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
