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

    // Tab name is optional — blank means "use the form's main (first) tab",
    // which is what Google Forms writes to. This spares users from typing an
    // exact, case-sensitive tab name for every form.
    let sheetName = (config.sheetName ?? "").trim();
    if (!sheetName) {
      sheetName = await googleSheetsService.firstTabName(config.spreadsheetId);
    }

    const { headers, rows } = await googleSheetsService.readValues(
      config.spreadsheetId,
      sheetName
    );

    return { headers, rows };
  },
};
