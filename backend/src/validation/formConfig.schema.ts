import { z } from "zod";

export const createFormConfigSchema = z.object({
  name: z.string().min(1, "Name is required"),
  spreadsheetId: z.string().min(1, "Spreadsheet ID is required"),
  // Optional — blank means "use the spreadsheet's first tab".
  sheetName: z.string().default(""),
  // Optional — the shareable Google Form URL, for copying/sending.
  formLink: z.string().default(""),
  // Optional — doer IDs granted access; blank = only Admin can see it.
  memberIds: z.array(z.string()).optional(),
});

export const updateFormMembersSchema = z.object({
  memberIds: z.array(z.string()),
});

export type CreateFormConfigInput = z.infer<typeof createFormConfigSchema>;
export type UpdateFormMembersInput = z.infer<typeof updateFormMembersSchema>;
