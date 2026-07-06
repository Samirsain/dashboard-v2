import "dotenv/config";
import { optionalEnv } from "./helpers";

/**
 * Single source of truth for every persisted entity: its Postgres table (the
 * primary store, in Supabase), the header-keyed record shape the whole
 * codebase speaks, the column mapping between the two, and the Google Sheets
 * tab used for backup.
 *
 * Domain services (tasks.service, users.service, ...) never reference a table
 * name, column name, or sheet name literal — they read it from here and work
 * with plain header-keyed records. The Supabase data layer maps those headers
 * to snake_case Postgres columns via `columns`; the backup job mirrors the
 * same records into the matching Google Sheets tab.
 */

export interface SheetEntityConfig {
  /** Primary Postgres table for this entity (in Supabase). */
  table: string;
  /**
   * Maps the human-readable record header (e.g. "Doer ID") to its snake_case
   * Postgres column (e.g. "id"). The record shape used across the codebase is
   * keyed by these headers; the data layer translates to/from columns.
   */
  columns: Record<string, string>;
  /** Record header used as the unique identifier for lookups (a key of `columns`). */
  idColumn: string;
  /** Expected header row — the order records are laid out in, and the Sheets backup header. */
  expectedHeaders: string[];
  /** Google Sheets spreadsheet ID used for backup. */
  spreadsheetId: string;
  /** Google Sheets tab (sheet) name used for backup. */
  sheetName: string;
}

// GOOGLE_SPREADSHEET_ID is the primary name; GOOGLE_SHEETS_SPREADSHEET_ID is
// accepted as a fallback for backward compatibility.
const defaultSpreadsheetId = optionalEnv(
  "GOOGLE_SPREADSHEET_ID",
  optionalEnv("GOOGLE_SHEETS_SPREADSHEET_ID", "")
);

function entity(
  key: string,
  table: string,
  idColumn: string,
  columns: Record<string, string>,
  defaultSheetName: string
): SheetEntityConfig {
  return {
    table,
    columns,
    idColumn,
    expectedHeaders: Object.keys(columns),
    spreadsheetId: optionalEnv(`SHEET_${key}_SPREADSHEET_ID`, defaultSpreadsheetId),
    sheetName: optionalEnv(`SHEET_${key}_NAME`, defaultSheetName),
  };
}

export const sheetsConfig = {
  /** DOERLIST — master employee table. Doer ID is the only valid key for relations. */
  users: entity(
    "USERS",
    "users",
    "Doer ID",
    {
      "Doer ID": "id",
      "Employee Code": "employee_code",
      Name: "name",
      Mobile: "mobile",
      Email: "email",
      Department: "department",
      Role: "role",
      Status: "status",
      "Can View All": "can_view_all",
      PasswordHash: "password_hash",
      CreatedAt: "created_at",
    },
    "DOERLIST"
  ),
  /** TASKLIST — master task table. Assigned Doer ID references users."Doer ID". */
  tasks: entity(
    "TASKS",
    "tasks",
    "Task ID",
    {
      "Task ID": "id",
      Title: "title",
      Description: "description",
      "Assigned Doer ID": "assigned_doer_id",
      "Doer Name": "doer_name",
      Priority: "priority",
      "Due Date": "due_date",
      Status: "status",
      "Revision Date": "revision_date",
      "Revision Count": "revision_count",
      Department: "department",
      CreatedBy: "created_by",
      CreatedAt: "created_at",
      UpdatedAt: "updated_at",
      "Repeat Type": "repeat_type",
      "Repeat Value": "repeat_value",
    },
    "TASKLIST"
  ),
  /** Full revision history — one row per revision, never overwritten. */
  revisions: entity(
    "REVISIONS",
    "revisions",
    "Revision ID",
    {
      "Revision ID": "id",
      "Task ID": "task_id",
      "Old Due Date": "old_due_date",
      "New Due Date": "new_due_date",
      Reason: "reason",
      Comment: "comment",
      "Revised By": "revised_by",
      "Revised At": "revised_at",
    },
    "Revisions"
  ),
  checklistTemplates: entity(
    "CHECKLIST_TEMPLATES",
    "checklist_templates",
    "Template ID",
    {
      "Template ID": "id",
      "Task Name": "task_name",
      Description: "description",
      Frequency: "frequency",
      FrequencyValue: "frequency_value",
      "Assigned Doer ID": "assigned_doer_id",
      Department: "department",
      Priority: "priority",
      Status: "status",
      CreatedAt: "created_at",
    },
    "CHECKLIST"
  ),
  checklistInstances: entity(
    "CHECKLIST_INSTANCES",
    "checklist_instances",
    "Instance ID",
    {
      "Instance ID": "id",
      "Template ID": "template_id",
      "Task Name": "task_name",
      Date: "date",
      "Assigned Doer ID": "assigned_doer_id",
      Status: "status",
      CompletedBy: "completed_by",
      CompletedAt: "completed_at",
    },
    "CHECKLIST_INSTANCES"
  ),
  activityLogs: entity(
    "ACTIVITY_LOGS",
    "activity_logs",
    "Log ID",
    {
      "Log ID": "id",
      User: "actor",
      Action: "action",
      Task: "task",
      Date: "date",
      Time: "time",
      Details: "details",
    },
    "ACTIVITY_LOGS"
  ),
};

export type SheetEntityKey = keyof typeof sheetsConfig;
