import { z } from "zod";

export const createListSchema = z.object({
  name: z.string().min(1, "List name is required"),
  type: z.enum(["task", "checklist"]),
});

export type CreateListInput = z.infer<typeof createListSchema>;
