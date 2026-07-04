import { sheetsConfig } from "../config/sheets.config";
import { googleSheetsService, type SheetRecord } from "./googleSheets.service";
import { activityService } from "./activity.service";
import { revisionsService } from "./revisions.service";
import { usersService } from "./users.service";
import { generateUuid } from "../utils/id";
import { isBeforeToday, isToday, isWithinNextDays, todayIso } from "../utils/date";
import { AppError } from "../utils/AppError";
import type { DoerSummary, Task, TaskPriority, TaskStatus, TaskWithDoer, User } from "../types";

const entity = sheetsConfig.tasks;

function toTask(record: SheetRecord): Task {
  return {
    id: record["Task ID"] ?? "",
    title: record["Title"] ?? "",
    description: record["Description"] ?? "",
    assignedDoerId: record["Assigned Doer ID"] ?? "",
    priority: (record["Priority"] as TaskPriority) || "Normal",
    dueDate: record["Due Date"] ?? "",
    status: (record["Status"] as TaskStatus) || "Pending",
    revisionDate: record["Revision Date"] ?? "",
    revisionCount: Number(record["Revision Count"] || 0),
    department: record["Department"] ?? "",
    createdBy: record["CreatedBy"] ?? "",
    createdAt: record["CreatedAt"] ?? "",
    updatedAt: record["UpdatedAt"] ?? "",
    repeatType: (record["Repeat Type"] as any) || "None",
    repeatValue: record["Repeat Value"] ?? "",
  };
}

function toDoerSummary(user: User): DoerSummary {
  return {
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    department: user.department,
    role: user.role,
  };
}

async function assertDoerExists(doerId: string): Promise<void> {
  const exists = await usersService.exists(doerId);
  if (!exists) {
    throw AppError.badRequest(
      `Assigned Doer ID "${doerId}" does not exist in DOERLIST`,
      "INVALID_DOER_ID"
    );
  }
}

export const tasksService = {
  /** Plain TASKLIST rows, no DOERLIST join — used internally for filtering/aggregation. */
  async listRaw(filters?: {
    assignedDoerId?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    department?: string;
  }): Promise<Task[]> {
    const records = await googleSheetsService.findAll(entity);
    let tasks = records.map(toTask);

    if (filters?.assignedDoerId)
      tasks = tasks.filter((t) => t.assignedDoerId === filters.assignedDoerId);
    if (filters?.status) tasks = tasks.filter((t) => t.status === filters.status);
    if (filters?.priority) tasks = tasks.filter((t) => t.priority === filters.priority);
    if (filters?.department) tasks = tasks.filter((t) => t.department === filters.department);

    return tasks;
  },

  /** TASKLIST joined with DOERLIST — what the public task-listing endpoints return. */
  async list(filters?: {
    assignedDoerId?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    department?: string;
  }): Promise<TaskWithDoer[]> {
    const [tasks, doers] = await Promise.all([this.listRaw(filters), usersService.list()]);
    const doerMap = new Map(doers.map((d) => [d.id, d]));

    return tasks.map((task) => ({
      ...task,
      doer: doerMap.has(task.assignedDoerId) ? toDoerSummary(doerMap.get(task.assignedDoerId)!) : null,
    }));
  },

  async getById(id: string): Promise<TaskWithDoer> {
    const record = await googleSheetsService.findById(entity, id);
    if (!record) throw AppError.notFound(`Task "${id}" not found`);
    const task = toTask(record);

    let doer: DoerSummary | null = null;
    if (task.assignedDoerId) {
      const user = await usersService.getById(task.assignedDoerId).catch(() => null);
      doer = user ? toDoerSummary(user) : null;
    }

    return { ...task, doer };
  },

  async create(input: {
    title: string;
    description: string;
    assignedDoerId: string;
    priority: TaskPriority;
    dueDate: string;
    department: string;
    createdBy: string;
    repeatType?: string;
    repeatValue?: string;
  }): Promise<Task> {
    await assertDoerExists(input.assignedDoerId);

    const now = new Date().toISOString();
    const record: SheetRecord = {
      "Task ID": generateUuid(),
      Title: input.title,
      Description: input.description,
      "Assigned Doer ID": input.assignedDoerId,
      Priority: input.priority,
      "Due Date": input.dueDate,
      Status: "Pending",
      "Revision Date": "",
      "Revision Count": "0",
      Department: input.department,
      CreatedBy: input.createdBy,
      CreatedAt: now,
      UpdatedAt: now,
      "Repeat Type": input.repeatType || "None",
      "Repeat Value": input.repeatValue || "",
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
      Pick<
        Task,
        "title" | "description" | "assignedDoerId" | "priority" | "dueDate" | "status" | "department" | "repeatType" | "repeatValue"
      >
    >,
    actorUserId: string
  ): Promise<Task> {
    if (updates.assignedDoerId !== undefined) {
      await assertDoerExists(updates.assignedDoerId);
    }

    const patch: Partial<SheetRecord> = { UpdatedAt: new Date().toISOString() };
    if (updates.title !== undefined) patch["Title"] = updates.title;
    if (updates.description !== undefined) patch["Description"] = updates.description;
    if (updates.assignedDoerId !== undefined) patch["Assigned Doer ID"] = updates.assignedDoerId;
    if (updates.priority !== undefined) patch["Priority"] = updates.priority;
    if (updates.dueDate !== undefined) patch["Due Date"] = updates.dueDate;
    if (updates.status !== undefined) patch["Status"] = updates.status;
    if (updates.department !== undefined) patch["Department"] = updates.department;
    if (updates.repeatType !== undefined) patch["Repeat Type"] = updates.repeatType;
    if (updates.repeatValue !== undefined) patch["Repeat Value"] = updates.repeatValue;

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
   * date with a reason. The full old→new record is appended to the
   * Revisions sheet (never overwritten), and the task's own "Revision
   * Date"/"Revision Count" are bumped so dashboard filtering stays O(1)
   * without needing to scan history.
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

    await Promise.all([
      revisionsService.record({
        taskId: task.id,
        oldDueDate,
        newDueDate: input.newDueDate,
        reason: input.reason,
        comment: input.comment,
        revisedBy: actorUserId,
      }),
      activityService.log({
        user: actorUserId,
        action: "Revised",
        task: task.title,
        details: { taskId: task.id, oldDueDate, newDueDate: input.newDueDate, reason: input.reason },
      }),
    ]);

    return task;
  },

  async getRevisionHistory(id: string) {
    await this.getById(id); // 404s if the task doesn't exist
    return revisionsService.listByTaskId(id);
  },

  async getOverdue(today = todayIso()): Promise<Task[]> {
    const all = await this.listRaw();
    return all.filter(
      (t) => isBeforeToday(t.dueDate, today) && t.status !== "Completed" && t.status !== "Cancelled"
    );
  },

  async getDueToday(today = todayIso()): Promise<Task[]> {
    const all = await this.listRaw();
    return all.filter((t) => isToday(t.dueDate, today) && t.status !== "Cancelled");
  },

  async getUpcoming(days = 3, today = todayIso()): Promise<Task[]> {
    const all = await this.listRaw();
    return all.filter(
      (t) => isWithinNextDays(t.dueDate, days, today) && t.status !== "Cancelled"
    );
  },

  async getRevisedToday(today = todayIso()): Promise<Task[]> {
    const all = await this.listRaw();
    return all.filter((t) => t.revisionDate === today);
  },
};
