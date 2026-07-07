import { z } from "zod";

const tatSchema = z.string().refine((v) => {
  const t = v.trim().toUpperCase();
  if (["SAME_DAY", "NEXT_DAY", "WHENEVER_NEEDED"].includes(t)) return true;
  return /^(\d+(\.\d+)?)H?$/.test(t);
}, "TAT must be a number of hours (e.g. \"5h\"), or SAME_DAY / NEXT_DAY / WHENEVER_NEEDED");

export const createWorkflowTemplateSchema = z.object({
  name: z.string().min(1),
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
  title: z.string().min(1),
  details: z.string().default(""),
});

export const stepNoParamSchema = z.object({
  id: z.string().min(1),
  stepNo: z.coerce.number().int().min(1),
});

export type CreateWorkflowTemplateInput = z.infer<typeof createWorkflowTemplateSchema>;
export type StartWorkflowInstanceInput = z.infer<typeof startWorkflowInstanceSchema>;
