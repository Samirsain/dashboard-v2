import { getSupabase } from "../config/supabase";
import type { SheetEntityConfig } from "../config/sheets.config";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

/** A record keyed by human-readable headers (e.g. "Doer ID"), values as strings. */
export type SheetRecord = Record<string, string>;

/**
 * Primary data-access layer, backed by Supabase (Postgres).
 *
 * It exposes exactly the same surface the codebase used against Google Sheets
 * — findAll / findById / append / updateById / deleteById — and works in the
 * same header-keyed record shape, so domain services (tasks, users, ...) only
 * had to swap which object they call. All Postgres columns are `text`, mirroring
 * the string-only model the app already used, so nothing about the domain
 * mapping (toTask, toUser, ...) had to change.
 *
 * Google Sheets is no longer the source of truth; it's written to only by the
 * daily backup job.
 */

/** Header-keyed record -> snake_case DB row, using the entity's column map. */
function recordToRow(entity: SheetEntityConfig, record: Partial<SheetRecord>): Record<string, string> {
  const row: Record<string, string> = {};
  for (const [header, column] of Object.entries(entity.columns)) {
    if (record[header] !== undefined) row[column] = record[header] as string;
  }
  return row;
}

/** DB row -> header-keyed record, using the entity's column map. */
function rowToRecord(entity: SheetEntityConfig, row: Record<string, unknown>): SheetRecord {
  const record: SheetRecord = {};
  for (const [header, column] of Object.entries(entity.columns)) {
    const value = row[column];
    record[header] = value === null || value === undefined ? "" : String(value);
  }
  return record;
}

/** The Postgres column backing the entity's ID header. */
function idColumnName(entity: SheetEntityConfig): string {
  const column = entity.columns[entity.idColumn];
  if (!column) {
    throw new AppError(
      `Misconfigured entity "${entity.table}": idColumn "${entity.idColumn}" has no column mapping.`,
      500,
      "CONFIG_ERROR"
    );
  }
  return column;
}

function fail(operation: string, error: { message?: string; code?: string } | null): never {
  const message = error?.message ?? "Unknown error";
  logger.error({ operation, code: error?.code, message }, "Supabase query failed");
  throw new AppError(`Database error during ${operation}: ${message}`, 502, "DB_ERROR");
}

export const dataService = {
  async findAll(entity: SheetEntityConfig): Promise<SheetRecord[]> {
    const { data, error } = await getSupabase().from(entity.table).select("*");
    if (error) fail(`findAll(${entity.table})`, error);
    return (data ?? []).map((row) => rowToRecord(entity, row as Record<string, unknown>));
  },

  async findById(entity: SheetEntityConfig, id: string): Promise<SheetRecord | null> {
    const { data, error } = await getSupabase()
      .from(entity.table)
      .select("*")
      .eq(idColumnName(entity), id)
      .maybeSingle();
    if (error) fail(`findById(${entity.table})`, error);
    return data ? rowToRecord(entity, data as Record<string, unknown>) : null;
  },

  async append(entity: SheetEntityConfig, record: SheetRecord): Promise<SheetRecord> {
    const row = recordToRow(entity, record);
    const { data, error } = await getSupabase()
      .from(entity.table)
      .insert(row)
      .select("*")
      .single();
    if (error) fail(`append(${entity.table})`, error);
    return rowToRecord(entity, data as Record<string, unknown>);
  },

  async updateById(
    entity: SheetEntityConfig,
    id: string,
    updates: Partial<SheetRecord>
  ): Promise<SheetRecord> {
    const patch = recordToRow(entity, updates);
    const { data, error } = await getSupabase()
      .from(entity.table)
      .update(patch)
      .eq(idColumnName(entity), id)
      .select("*")
      .maybeSingle();
    if (error) fail(`updateById(${entity.table})`, error);
    if (!data) {
      throw AppError.notFound(`No record with ${entity.idColumn} "${id}" in "${entity.table}".`);
    }
    return rowToRecord(entity, data as Record<string, unknown>);
  },

  async deleteById(entity: SheetEntityConfig, id: string): Promise<void> {
    const { data, error } = await getSupabase()
      .from(entity.table)
      .delete()
      .eq(idColumnName(entity), id)
      .select(idColumnName(entity));
    if (error) fail(`deleteById(${entity.table})`, error);
    if (!data || data.length === 0) {
      throw AppError.notFound(`No record with ${entity.idColumn} "${id}" in "${entity.table}".`);
    }
  },

  /** Deletes every row in the entity's table. Irreversible — used only for explicit admin "clear all" actions. */
  async deleteAll(entity: SheetEntityConfig): Promise<number> {
    const { data, error } = await getSupabase()
      .from(entity.table)
      .delete()
      .not(idColumnName(entity), "is", null)
      .select(idColumnName(entity));
    if (error) fail(`deleteAll(${entity.table})`, error);
    return data?.length ?? 0;
  },

  /** Deletes every row where `header` does NOT equal `value` (e.g. wipe all history except today). Irreversible. */
  async deleteWhereNot(entity: SheetEntityConfig, header: string, value: string): Promise<number> {
    const column = entity.columns[header];
    if (!column) {
      throw new AppError(
        `Misconfigured entity "${entity.table}": header "${header}" has no column mapping.`,
        500,
        "CONFIG_ERROR"
      );
    }
    const { data, error } = await getSupabase()
      .from(entity.table)
      .delete()
      .neq(column, value)
      .select(idColumnName(entity));
    if (error) fail(`deleteWhereNot(${entity.table}, ${header}!=${value})`, error);
    return data?.length ?? 0;
  },

  /** Deletes every row where `header` (a record header, e.g. "Status") equals `value`. Irreversible. */
  async deleteWhere(entity: SheetEntityConfig, header: string, value: string): Promise<number> {
    const column = entity.columns[header];
    if (!column) {
      throw new AppError(
        `Misconfigured entity "${entity.table}": header "${header}" has no column mapping.`,
        500,
        "CONFIG_ERROR"
      );
    }
    const { data, error } = await getSupabase()
      .from(entity.table)
      .delete()
      .eq(column, value)
      .select(idColumnName(entity));
    if (error) fail(`deleteWhere(${entity.table}, ${header}=${value})`, error);
    return data?.length ?? 0;
  },
};
