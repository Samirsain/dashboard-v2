"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { Doer, WorkflowFieldType, WorkflowTemplate } from "@/lib/types";

type FieldDraft = { label: string; type: WorkflowFieldType };

type TatMode = "minutes" | "hours" | "SAME_DAY" | "NEXT_DAY" | "WHENEVER_NEEDED";
type StepDraft = { what: string; doerId: string; how: string; tatMode: TatMode; tatValue: string };

function emptyStep(defaultDoerId: string): StepDraft {
  return { what: "", doerId: defaultDoerId, how: "", tatMode: "hours", tatValue: "2" };
}

/** Draft -> the canonical TAT string the backend parses ("30m", "2h", "SAME_DAY", ...). */
function toTatString(s: StepDraft): string {
  if (s.tatMode === "minutes") return `${s.tatValue}m`;
  if (s.tatMode === "hours") return `${s.tatValue}h`;
  return s.tatMode;
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
  const [fields, setFields] = useState<FieldDraft[]>([{ label: "", type: "text" }]);
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep(doers[0]?.id ?? "")]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function updateField(index: number, patch: Partial<FieldDraft>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
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
        // Blank rows are just unused slots the user left behind, not fields.
        fields: fields
          .filter((f) => f.label.trim())
          .map((f) => ({ label: f.label.trim(), type: f.type })),
        steps: steps.map((s) => ({
          what: s.what,
          doerId: s.doerId,
          how: s.how,
          tat: toTatString(s),
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
    "mt-1 min-h-[40px] w-full border border-on-surface bg-surface px-3 py-2 text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface";
  const label = "font-label-sm text-label-sm uppercase text-on-surface-variant";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="w-full max-w-2xl bg-surface-container-lowest border-2 border-on-surface max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md sticky top-0 bg-surface-container-lowest z-10">
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

          {/* The data every run of this template will carry. */}
          <div className="border-2 border-on-surface p-stack-md flex flex-col gap-2">
            <div>
              <span className={label}>Data Fields</span>
              <p className="mt-0.5 font-data-mono text-[10px] text-on-surface-variant uppercase">
                What to fill in each time this runs. The first field names the run.
              </p>
            </div>

            {fields.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                <input
                  value={f.label}
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  placeholder={i === 0 ? "e.g. PO Number (names the run)" : "e.g. Vendor Name"}
                  className={field}
                />
                <select
                  value={f.type}
                  onChange={(e) => updateField(i, { type: e.target.value as WorkflowFieldType })}
                  className={`${field} w-28`}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                </select>
                {fields.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setFields((prev) => prev.filter((_, x) => x !== i))}
                    className="px-2 font-label-sm text-label-sm uppercase text-error"
                  >
                    Remove
                  </button>
                ) : (
                  <span className="px-2" />
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={() => setFields((prev) => [...prev, { label: "", type: "text" }])}
              className="self-start border-2 border-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors"
            >
              + Add Field
            </button>
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
                    onChange={(e) => {
                      const tatMode = e.target.value as TatMode;
                      // Swapping the unit keeps a sane default rather than
                      // carrying "2" from hours into minutes (or vice versa).
                      updateStep(i, {
                        tatMode,
                        ...(tatMode === "minutes" ? { tatValue: "30" } : {}),
                        ...(tatMode === "hours" ? { tatValue: "2" } : {}),
                      });
                    }}
                    className={field}
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="SAME_DAY">Same Day</option>
                    <option value="NEXT_DAY">Next Day</option>
                    <option value="WHENEVER_NEEDED">Whenever Needed</option>
                  </select>
                  {(s.tatMode === "minutes" || s.tatMode === "hours") && (
                    <input
                      required
                      type="number"
                      min={s.tatMode === "minutes" ? "1" : "0.5"}
                      step={s.tatMode === "minutes" ? "5" : "0.5"}
                      value={s.tatValue}
                      onChange={(e) => updateStep(i, { tatValue: e.target.value })}
                      placeholder={s.tatMode === "minutes" ? "TAT in minutes" : "TAT in hours"}
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
              disabled={submitting || doers.length === 0}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-on-surface text-surface border-on-surface hover:opacity-90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating..." : "Create Template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
