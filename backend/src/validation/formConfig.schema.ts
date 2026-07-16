import { z } from "zod";

export const createFormConfigSchema = z.object({
  name: z.string().min(1, "Name is required"),
  spreadsheetId: z.string().min(1, "Spreadsheet ID is required"),
  // Optional — blank means "use the spreadsheet's first tab".
  sheetName: z.string().default(""),
});

export type CreateFormConfigInput = z.infer<typeof createFormConfigSchema>;
