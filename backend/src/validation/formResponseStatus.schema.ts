import { z } from "zod";

export const setFormResponseStatusSchema = z.object({
  // Empty string clears the status back to "no status set".
  status: z.enum(["", "Working", "Complete"]),
});

export type SetFormResponseStatusInput = z.infer<typeof setFormResponseStatusSchema>;

export const rowParamSchema = z.object({
  id: z.string().min(1),
  row: z.string().regex(/^\d+$/, "row must be a positive integer"),
});
