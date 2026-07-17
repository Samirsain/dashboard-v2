import { sheetsConfig } from "../config/sheets.config";
import { dataService, type SheetRecord } from "./data.service";
import type { FormResponseStatus, FormResponseStatusValue } from "../types";

const entity = sheetsConfig.formResponseStatuses;

function statusId(formId: string, row: number): string {
  return `${formId}::${row}`;
}

function toStatus(record: SheetRecord): FormResponseStatus {
  return {
    formId: record["Form ID"] ?? "",
    row: Number(record["Row Number"] ?? "0"),
    status: (record["Status"] as FormResponseStatusValue) || "",
    updatedAt: record["UpdatedAt"] ?? "",
  };
}

export const formResponseStatusService = {
  /** All statuses set for a form, keyed by sheet row number. */
  async listForForm(formId: string): Promise<Record<number, FormResponseStatusValue>> {
    const records = await dataService.findAll(entity);
    const map: Record<number, FormResponseStatusValue> = {};
    for (const record of records) {
      if (record["Form ID"] !== formId) continue;
      const status = toStatus(record);
      if (status.status) map[status.row] = status.status;
    }
    return map;
  },

  async setStatus(
    formId: string,
    row: number,
    status: FormResponseStatusValue
  ): Promise<FormResponseStatus> {
    const id = statusId(formId, row);
    const existing = await dataService.findById(entity, id);
    const now = new Date().toISOString();

    if (!existing) {
      const record: SheetRecord = {
        "Status ID": id,
        "Form ID": formId,
        "Row Number": String(row),
        Status: status,
        UpdatedAt: now,
      };
      const saved = await dataService.append(entity, record);
      return toStatus(saved);
    }

    const saved = await dataService.updateById(entity, id, { Status: status, UpdatedAt: now });
    return toStatus(saved);
  },
};
