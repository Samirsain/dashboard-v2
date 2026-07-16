import { z } from "zod";

export const createFormConfigSchema = z.object({
  name: z.string().min(1, "Name is required"),
  spreadsheetId: z.string().min(1, "Spreadsheet ID is required"),
  sheetName: z.string().min(1, "Sheet/tab name is required"),
});

export type CreateFormConfigInput = z.infer<typeof createFormConfigSchema>;
