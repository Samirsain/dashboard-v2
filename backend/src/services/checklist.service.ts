import { sheetsConfig } from "../config/sheets.config";
import { dataService, type SheetRecord } from "./data.service";
import { activityService } from "./activity.service";
import { generateId } from "../utils/id";
import { formatTimestamp, shouldGenerateForFrequency, todayIso } from "../utils/date";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import type {
  ChecklistFrequency,
  ChecklistInstance,
  ChecklistInstanceStatus,
  ChecklistTemplate,
  ChecklistTemplateStatus,
  TaskPriority,
} from "../types";

const templatesEntity = sheetsConfig.checklistTemplates;
const instancesEntity = sheetsConfig.checklistInstances;

function toTemplate(record: SheetRecord): ChecklistTemplate {
  return {
    id: record["Template ID"] ?? "",
    taskName: record["Task Name"] ?? "",
    description: record["Description"] ?? "",
    frequency: (record["Frequency"] as ChecklistFrequency) || "Daily",
    frequencyValue: record["FrequencyValue"] ?? "",
    assignedDoerId: record["Assigned Doer ID"] ?? "",
    department: record["Department"] ?? "",
    priority: (record["Priority"] as TaskPriority) || "Normal",
    status: (record["Status"] as ChecklistTemplateStatus) || "Active",
    createdAt: record["CreatedAt"] ?? "",
  };
}

function toInstance(record: SheetRecord): ChecklistInstance {
  return {
    id: record["Instance ID"] ?? "",
    templateId: record["Template ID"] ?? "",
    taskName: record["Task Name"] ?? "",
    date: record["Date"] ?? "",
    assignedDoerId: record["Assigned Doer ID"] ?? "",
    status: (record["Status"] as ChecklistInstanceStatus) || "Pending",
    completedBy: record["CompletedBy"] ?? "",
    completedAt: record["CompletedAt"] ?? "",
  };
}

export const checklistService = {
  // ---- Templates -------------------------------------------------------

  async listTemplates(): Promise<ChecklistTemplate[]> {
    const records = await dataService.findAll(templatesEntity);
    return records.map(toTemplate);
  },

  async getTemplateById(id: string): Promise<ChecklistTemplate> {
    const record = await dataService.findById(templatesEntity, id);
    if (!record) throw AppError.notFound(`Checklist template "${id}" not found`);
    return toTemplate(record);
  },

  async createTemplate(input: {
    taskName: string;
    description: string;
    frequency: ChecklistFrequency;
    frequencyValue: string;
    assignedDoerId: string;
    department: string;
    priority: TaskPriority;
    status: ChecklistTemplateStatus;
  }): Promise<ChecklistTemplate> {
    const record: SheetRecord = {
      "Template ID": generateId("TPL"),
      "Task Name": input.taskName,
      Description: input.description,
      Frequency: input.frequency,
      FrequencyValue: input.frequencyValue,
      "Assigned Doer ID": input.assignedDoerId,
      Department: input.department,
      Priority: input.priority,
      Status: input.status,
      CreatedAt: todayIso(),
    };
    const saved = await dataService.append(templatesEntity, record);
    return toTemplate(saved);
  },

  async updateTemplate(
    id: string,
    updates: Partial<
      Pick<
        ChecklistTemplate,
        | "taskName"
        | "description"
        | "frequency"
        | "frequencyValue"
        | "assignedDoerId"
        | "department"
        | "priority"
        | "status"
      >
    >
  ): Promise<ChecklistTemplate> {
    const patch: Partial<SheetRecord> = {};
    if (updates.taskName !== undefined) patch["Task Name"] = updates.taskName;
    if (updates.description !== undefined) patch["Description"] = updates.description;
    if (updates.frequency !== undefined) patch["Frequency"] = updates.frequency;
    if (updates.frequencyValue !== undefined) patch["FrequencyValue"] = updates.frequencyValue;
    if (updates.assignedDoerId !== undefined) patch["Assigned Doer ID"] = updates.assignedDoerId;
    if (updates.department !== undefined) patch["Department"] = updates.department;
    if (updates.priority !== undefined) patch["Priority"] = updates.priority;
    if (updates.status !== undefined) patch["Status"] = updates.status;

    const saved = await dataService.updateById(templatesEntity, id, patch);
    return toTemplate(saved);
  },

  async removeTemplate(id: string): Promise<void> {
    await dataService.deleteById(templatesEntity, id);
  },

  // ---- Instances ---------------------------------------------------------

  async listInstances(filters?: {
    date?: string;
    status?: ChecklistInstanceStatus;
    assignedDoerId?: string;
  }): Promise<ChecklistInstance[]> {
    const records = await dataService.findAll(instancesEntity);
    let instances = records.map(toInstance);

    if (filters?.date) instances = instances.filter((i) => i.date === filters.date);
    if (filters?.status) instances = instances.filter((i) => i.status === filters.status);
    if (filters?.assignedDoerId) instances = instances.filter((i) => i.assignedDoerId === filters.assignedDoerId);

    return instances;
  },

  async listToday(today = todayIso()): Promise<ChecklistInstance[]> {
    try {
      await this.generateInstancesForDate();
    } catch (err) {
      logger.error({ err }, "Auto-generation of checklist instances in listToday failed");
    }
    return this.listInstances({ date: today });
  },

  async completeInstance(id: string, completedBy: string): Promise<ChecklistInstance> {
    const saved = await dataService.updateById(instancesEntity, id, {
      Status: "Completed" as ChecklistInstanceStatus,
      CompletedBy: completedBy,
      CompletedAt: new Date().toISOString(),
    });
    const instance = toInstance(saved);

    await activityService.log({
      user: completedBy,
      action: "Completed checklist item",
      task: instance.taskName,
      detail: `Checklist item completed`,
    });

    return instance;
  },

  /**
   * Runs the recurring-checklist algorithm for `date`: for every active
   * template whose frequency matches `date`, ensure exactly one instance
   * exists for that (template, date) pair. Safe to call multiple times for
   * the same day — already-generated instances are skipped.
   */
  async generateInstancesForDate(date: Date = new Date()): Promise<ChecklistInstance[]> {
    const dateIso = todayIso(date);
    const [templates, existingToday] = await Promise.all([
      this.listTemplates(),
      this.listInstances({ date: dateIso }),
    ]);

    const existingTemplateIds = new Set(existingToday.map((i) => i.templateId));
    const created: ChecklistInstance[] = [];

    for (const template of templates) {
      if (template.status !== "Active") continue;
      if (existingTemplateIds.has(template.id)) continue;
      if (!shouldGenerateForFrequency(template.frequency, template.frequencyValue, date)) continue;

      const record: SheetRecord = {
        "Instance ID": generateId("CHK"),
        "Template ID": template.id,
        "Task Name": template.taskName,
        Date: dateIso,
        "Assigned Doer ID": template.assignedDoerId,
        Status: "Pending",
        CompletedBy: "",
        CompletedAt: "",
      };

      const saved = await dataService.append(instancesEntity, record);
      created.push(toInstance(saved));
    }

    logger.info(
      { date: dateIso, generated: created.length, templatesChecked: templates.length },
      "Checklist generation run complete"
    );

    return created;
  },
};
