import { sheetsConfig } from "../config/sheets.config";
import { dataService, type SheetRecord } from "./data.service";
import { generateId } from "../utils/id";
import type { MasterSheetRow } from "../types";

const entity = sheetsConfig.masterSheets;

function toRow(record: SheetRecord): MasterSheetRow {
  return {
    id: record["Master ID"] ?? "",
    code: record["Code"] ?? "",
    name: record["Name"] ?? "",
    type: record["Type"] ?? "",
    description: record["Description"] ?? "",
    date: record["Date"] ?? "",
    videos: record["Videos"] ?? "",
    pc: record["PC"] ?? "",
    ps: record["PS"] ?? "",
    access: record["Access"] ?? "",
    link: record["Link"] ?? "",
    threePercent: record["3%"] ?? "",
    createdAt: record["CreatedAt"] ?? "",
  };
}

type MasterSheetInput = Omit<MasterSheetRow, "id" | "createdAt">;

export const masterSheetService = {
  async list(): Promise<MasterSheetRow[]> {
    const records = await dataService.findAll(entity);
    // Stable order: oldest first, so newly added rows land at the bottom.
    return records.map(toRow).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async create(input: MasterSheetInput): Promise<MasterSheetRow> {
    const record: SheetRecord = {
      "Master ID": generateId("MSR"),
      Code: input.code,
      Name: input.name,
      Type: input.type,
      Description: input.description,
      Date: input.date,
      Videos: input.videos,
      PC: input.pc,
      PS: input.ps,
      Access: input.access,
      Link: input.link,
      "3%": input.threePercent ?? "",
      CreatedAt: new Date().toISOString(),
    };
    const saved = await dataService.append(entity, record);
    return toRow(saved);
  },

  async update(id: string, updates: Partial<MasterSheetInput>): Promise<MasterSheetRow> {
    const patch: Partial<SheetRecord> = {};
    if (updates.code !== undefined) patch["Code"] = updates.code;
    if (updates.name !== undefined) patch["Name"] = updates.name;
    if (updates.type !== undefined) patch["Type"] = updates.type;
    if (updates.description !== undefined) patch["Description"] = updates.description;
    if (updates.date !== undefined) patch["Date"] = updates.date;
    if (updates.videos !== undefined) patch["Videos"] = updates.videos;
    if (updates.pc !== undefined) patch["PC"] = updates.pc;
    if (updates.ps !== undefined) patch["PS"] = updates.ps;
    if (updates.access !== undefined) patch["Access"] = updates.access;
    if (updates.link !== undefined) patch["Link"] = updates.link;
    if (updates.threePercent !== undefined) patch["3%"] = updates.threePercent;

    const saved = await dataService.updateById(entity, id, patch);
    return toRow(saved);
  },

  async remove(id: string): Promise<void> {
    await dataService.deleteById(entity, id);
  },
};
