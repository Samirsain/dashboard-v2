import { sheetsConfig } from "../config/sheets.config";
import { dataService } from "../services/data.service";
import { googleSheetsService } from "../services/googleSheets.service";
import { hasGoogleCredentials, hasSupabaseCredentials } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Backup job: mirrors every table from Supabase (the source of truth) into its
 * matching Google Sheets tab, so there's always a human-readable, exportable
 * copy of the data outside the database. Each tab is overwritten with a full
 * snapshot; no partial/merge logic, so the Sheet can never drift out of sync.
 *
 * Skips silently (with a warning) if either side isn't configured — the app
 * still runs fine on Supabase alone; the backup is a safety net, not a
 * dependency.
 */
export async function runBackupJob(): Promise<void> {
  if (!hasSupabaseCredentials()) {
    logger.warn("Skipping backup: Supabase (source) is not configured");
    return;
  }
  if (!hasGoogleCredentials()) {
    logger.warn("Skipping backup: Google Sheets (backup target) is not configured");
    return;
  }

  logger.info("Backup job starting: Supabase -> Google Sheets");

  const entities = Object.values(sheetsConfig);
  let ok = 0;
  for (const entity of entities) {
    try {
      const records = await dataService.findAll(entity);
      await googleSheetsService.overwriteAll(entity, records);
      logger.info({ table: entity.table, rows: records.length }, "Backed up table to Sheets");
      ok++;
    } catch (error) {
      logger.error({ err: error, table: entity.table }, "Backup of one table failed");
    }
  }

  logger.info({ backedUp: ok, total: entities.length }, "Backup job complete");
}
