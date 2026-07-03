import { sheetsConfig } from "../config/sheets.config";
import { googleSheetsService, type SheetRecord } from "./googleSheets.service";
import { generateId } from "../utils/id";
import { todayIso } from "../utils/date";
import type { ActivityLog } from "../types";

const entity = sheetsConfig.activityLogs;

function toActivityLog(record: SheetRecord): ActivityLog {
  return {
    id: record["Log ID"] ?? "",
    user: record["User"] ?? "",
    action: record["Action"] ?? "",
    task: record["Task"] ?? "",
    date: record["Date"] ?? "",
    time: record["Time"] ?? "",
    details: record["Details"] ?? "",
  };
}

export const activityService = {
  async log(input: {
    user: string;
    action: string;
    task: string;
    details?: Record<string, unknown>;
  }): Promise<ActivityLog> {
    const now = new Date();
    const record: SheetRecord = {
      "Log ID": generateId("LOG"),
      User: input.user,
      Action: input.action,
      Task: input.task,
      Date: todayIso(now),
      Time: now.toTimeString().slice(0, 8),
      Details: input.details ? JSON.stringify(input.details) : "",
    };
    const saved = await googleSheetsService.append(entity, record);
    return toActivityLog(saved);
  },

  async list(): Promise<ActivityLog[]> {
    const records = await googleSheetsService.findAll(entity);
    return records
      .map(toActivityLog)
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  },

  async listToday(today = todayIso()): Promise<ActivityLog[]> {
    const all = await this.list();
    return all.filter((log) => log.date === today);
  },
};
