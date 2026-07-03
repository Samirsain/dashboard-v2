import "dotenv/config";
import { optionalEnv } from "./helpers";

/**
 * Single source of truth for which Google Spreadsheet / tabs / ID columns
 * every service talks to. Nothing outside this file should reference a
 * spreadsheet ID or sheet name literal — read it from here instead.
 *
 * Every value is sourced from environment variables so that wiring in the
 * real spreadsheet later is a .env change only, never a code change.
 */

export interface SheetEntityConfig {
  /** Spreadsheet ID this entity's tab lives in. */
  spreadsheetId: string;
  /** Tab (sheet) name inside the spreadsheet. */
  sheetName: string;
  /** Column header used as the unique identifier for row lookups. */
  idColumn: string;
  /** Expected header row — used only to auto-provision an empty tab. */
  expectedHeaders: string[];
}

// GOOGLE_SPREADSHEET_ID is the primary name; GOOGLE_SHEETS_SPREADSHEET_ID is
// accepted as a fallback for backward compatibility.
const defaultSpreadsheetId = optionalEnv(
  "GOOGLE_SPREADSHEET_ID",
  optionalEnv("GOOGLE_SHEETS_SPREADSHEET_ID", "")
);

function entity(
  key: string,
  idColumn: string,
  expectedHeaders: string[],
  defaultSheetName: string
): SheetEntityConfig {
  return {
    spreadsheetId: optionalEnv(`SHEET_${key}_SPREADSHEET_ID`, defaultSpreadsheetId),
    sheetName: optionalEnv(`SHEET_${key}_NAME`, defaultSheetName),
    idColumn,
    expectedHeaders,
  };
}

export const sheetsConfig = {
  /** DOERLIST — master employee table. Doer ID is the only valid key for relations. */
  users: entity(
    "USERS",
    "Doer ID",
    [
      "Doer ID",
      "Employee Code",
      "Name",
      "Mobile",
      "Email",
      "Department",
      "Role",
      "Status",
      "PasswordHash",
      "CreatedAt",
    ],
    "DOERLIST"
  ),
  /** TASKLIST — master task table. Assigned Doer ID references DOERLIST."Doer ID". */
  tasks: entity(
    "TASKS",
    "Task ID",
    [
      "Task ID",
      "Title",
      "Description",
      "Assigned Doer ID",
      "Priority",
      "Due Date",
      "Status",
      "Revision Date",
      "Revision Count",
      "Department",
      "CreatedBy",
      "CreatedAt",
      "UpdatedAt",
    ],
    "TASKLIST"
  ),
  /** Full revision history — one row per revision, never overwritten. */
  revisions: entity(
    "REVISIONS",
    "Revision ID",
    [
      "Revision ID",
      "Task ID",
      "Old Due Date",
      "New Due Date",
      "Reason",
      "Comment",
      "Revised By",
      "Revised At",
    ],
    "Revisions"
  ),
  checklistTemplates: entity(
    "CHECKLIST_TEMPLATES",
    "Template ID",
    [
      "Template ID",
      "Task Name",
      "Description",
      "Frequency",
      "FrequencyValue",
      "Assigned Doer ID",
      "Department",
      "Priority",
      "Status",
      "CreatedAt",
    ],
    "CHECKLIST"
  ),
  checklistInstances: entity(
    "CHECKLIST_INSTANCES",
    "Instance ID",
    [
      "Instance ID",
      "Template ID",
      "Task Name",
      "Date",
      "Assigned Doer ID",
      "Status",
      "CompletedBy",
      "CompletedAt",
    ],
    "CHECKLIST_INSTANCES"
  ),
  activityLogs: entity(
    "ACTIVITY_LOGS",
    "Log ID",
    ["Log ID", "User", "Action", "Task", "Date", "Time", "Details"],
    "ACTIVITY_LOGS"
  ),
};

export type SheetEntityKey = keyof typeof sheetsConfig;
