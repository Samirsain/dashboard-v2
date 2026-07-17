import { sheetsConfig } from "../config/sheets.config";
import { dataService, type SheetRecord } from "./data.service";
import { generateId } from "../utils/id";
import { canViewAllData } from "../utils/access";
import type { FormConfig, JwtClaims } from "../types";

const entity = sheetsConfig.formConfigs;

function toFormConfig(record: SheetRecord): FormConfig {
  const raw = record["Members"] ?? "";
  return {
    id: record["Form ID"] ?? "",
    name: record["Name"] ?? "",
    spreadsheetId: record["Spreadsheet ID"] ?? "",
    sheetName: record["Sheet Name"] ?? "",
    formLink: record["Form Link"] ?? "",
    memberIds: raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    createdAt: record["CreatedAt"] ?? "",
  };
}

type CreateFormConfigInput = Omit<FormConfig, "id" | "createdAt" | "memberIds"> & {
  memberIds?: string[];
};

export const formConfigService = {
  /**
   * Lists the forms the given user is allowed to see. Admin/Manager/PC see
   * everything; a plain doer only sees forms they've been granted access to.
   */
  async list(opts: { user?: JwtClaims } = {}): Promise<FormConfig[]> {
    const records = await dataService.findAll(entity);
    let forms = records.map(toFormConfig);
    if (opts.user && !canViewAllData(opts.user)) {
      forms = forms.filter((f) => f.memberIds.includes(opts.user!.sub));
    }
    return forms.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async findById(id: string): Promise<FormConfig | null> {
    const record = await dataService.findById(entity, id);
    return record ? toFormConfig(record) : null;
  },

  /** Whether the given user is allowed to view this form's responses. */
  canAccess(form: FormConfig, user?: JwtClaims): boolean {
    if (!user) return false;
    if (canViewAllData(user)) return true;
    return form.memberIds.includes(user.sub);
  },

  async create(input: CreateFormConfigInput): Promise<FormConfig> {
    const record: SheetRecord = {
      "Form ID": generateId("FRM"),
      Name: input.name,
      "Spreadsheet ID": input.spreadsheetId,
      "Sheet Name": input.sheetName,
      "Form Link": input.formLink,
      Members: (input.memberIds ?? []).join(","),
      CreatedAt: new Date().toISOString(),
    };
    const saved = await dataService.append(entity, record);
    return toFormConfig(saved);
  },

  /** Replaces the full member list — who has access to this form's responses. */
  async updateMembers(id: string, memberIds: string[]): Promise<FormConfig> {
    const saved = await dataService.updateById(entity, id, {
      Members: memberIds.join(","),
    });
    return toFormConfig(saved);
  },

  async remove(id: string): Promise<void> {
    await dataService.deleteById(entity, id);
  },
};
