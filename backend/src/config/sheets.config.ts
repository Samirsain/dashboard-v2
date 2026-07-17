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
  /**
   * Master Sheet — a documentation grid describing each list/system: its code
   * (TL/CL/TL2...), name, type, description, creation date, training video
   * links, its PC (process coordinator) and PS (problem solver), which doers
   * have access, and a reference link. Free-form and fully admin-editable.
   */
  masterSheets: entity(
    "MASTER_SHEETS",
    "master_sheets",
    "Master ID",
    {
      "Master ID": "id",
      Code: "code",
      Name: "name",
      Type: "type",
      Description: "description",
      Date: "date",
      Videos: "videos",
      PC: "pc",
      PS: "ps",
      Access: "access",
      Link: "link",
      CreatedAt: "created_at",
    },
    "MASTER_SHEET"
  ),
  /**
   * Registered Google Forms — each row just points at the Google Sheet a
   * form's responses land in (spreadsheet ID + tab name). Actual responses
   * are never copied in here; they're read live from that sheet on request.
   */
  formConfigs: entity(
    "FORM_CONFIGS",
    "form_configs",
    "Form ID",
    {
      "Form ID": "id",
      Name: "name",
      "Spreadsheet ID": "spreadsheet_id",
      "Sheet Name": "sheet_name",
      "Form Link": "form_link",
      Members: "member_ids",
      CreatedAt: "created_at",
    },
    "FORM_CONFIGS"
  ),
  /**
   * Per-response workflow status ("Working"/"Complete") an admin sets
   * from the Form Responses table. Dashboard-only — the linked Google Sheet
   * is never written to. Keyed by "{Form ID}::{row number in the sheet}".
   */
  formResponseStatuses: entity(
    "FORM_RESPONSE_STATUSES",
    "form_response_statuses",
    "Status ID",
    {
      "Status ID": "id",
      "Form ID": "form_id",
      "Row Number": "row_number",
      Status: "status",
      UpdatedAt: "updated_at",
    },
    "FORM_RESPONSE_STATUSES"
  ),
  /** Named lists (categories) an admin creates — each is a "Task List" or a "Checklist". */
  lists: entity(
    "LISTS",
    "lists",
    "List ID",
    {
      "List ID": "id",
      Name: "name",
      Type: "type",
      Members: "member_ids",
      CreatedAt: "created_at",
    },
    "LISTS"
  ),
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
      "Is Attendance Manager": "is_attendance_manager",
      PasswordHash: "password_hash",
      CreatedAt: "created_at",
    },
    "DOERLIST"
  ),
  /** One row per employee per day, marked by the Attendance Manager (or Admin). */
  attendance: entity(
    "ATTENDANCE",
    "attendance",
    "Attendance ID",
    {
      "Attendance ID": "id",
      "Employee ID": "employee_id",
      Date: "date",
      CheckIn: "check_in",
      CheckOut: "check_out",
      Status: "status",
      "Late Minutes": "late_minutes",
      "Working Minutes": "working_minutes",
      "Early Exit Minutes": "early_exit_minutes",
      Remarks: "remarks",
      MarkedBy: "marked_by",
      CreatedAt: "created_at",
      UpdatedAt: "updated_at",
    },
    "ATTENDANCE"
  ),
  /** TASKLIST — master task table. Assigned Doer ID references users."Doer ID". */
  tasks: entity(
    "TASKS",
    "tasks",
    "Task ID",
    {
      "Task ID": "id",
      "List ID": "list_id",
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
      "List ID": "list_id",
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

  /** WFMS — reusable workflow templates (e.g. "Video Production Pipeline"). */
  workflowTemplates: entity(
    "WORKFLOW_TEMPLATES",
    "workflow_templates",
    "Template ID",
    {
      "Template ID": "id",
      Name: "name",
      CreatedAt: "created_at",
    },
    "WORKFLOW_TEMPLATES"
  ),
  /** WFMS — one row per step of a template: What / Who / How / TAT, in order. */
  workflowSteps: entity(
    "WORKFLOW_STEPS",
    "workflow_steps",
    "Step ID",
    {
      "Step ID": "id",
      "Template ID": "template_id",
      "Step No": "step_no",
      What: "what",
      "Doer ID": "doer_id",
      How: "how",
      TAT: "tat",
    },
    "WORKFLOW_STEPS"
  ),
  /** WFMS — one row per run (instance) of a template. */
  workflowInstances: entity(
    "WORKFLOW_INSTANCES",
    "workflow_instances",
    "Instance ID",
    {
      "Instance ID": "id",
      "Template ID": "template_id",
      Title: "title",
      Details: "details",
      StartedAt: "started_at",
      Status: "status",
      RequestedBy: "requested_by",
    },
    "WORKFLOW_INSTANCES"
  ),
  /** WFMS — one row per (instance, step): the live Planned/Actual/Status/Delay record. */
  workflowStepEvents: entity(
    "WORKFLOW_STEP_EVENTS",
    "workflow_step_events",
    "Event ID",
    {
      "Event ID": "id",
      "Instance ID": "instance_id",
      "Step No": "step_no",
      What: "what",
      "Doer ID": "doer_id",
      How: "how",
      TAT: "tat",
      Planned: "planned",
      Actual: "actual",
      Status: "status",
      "Rework Count": "rework_count",
    },
    "WORKFLOW_STEP_EVENTS"
  ),
};

export type SheetEntityKey = keyof typeof sheetsConfig;
