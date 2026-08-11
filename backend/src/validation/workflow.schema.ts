import { z } from "zod";

const tatSchema = z.string().refine((v) => {
  const t = v.trim().toUpperCase();
  if (["SAME_DAY", "NEXT_DAY", "WHENEVER_NEEDED"].includes(t)) return true;
  return /^(\d+(\.\d+)?)\s*[HM]?$/.test(t);
}, "TAT must be minutes (e.g. \"30m\") or hours (e.g. \"5h\"), or SAME_DAY / NEXT_DAY / WHENEVER_NEEDED");

export const createWorkflowTemplateSchema = z.object({
  name: z.string().min(1),
  // The data each run of this template carries, defined per template.
  // Optional — a template can have no fields and just be named per run.
  fields: z
    .array(
      z.object({
        label: z.string().min(1),
        type: z.enum(["text", "number", "date"]).default("text"),
      })
    )
    .default([]),
  steps: z
    .array(
      z.object({
        what: z.string().min(1),
        doerId: z.string().min(1),
        how: z.string().default(""),
        tat: tatSchema,
      })
    )
    .min(1, "At least one step is required"),
});

export const startWorkflowInstanceSchema = z.object({
  templateId: z.string().min(1),
  // Only used by templates with no fields — otherwise the first field names
  // the run, so there's nothing for the user to type twice.
  title: z.string().optional(),
  details: z.string().default(""),
  /** Values for the template's fields, in the template's field order. */
  fieldValues: z.array(z.string()).default([]),
  /** For "Whenever Needed" steps: target date (YYYY-MM-DD) keyed by step number. */
  stepDeadlines: z.record(z.string(), z.string()).default({}),
});

export const stepNoParamSchema = z.object({
  id: z.string().min(1),
  stepNo: z.coerce.number().int().min(1),
});

export type CreateWorkflowTemplateInput = z.infer<typeof createWorkflowTemplateSchema>;
export type StartWorkflowInstanceInput = z.infer<typeof startWorkflowInstanceSchema>;
