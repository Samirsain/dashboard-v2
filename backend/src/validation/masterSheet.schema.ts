import { z } from "zod";

// Every field is free-form and optional-with-default — the Master Sheet is a
// documentation grid the admin fills in gradually, so a half-filled row is fine.
const fields = {
  code: z.string().default(""),
  name: z.string().default(""),
  type: z.string().default(""),
  description: z.string().default(""),
  date: z.string().default(""),
  videos: z.string().default(""),
  pc: z.string().default(""),
  ps: z.string().default(""),
  access: z.string().default(""),
  link: z.string().default(""),
};

export const createMasterSheetSchema = z.object(fields);

export const updateMasterSheetSchema = z.object({
  code: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  date: z.string().optional(),
  videos: z.string().optional(),
  pc: z.string().optional(),
  ps: z.string().optional(),
  access: z.string().optional(),
  link: z.string().optional(),
});

export type CreateMasterSheetInput = z.infer<typeof createMasterSheetSchema>;
export type UpdateMasterSheetInput = z.infer<typeof updateMasterSheetSchema>;
