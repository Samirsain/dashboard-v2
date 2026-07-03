import { sheetsConfig } from "../config/sheets.config";
import { googleSheetsService, type SheetRecord } from "./googleSheets.service";
import { generateId } from "../utils/id";
import type { Revision } from "../types";

const entity = sheetsConfig.revisions;

function toRevision(record: SheetRecord): Revision {
  return {
    id: record["Revision ID"] ?? "",
    taskId: record["Task ID"] ?? "",
    oldDueDate: record["Old Due Date"] ?? "",
    newDueDate: record["New Due Date"] ?? "",
    reason: record["Reason"] ?? "",
    comment: record["Comment"] ?? "",
    revisedBy: record["Revised By"] ?? "",
    revisedAt: record["Revised At"] ?? "",
  };
}

/**
 * Every revision is appended as its own row and never overwritten or
 * deleted — this is the durable "preserve previous revisions" history,
 * distinct from Task."Revision Date"/"Revision Count" which only track the
 * latest state for quick dashboard filtering.
 */
export const revisionsService = {
  async record(input: {
    taskId: string;
    oldDueDate: string;
    newDueDate: string;
    reason: string;
    comment: string;
    revisedBy: string;
  }): Promise<Revision> {
    const record: SheetRecord = {
      "Revision ID": generateId("REV"),
      "Task ID": input.taskId,
      "Old Due Date": input.oldDueDate,
      "New Due Date": input.newDueDate,
      Reason: input.reason,
      Comment: input.comment,
      "Revised By": input.revisedBy,
      "Revised At": new Date().toISOString(),
    };
    const saved = await googleSheetsService.append(entity, record);
    return toRevision(saved);
  },

  async listByTaskId(taskId: string): Promise<Revision[]> {
    const records = await googleSheetsService.findAll(entity);
    return records
      .map(toRevision)
      .filter((r) => r.taskId === taskId)
      .sort((a, b) => a.revisedAt.localeCompare(b.revisedAt));
  },

  async listAll(): Promise<Revision[]> {
    const records = await googleSheetsService.findAll(entity);
    return records.map(toRevision);
  },
};
