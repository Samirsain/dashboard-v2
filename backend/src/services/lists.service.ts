import { sheetsConfig } from "../config/sheets.config";
import { dataService, type SheetRecord } from "./data.service";
import { generateId } from "../utils/id";
import { todayIso } from "../utils/date";
import { AppError } from "../utils/AppError";
import { canViewAllData } from "../utils/access";
import type { JwtClaims, List, ListType } from "../types";

const entity = sheetsConfig.lists;

function toList(record: SheetRecord): List {
  const raw = record["Members"] ?? "";
  return {
    id: record["List ID"] ?? "",
    name: record["Name"] ?? "",
    type: (record["Type"] as ListType) || "task",
    memberIds: raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    createdAt: record["CreatedAt"] ?? "",
  };
}

export const listsService = {
  /**
   * Lists the given user is allowed to see. Admin sees everything;
   * a plain doer only sees lists they're a member of. `type` narrows to Task
   * Lists or Checklists.
   */
  async list(opts: { type?: ListType; user?: JwtClaims } = {}): Promise<List[]> {
    const records = await dataService.findAll(entity);
    let lists = records.map(toList);
    if (opts.type) lists = lists.filter((l) => l.type === opts.type);
    if (opts.user && !canViewAllData(opts.user)) {
      lists = lists.filter((l) => l.memberIds.includes(opts.user!.sub));
    }
    return lists.sort((a, b) => a.name.localeCompare(b.name));
  },

  async getById(id: string): Promise<List> {
    const record = await dataService.findById(entity, id);
    if (!record) throw AppError.notFound(`List "${id}" not found`);
    return toList(record);
  },

  async create(input: { name: string; type: ListType; memberIds?: string[] }): Promise<List> {
    const record: SheetRecord = {
      "List ID": generateId("LIST"),
      Name: input.name,
      Type: input.type,
      Members: (input.memberIds ?? []).join(","),
      CreatedAt: todayIso(),
    };
    const saved = await dataService.append(entity, record);
    return toList(saved);
  },

  /** Replaces the full member list — the admin's "who can access this list" control. */
  async updateMembers(id: string, memberIds: string[]): Promise<List> {
    const saved = await dataService.updateById(entity, id, {
      Members: memberIds.join(","),
    });
    return toList(saved);
  },

  async remove(id: string): Promise<void> {
    await dataService.deleteById(entity, id);
  },
};
