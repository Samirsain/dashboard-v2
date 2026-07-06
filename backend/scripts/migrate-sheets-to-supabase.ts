import "dotenv/config";
import { sheetsConfig } from "../src/config/sheets.config";
import { googleSheetsService } from "../src/services/googleSheets.service";
import { getSupabase } from "../src/config/supabase";

/**
 * ONE-TIME migration: copies every row from the existing Google Sheets tabs
 * into the matching Supabase tables. Safe to re-run — it upserts on the primary
 * key, so existing rows are updated rather than duplicated.
 *
 * Run AFTER creating the tables (supabase/schema.sql) and with both
 * GOOGLE_* and SUPABASE_* credentials set in the environment:
 *
 *   npm run migrate:supabase
 */
async function main() {
  const supabase = getSupabase();
  const entities = Object.entries(sheetsConfig);

  for (const [key, entity] of entities) {
    process.stdout.write(`\n[${key}] reading Google Sheet "${entity.sheetName}"... `);
    const records = await googleSheetsService.findAll(entity);
    console.log(`${records.length} rows`);

    if (records.length === 0) {
      console.log(`  nothing to migrate for ${entity.table}`);
      continue;
    }

    // Header-keyed sheet records -> snake_case Postgres rows.
    const rows = records.map((record) => {
      const row: Record<string, string> = {};
      for (const [header, column] of Object.entries(entity.columns)) {
        row[column] = record[header] ?? "";
      }
      return row;
    });

    const idColumn = entity.columns[entity.idColumn];
    // Drop rows with a blank primary key (defensive — shouldn't happen).
    const valid = rows.filter((r) => r[idColumn] && r[idColumn].length > 0);
    if (valid.length !== rows.length) {
      console.log(`  skipped ${rows.length - valid.length} rows with blank ${idColumn}`);
    }

    const { error } = await supabase
      .from(entity.table)
      .upsert(valid, { onConflict: idColumn });
    if (error) {
      console.error(`  ✗ upsert into ${entity.table} failed:`, error.message);
      process.exitCode = 1;
    } else {
      console.log(`  ✓ upserted ${valid.length} rows into ${entity.table}`);
    }
  }

  console.log("\nMigration complete.");
}

main().then(() => process.exit(process.exitCode ?? 0));
