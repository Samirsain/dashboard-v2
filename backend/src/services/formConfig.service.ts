import { sheetsConfig } from "../config/sheets.config";
import { dataService, type SheetRecord } from "./data.service";
import { generateId } from "../utils/id";
import type { FormConfig } from "../types";

const entity = sheetsConfig.formConfigs;

function toFormConfig(record: SheetRecord): FormConfig {
  return {
    id: record["Form ID"] ?? "",
    name: record["Name"] ?? "",
    spreadsheetId: record["Spreadsheet ID"] ?? "",
    sheetName: record["Sheet Name"] ?? "",
    formLink: record["Form Link"] ?? "",
    createdAt: record["CreatedAt"] ?? "",
  };
}

type CreateFormConfigInput = Omit<FormConfig, "id" | "createdAt">;

export const formConfigService = {
  async list(): Promise<FormConfig[]> {
    const records = await dataService.findAll(entity);
    return records.map(toFormConfig).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async findById(id: string): Promise<FormConfig | null> {
    const record = await dataService.findById(entity, id);
    return record ? toFormConfig(record) : null;
  },

  async create(input: CreateFormConfigInput): Promise<FormConfig> {
    const record: SheetRecord = {
      "Form ID": generateId("FRM"),
      Name: input.name,
      "Spreadsheet ID": input.spreadsheetId,
      "Sheet Name": input.sheetName,
      "Form Link": input.formLink,
      CreatedAt: new Date().toISOString(),
    };
    const saved = await dataService.append(entity, record);
    return toFormConfig(saved);
  },

  async remove(id: string): Promise<void> {
    await dataService.deleteById(entity, id);
  },
};
