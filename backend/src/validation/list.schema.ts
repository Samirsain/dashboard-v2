import { z } from "zod";

export const createListSchema = z.object({
  name: z.string().min(1, "List name is required"),
  type: z.enum(["task", "checklist"]),
  memberIds: z.array(z.string()).optional(),
});

export const updateListMembersSchema = z.object({
  memberIds: z.array(z.string()),
});

export type CreateListInput = z.infer<typeof createListSchema>;
export type UpdateListMembersInput = z.infer<typeof updateListMembersSchema>;
