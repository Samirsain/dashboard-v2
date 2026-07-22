import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const createImsItemSchema = z.object({
  skuCode: z.string().min(1),
  itemName: z.string().min(1),
  category: z.string().min(1),
  avgDailyConsumption: z.number().nonnegative(),
  leadTime: z.number().nonnegative(),
  safetyFactor: z.number().positive(),
  moq: z.number().nonnegative(),
  baseMaxLevel: z.number().nonnegative(),
  materialInTransit: z.number().nonnegative().default(0),
});

export const updateImsItemSchema = z.object({
  itemName: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  avgDailyConsumption: z.number().nonnegative().optional(),
  leadTime: z.number().nonnegative().optional(),
  safetyFactor: z.number().positive().optional(),
  moq: z.number().nonnegative().optional(),
  baseMaxLevel: z.number().nonnegative().optional(),
  materialInTransit: z.number().nonnegative().optional(),
});

export const createImsTransactionSchema = z.object({
  skuCode: z.string().min(1),
  direction: z.enum(["In", "Out"]),
  date: isoDate,
  quantity: z.number().positive(),
});

export type CreateImsItemInput = z.infer<typeof createImsItemSchema>;
export type UpdateImsItemInput = z.infer<typeof updateImsItemSchema>;
export type CreateImsTransactionInput = z.infer<typeof createImsTransactionSchema>;
