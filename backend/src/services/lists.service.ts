import { sheetsConfig } from "../config/sheets.config";
import { dataService, type SheetRecord } from "./data.service";
import { generateId } from "../utils/id";
import { todayIso } from "../utils/date";
import { AppError } from "../utils/AppError";
import type { List, ListType } from "../types";

const entity = sheetsConfig.lists;

function toList(record: SheetRecord): List {
  return {
    id: record["List ID"] ?? "",
    name: record["Name"] ?? "",
    type: (record["Type"] as ListType) || "task",
    createdAt: record["CreatedAt"] ?? "",
  };
}

export const listsService = {
  async list(type?: ListType): Promise<List[]> {
    const records = await dataService.findAll(entity);
    let lists = records.map(toList);
    if (type) lists = lists.filter((l) => l.type === type);
    return lists.sort((a, b) => a.name.localeCompare(b.name));
  },

  async getById(id: string): Promise<List> {
    const record = await dataService.findById(entity, id);
    if (!record) throw AppError.notFound(`List "${id}" not found`);
    return toList(record);
  },

  async create(input: { name: string; type: ListType }): Promise<List> {
    const record: SheetRecord = {
      "List ID": generateId("LIST"),
      Name: input.name,
      Type: input.type,
      CreatedAt: todayIso(),
    };
    const saved = await dataService.append(entity, record);
    return toList(saved);
  },

  async remove(id: string): Promise<void> {
    await dataService.deleteById(entity, id);
  },
};
