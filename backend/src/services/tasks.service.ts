import { sheetsConfig } from "../config/sheets.config";
import { googleSheetsService, type SheetRecord } from "./googleSheets.service";
import { activityService } from "./activity.service";
import { generateId } from "../utils/id";
import { isBeforeToday, isToday, isWithinNextDays, todayIso } from "../utils/date";
import { AppError } from "../utils/AppError";
import type { Task, TaskPriority, TaskStatus } from "../types";

const entity = sheetsConfig.tasks;

function toTask(record: SheetRecord): Task {
  return {
    id: record["Task ID"] ?? "",
    title: record["Title"] ?? "",
    description: record["Description"] ?? "",
    assignedTo: record["Assigned To"] ?? "",
    priority: (record["Priority"] as TaskPriority) || "Normal",
    dueDate: record["Due Date"] ?? "",
    status: (record["Status"] as TaskStatus) || "Pending",
    revisionDate: record["Revision Date"] ?? "",
    revisionCount: Number(record["Revision Count"] || 0),
    department: record["Department"] ?? "",
    createdBy: record["CreatedBy"] ?? "",
    createdAt: record["CreatedAt"] ?? "",
    updatedAt: record["UpdatedAt"] ?? "",
  };
}

export const tasksService = {
  async list(filters?: {
    assignedTo?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    department?: string;
  }): Promise<Task[]> {
    const records = await googleSheetsService.findAll(entity);
    let tasks = records.map(toTask);

    if (filters?.assignedTo) tasks = tasks.filter((t) => t.assignedTo === filters.assignedTo);
    if (filters?.status) tasks = tasks.filter((t) => t.status === filters.status);
    if (filters?.priority) tasks = tasks.filter((t) => t.priority === filters.priority);
    if (filters?.department) tasks = tasks.filter((t) => t.department === filters.department);

    return tasks;
  },

  async getById(id: string): Promise<Task> {
    const record = await googleSheetsService.findById(entity, id);
    if (!record) throw AppError.notFound(`Task "${id}" not found`);
    return toTask(record);
  },

  async create(input: {
    title: string;
    description: string;
    assignedTo: string;
    priority: TaskPriority;
    dueDate: string;
    department: string;
    createdBy: string;
  }): Promise<Task> {
    const now = new Date().toISOString();
    const record: SheetRecord = {
      "Task ID": generateId("TASK"),
      Title: input.title,
      Description: input.description,
      "Assigned To": input.assignedTo,
      Priority: input.priority,
      "Due Date": input.dueDate,
      Status: "Pending",
      "Revision Date": "",
      "Revision Count": "0",
      Department: input.department,
      CreatedBy: input.createdBy,
      CreatedAt: now,
      UpdatedAt: now,
    };

    const saved = await googleSheetsService.append(entity, record);
    const task = toTask(saved);

    await activityService.log({
      user: input.createdBy,
      action: "Created",
      task: task.title,
      details: { taskId: task.id },
    });

    return task;
  },

  async update(
    id: string,
    updates: Partial<
      Pick<Task, "title" | "description" | "assignedTo" | "priority" | "dueDate" | "status" | "department">
    >,
    actorUserId: string
  ): Promise<Task> {
    const patch: Partial<SheetRecord> = { UpdatedAt: new Date().toISOString() };
    if (updates.title !== undefined) patch["Title"] = updates.title;
    if (updates.description !== undefined) patch["Description"] = updates.description;
    if (updates.assignedTo !== undefined) patch["Assigned To"] = updates.assignedTo;
    if (updates.priority !== undefined) patch["Priority"] = updates.priority;
    if (updates.dueDate !== undefined) patch["Due Date"] = updates.dueDate;
    if (updates.status !== undefined) patch["Status"] = updates.status;
    if (updates.department !== undefined) patch["Department"] = updates.department;

    const saved = await googleSheetsService.updateById(entity, id, patch);
    const task = toTask(saved);

    await activityService.log({
      user: actorUserId,
      action: updates.status ? `Status changed to ${updates.status}` : "Updated",
      task: task.title,
      details: { taskId: task.id, updates },
    });

    return task;
  },

  async remove(id: string, actorUserId: string): Promise<void> {
    const task = await this.getById(id);
    await googleSheetsService.deleteById(entity, id);
    await activityService.log({
      user: actorUserId,
      action: "Deleted",
      task: task.title,
      details: { taskId: id },
    });
  },

  /**
   * Revision workflow: a due date can't be met, so the doer requests a new
   * date with a reason. We keep the old date in the activity log, bump the
   * due date + revision count, and stamp "Revision Date" with today so the
   * dashboard's "Revision Today" card can find it.
   */
  async revise(
    id: string,
    input: { newDueDate: string; reason: string; comment: string },
    actorUserId: string
  ): Promise<Task> {
    const existing = await this.getById(id);
    const oldDueDate = existing.dueDate;
    const today = todayIso();

    const saved = await googleSheetsService.updateById(entity, id, {
      "Due Date": input.newDueDate,
      "Revision Date": today,
      "Revision Count": String(existing.revisionCount + 1),
      UpdatedAt: new Date().toISOString(),
    });
    const task = toTask(saved);

    await activityService.log({
      user: actorUserId,
      action: "Revised",
      task: task.title,
      details: {
        taskId: task.id,
        oldDueDate,
        newDueDate: input.newDueDate,
        reason: input.reason,
        comment: input.comment,
      },
    });

    return task;
  },

  async getOverdue(today = todayIso()): Promise<Task[]> {
    const all = await this.list();
    return all.filter(
      (t) => isBeforeToday(t.dueDate, today) && t.status !== "Completed" && t.status !== "Cancelled"
    );
  },

  async getDueToday(today = todayIso()): Promise<Task[]> {
    const all = await this.list();
    return all.filter((t) => isToday(t.dueDate, today) && t.status !== "Cancelled");
  },

  async getUpcoming(days = 3, today = todayIso()): Promise<Task[]> {
    const all = await this.list();
    return all.filter(
      (t) => isWithinNextDays(t.dueDate, days, today) && t.status !== "Cancelled"
    );
  },

  async getRevisedToday(today = todayIso()): Promise<Task[]> {
    const all = await this.list();
    return all.filter((t) => t.revisionDate === today);
  },
};
