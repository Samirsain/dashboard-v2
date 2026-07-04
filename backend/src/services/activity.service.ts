import { sheetsConfig } from "../config/sheets.config";
import { googleSheetsService, type SheetRecord } from "./googleSheets.service";
import { usersService } from "./users.service";
import { generateId } from "../utils/id";
import { formatTime, todayIso } from "../utils/date";
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

/** Turns an actor's user ID into a readable name for the log's User column. */
async function actorName(actorId: string): Promise<string> {
  if (!actorId || actorId === "system") return "System";
  const user = await usersService.getById(actorId).catch(() => null);
  return user?.name || actorId;
}

export const activityService = {
  /**
   * Appends a human-readable activity row. `actorId` is a Doer ID (or
   * "system"); it's resolved to a name for the sheet. `detail` should be a
   * plain sentence — no JSON blobs — so the ACTIVITY_LOGS tab reads like a
   * timeline anyone can follow.
   */
  async log(input: {
    user: string; // actor's Doer ID (or "system")
    action: string;
    task: string;
    detail?: string;
  }): Promise<ActivityLog> {
    const now = new Date();
    const record: SheetRecord = {
      "Log ID": generateId("LOG"),
      User: await actorName(input.user),
      Action: input.action,
      Task: input.task,
      Date: todayIso(now),
      Time: formatTime(now),
      Details: input.detail ?? "",
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
