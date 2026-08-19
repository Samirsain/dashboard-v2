"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type {
  Doer,
  WorkflowFieldType,
  WorkflowStep,
  WorkflowTemplate,
  WorkflowTemplateField,
} from "@/lib/types";

type FieldDraft = { label: string; type: WorkflowFieldType };

type TatMode = "minutes" | "hours" | "SAME_DAY" | "NEXT_DAY" | "WHENEVER_NEEDED";
type StepDraft = { what: string; doerId: string; how: string; tatMode: TatMode; tatValue: string };

/** A template already loaded with its steps and fields, as GET /workflow/templates/:id returns it. */
type EditableTemplate = WorkflowTemplate & { steps: WorkflowStep[]; fields: WorkflowTemplateField[] };

function emptyStep(defaultDoerId: string): StepDraft {
  return { what: "", doerId: defaultDoerId, how: "", tatMode: "hours", tatValue: "2" };
}

/** Draft -> the canonical TAT string the backend parses ("30m", "2h", "SAME_DAY", ...). */
function toTatString(s: StepDraft): string {
  if (s.tatMode === "minutes") return `${s.tatValue}m`;
  if (s.tatMode === "hours") return `${s.tatValue}h`;
  return s.tatMode;
}

/** The inverse of toTatString, for loading an existing step's TAT back into the form. */
function parseTat(tat: string): { tatMode: TatMode; tatValue: string } {
  const t = tat.trim();
  const upper = t.toUpperCase();
  if (upper === "SAME_DAY" || upper === "NEXT_DAY" || upper === "WHENEVER_NEEDED") {
    return { tatMode: upper, tatValue: "" };
  }
  const minutes = t.match(/^(\d+(?:\.\d+)?)m$/i);
  if (minutes) return { tatMode: "minutes", tatValue: minutes[1]! };
  const hours = t.match(/^(\d+(?:\.\d+)?)h?$/i);
  if (hours) return { tatMode: "hours", tatValue: hours[1]! };
  return { tatMode: "hours", tatValue: "2" };
}

export default function CreateWorkflowTemplateModal({
  doers,
  template,
  onClose,
  onCreated,
}: {
  doers: Doer[];
  /** Editing an existing template instead of creating a new one. */
  template?: EditableTemplate;
  onClose: () => void;
  onCreated: (template: WorkflowTemplate) => void;
}) {
  const isEditing = !!template;
  const [name, setName] = useState(template?.name ?? "");
  const [fields, setFields] = useState<FieldDraft[]>(
    template && template.fields.length > 0
      ? template.fields.map((f) => ({ label: f.label, type: f.type }))
      : [{ label: "", type: "text" }]
  );
  const [steps, setSteps] = useState<StepDraft[]>(
    template && template.steps.length > 0
      ? template.steps.map((s) => ({
          what: s.what,
          doerId: s.doerId,
          how: s.how,
          ...parseTat(s.tat),
        }))
      : [emptyStep(doers[0]?.id ?? "")]
  );
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
      const body = {
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
      };
      // Editing replaces the whole step chain — runs already in progress keep
      // their own copied steps, so this only shapes runs started from now on.
      const saved = isEditing
        ? await api.patch<WorkflowTemplate>(`/workflow/templates/${template!.id}`, body)
        : await api.post<WorkflowTemplate>("/workflow/templates", body);
      onCreated(saved);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Failed to ${isEditing ? "save" : "create"} this workflow template.`
      );
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
            {isEditing ? "Edit Workflow Template" : "Create Workflow Template"}
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
          {isEditing && (
            <p className="font-data-mono text-[10px] text-on-surface-variant uppercase border-2 border-on-surface px-3 py-2">
              Work already in progress keeps its own steps as they were — this
              only shapes runs started after you save.
            </p>
          )}
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
                  placeholder={i === 0 ? "First field — this names each run" : "Another detail to record"}
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
              {submitting ? "Saving..." : isEditing ? "Save Changes" : "Create Template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
