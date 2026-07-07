"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { Doer, WorkflowTemplate } from "@/lib/types";

type StepDraft = { what: string; doerId: string; how: string; tatMode: "hours" | "SAME_DAY" | "NEXT_DAY" | "WHENEVER_NEEDED"; tatHours: string };

function emptyStep(defaultDoerId: string): StepDraft {
  return { what: "", doerId: defaultDoerId, how: "", tatMode: "hours", tatHours: "2" };
}

export default function CreateWorkflowTemplateModal({
  doers,
  onClose,
  onCreated,
}: {
  doers: Doer[];
  onClose: () => void;
  onCreated: (template: WorkflowTemplate) => void;
}) {
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep(doers[0]?.id ?? "")]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStep() {
    setSteps((prev) => [...prev, emptyStep(doers[0]?.id ?? "")]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const template = await api.post<WorkflowTemplate>("/workflow/templates", {
        name,
        steps: steps.map((s) => ({
          what: s.what,
          doerId: s.doerId,
          how: s.how,
          tat: s.tatMode === "hours" ? `${s.tatHours}h` : s.tatMode,
        })),
      });
      onCreated(template);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create workflow template.");
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    "mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none";
  const label = "font-label-sm text-label-sm uppercase text-on-surface-variant";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl bg-surface-container-lowest border-2 border-on-surface max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md sticky top-0 bg-surface-container-lowest">
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">
            Create Workflow Template
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
            <label className={label}>Workflow Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Video Production Pipeline"
              className={field}
            />
          </div>

          <div className="flex flex-col gap-stack-md">
            {steps.map((s, i) => (
              <div key={i} className="border-2 border-on-surface p-stack-md flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                    Step {i + 1}
                  </span>
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      className="font-label-sm text-label-sm uppercase text-error"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <input
                  required
                  value={s.what}
                  onChange={(e) => updateStep(i, { what: e.target.value })}
                  placeholder="What (e.g. Record Video)"
                  className={field}
                />

                <div className="grid grid-cols-2 gap-2">
                  <select
                    required
                    value={s.doerId}
                    onChange={(e) => updateStep(i, { doerId: e.target.value })}
                    className={field}
                  >
                    {doers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={s.how}
                    onChange={(e) => updateStep(i, { how: e.target.value })}
                    placeholder="How (e.g. iPhone + Mic)"
                    className={field}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={s.tatMode}
                    onChange={(e) => updateStep(i, { tatMode: e.target.value as StepDraft["tatMode"] })}
                    className={field}
                  >
                    <option value="hours">Hours</option>
                    <option value="SAME_DAY">Same Day</option>
                    <option value="NEXT_DAY">Next Day</option>
                    <option value="WHENEVER_NEEDED">Whenever Needed</option>
                  </select>
                  {s.tatMode === "hours" && (
                    <input
                      required
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={s.tatHours}
                      onChange={(e) => updateStep(i, { tatHours: e.target.value })}
                      placeholder="TAT in hours"
                      className={`${field} font-data-mono`}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addStep}
            className="border-2 border-on-surface px-4 py-2 font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors self-start"
          >
            + Add Step
          </button>

          {error && (
            <p className="font-body-sm text-body-sm text-error border-2 border-error px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-stack-sm">
            <button
              type="button"
              onClick={onClose}
              className="border-2 border-on-surface px-4 py-2 font-label-sm text-label-sm uppercase text-on-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || doers.length === 0}
              className="border-2 border-on-surface bg-on-surface px-4 py-2 font-label-sm text-label-sm uppercase text-surface disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
