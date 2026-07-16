import { googleSheetsService } from "./googleSheets.service";
import { formConfigService } from "./formConfig.service";
import { AppError } from "../utils/AppError";
import type { FormResponses } from "../types";

/**
 * Reads a registered form's responses live from its linked Google Sheet —
 * nothing is copied into our database, so a fresh submission shows up on
 * the next fetch with no import step.
 */
export const formResponsesService = {
  async getResponses(formConfigId: string): Promise<FormResponses> {
    const config = await formConfigService.findById(formConfigId);
    if (!config) {
      throw AppError.notFound(`Form "${formConfigId}" not found.`);
    }

    const { headers, rows } = await googleSheetsService.readSheet({
      table: "", // unused for a plain read
      columns: {},
      idColumn: "",
      expectedHeaders: [],
      spreadsheetId: config.spreadsheetId,
      sheetName: config.sheetName,
    });

    return { headers, rows };
  },
};
