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

const defaultSpreadsheetId = optionalEnv("GOOGLE_SHEETS_SPREADSHEET_ID", "");

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
  users: entity(
    "USERS",
    "ID",
    ["ID", "Name", "Email", "Department", "Role", "Status", "PasswordHash", "CreatedAt"],
    "Users"
  ),
  tasks: entity(
    "TASKS",
    "Task ID",
    [
      "Task ID",
      "Title",
      "Description",
      "Assigned To",
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
    "Tasks"
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
      "AssignedTo",
      "Department",
      "Priority",
      "Status",
      "CreatedAt",
    ],
    "ChecklistTemplates"
  ),
  checklistInstances: entity(
    "CHECKLIST_INSTANCES",
    "Instance ID",
    [
      "Instance ID",
      "Template ID",
      "Task Name",
      "Date",
      "AssignedTo",
      "Status",
      "CompletedBy",
      "CompletedAt",
    ],
    "ChecklistInstances"
  ),
  activityLogs: entity(
    "ACTIVITY_LOGS",
    "Log ID",
    ["Log ID", "User", "Action", "Task", "Date", "Time", "Details"],
    "ActivityLogs"
  ),
};

export type SheetEntityKey = keyof typeof sheetsConfig;
