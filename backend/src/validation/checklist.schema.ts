import { z } from "zod";

export const createChecklistTemplateSchema = z
  .object({
    taskName: z.string().min(1),
    description: z.string().default(""),
    frequency: z.enum(["Daily", "Weekly", "Monthly", "Quarterly", "HalfYearly", "Yearly"]),
    frequencyValue: z.string().default(""),
    assignedTo: z.string().min(1, "assignedTo (user ID) is required"),
    department: z.string().default(""),
    priority: z.enum(["Low", "Normal", "Urgent", "Critical"]).default("Normal"),
    status: z.enum(["Active", "Inactive"]).default("Active"),
  })
  .superRefine((val, ctx) => {
    if (val.frequency === "Weekly" && !val.frequencyValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["frequencyValue"],
        message: "Weekly templates require a weekday in frequencyValue (e.g. 'Monday')",
      });
    }
    if (val.frequency === "Monthly" && !/^\d{1,2}$/.test(val.frequencyValue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["frequencyValue"],
        message: "Monthly templates require a day-of-month in frequencyValue (e.g. '15')",
      });
    }
    if (
      ["Quarterly", "HalfYearly", "Yearly"].includes(val.frequency) &&
      !/^\d{2}-\d{2}(,\d{2}-\d{2})*$/.test(val.frequencyValue)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["frequencyValue"],
        message:
          "Quarterly/HalfYearly/Yearly templates require comma separated MM-DD anchors (e.g. '01-01,07-01')",
      });
    }
  });

export const updateChecklistTemplateSchema = z.object({
  taskName: z.string().min(1).optional(),
  description: z.string().optional(),
  frequency: z
    .enum(["Daily", "Weekly", "Monthly", "Quarterly", "HalfYearly", "Yearly"])
    .optional(),
  frequencyValue: z.string().optional(),
  assignedTo: z.string().min(1).optional(),
  department: z.string().optional(),
  priority: z.enum(["Low", "Normal", "Urgent", "Critical"]).optional(),
  status: z.enum(["Active", "Inactive"]).optional(),
});

export const completeChecklistInstanceSchema = z.object({
  completedBy: z.string().min(1, "completedBy (user ID) is required"),
});

export type CreateChecklistTemplateInput = z.infer<typeof createChecklistTemplateSchema>;
export type UpdateChecklistTemplateInput = z.infer<typeof updateChecklistTemplateSchema>;
