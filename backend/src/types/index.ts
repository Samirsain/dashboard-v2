export type UserRole = "Admin" | "Doer";
export type UserStatus = "Active" | "Inactive";

/** A row from DOERLIST — the master employee table. `id` is the Doer ID. */
export interface User {
  id: string;
  /** Login username, e.g. "EM01" — independent of Doer ID and safe to share/type. */
  employeeCode: string;
  name: string;
  mobile: string;
  email: string;
  department: string;
  role: UserRole;
  status: UserStatus;
  /** When true, this doer can see everyone's tasks/checklists (like an admin), without task-create rights. */
  canViewAll: boolean;
  /** When true, this doer can mark attendance for every employee (Attendance Manager). Admin always can too. */
  isAttendanceManager: boolean;
  /**
   * When true, this user is an "assistant admin": they get the full admin
   * experience (they'll normally also have role "Admin") EXCEPT the ability to
   * delete doers or delete tasks — those destructive actions stay with the
   * primary admin only.
   */
  isAssistant: boolean;
  createdAt: string;
}

export type AttendanceStatus = "Present" | "Late" | "Half Day" | "Absent" | "Leave" | "Pending Checkout";

/** One row per employee per day, marked by the Attendance Manager (or Admin) — never self-service. */
export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  /** ISO timestamp, or "" if not checked in. */
  checkIn: string;
  /** ISO timestamp, or "" if not checked out. */
  checkOut: string;
  status: AttendanceStatus | "";
  lateMinutes: number;
  workingMinutes: number;
  earlyExitMinutes: number;
  remarks: string;
  /** Doer ID of whoever marked/last edited this record. */
  markedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithSecrets extends User {
  passwordHash: string;
}

/** The subset of Doer fields safe to embed on a joined task. */
export type DoerSummary = Pick<User, "id" | "name" | "mobile" | "email" | "department" | "role">;

export type TaskPriority = "Low" | "Normal" | "Urgent" | "Critical";

export type TaskStatus = "Pending" | "In Progress" | "Completed" | "Cancelled";

export type RepeatType = "None" | "Daily" | "Weekly" | "Monthly (By Date)" | "Monthly (By Day)";

/** A row from TASKLIST. `assignedDoerId` must reference DOERLIST."Doer ID" — never a name. */
/** A named category an admin creates: either a "Task List" or a "Checklist". */
export type ListType = "task" | "checklist";

export interface List {
  id: string;
  name: string;
  type: ListType;
  /** Doer IDs allowed to access this list (Admin always can). */
  memberIds: string[];
  createdAt: string;
}

/** A row in the Master Sheet — free-form documentation of a list/system. */
export interface MasterSheetRow {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string;
  date: string;
  videos: string;
  pc: string;
  ps: string;
  access: string;
  link: string;
  createdAt: string;
}

/** A registered Google Form — points at the Sheet its responses land in. */
export interface FormConfig {
  id: string;
  name: string;
  spreadsheetId: string;
  sheetName: string;
  /** The shareable Google Form URL (for copying/sending) — separate from the response Sheet. */
  formLink: string;
  /** Doer IDs granted access to this form's responses. Admin always sees everything. */
  memberIds: string[];
  createdAt: string;
}

/** A form's responses, read live from its linked Google Sheet. */
export interface FormResponses {
  headers: string[];
  rows: Array<{ row: number; data: Record<string, string> }>;
}

export type FormResponseStatusValue = "" | "Working" | "Complete";

/** Dashboard-only per-response status, keyed by the sheet row it marks. */
export interface FormResponseStatus {
  formId: string;
  row: number;
  status: FormResponseStatusValue;
  updatedAt: string;
}

export interface Task {
  id: string;
  /** The Task List (list of type "task") this task is filed under, or "". */
  listId: string;
  title: string;
  description: string;
  assignedDoerId: string;
  priority: TaskPriority;
  dueDate: string; // ISO date (YYYY-MM-DD)
  status: TaskStatus;
  revisionDate: string; // date of the most recent revision, ISO date or ""
  revisionCount: number;
  department: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  repeatType: RepeatType;
  repeatValue: string;
}

/** Task joined with its DOERLIST row — what task-fetching endpoints return. */
export interface TaskWithDoer extends Task {
  doer: DoerSummary | null;
}

/** One immutable row of a task's revision history — rows are appended, never overwritten. */
export interface Revision {
  id: string;
  taskId: string;
  oldDueDate: string;
  newDueDate: string;
  reason: string;
  comment: string;
  revisedBy: string;
  revisedAt: string;
}

export type ChecklistFrequency =
  | "Daily"
  | "Weekly"
  | "Monthly"
  | "Monthly (By Date)"
  | "Monthly (By Day)"
  | "Quarterly"
  | "HalfYearly"
  | "Yearly";

export type ChecklistTemplateStatus = "Active" | "Inactive";

export interface ChecklistTemplate {
  id: string;
  /** The Checklist (list of type "checklist") this template is filed under, or "". */
  listId: string;
  taskName: string;
  description: string;
  frequency: ChecklistFrequency;
  /**
   * Meaning depends on frequency:
   *  - Daily: unused
   *  - Weekly: weekday name, e.g. "Monday"
   *  - Monthly: day of month, e.g. "15"
   *  - Quarterly / HalfYearly / Yearly: comma separated "MM-DD" anchors,
   *    e.g. HalfYearly -> "01-01,07-01", Yearly -> "04-01"
   */
  frequencyValue: string;
  assignedDoerId: string;
  department: string;
  priority: TaskPriority;
  status: ChecklistTemplateStatus;
  createdAt: string;
}

export type ChecklistInstanceStatus = "Pending" | "Completed";

export interface ChecklistInstance {
  id: string;
  templateId: string;
  taskName: string;
  date: string; // ISO date this occurrence is due
  assignedDoerId: string;
  status: ChecklistInstanceStatus;
  completedBy: string;
  completedAt: string;
}

export interface ActivityLog {
  id: string;
  user: string;
  action: string;
  task: string;
  date: string;
  time: string;
  details: string;
}

export interface JwtClaims {
  sub: string; // user id
  email: string;
  employeeCode?: string;
  role: UserRole;
  /** Mirrors User.canViewAll so list endpoints can filter without a DB lookup. */
  canViewAll?: boolean;
  /** Mirrors User.isAttendanceManager so attendance endpoints can check without a DB lookup. */
  isAttendanceManager?: boolean;
  /** Mirrors User.isAssistant so delete guards can check without a DB lookup. */
  isAssistant?: boolean;
}

export interface DashboardSummary {
  totalTasks: number;
  pending: number;
  completed: number;
  overdue: number;
  todaysTasks: number;
  todaysRevisions: number;
  urgent: number;
  critical: number;
  checklistToday: number;
  upcoming: number;
}

export interface UserWiseTaskStat {
  doerId: string;
  doerName: string;
  total: number;
  pending: number;
  completed: number;
  overdue: number;
}

export interface DepartmentWiseTaskStat {
  department: string;
  total: number;
  pending: number;
  completed: number;
  overdue: number;
}

// ---- Workflow Monitoring System (WFMS) ------------------------------------

export interface WorkflowTemplate {
  id: string;
  name: string;
  createdAt: string;
}

export interface WorkflowStep {
  id: string;
  templateId: string;
  stepNo: number;
  what: string;
  doerId: string;
  how: string;
  /** Canonical TAT string: "<n>h", "SAME_DAY", "NEXT_DAY", or "WHENEVER_NEEDED". */
  tat: string;
}

export type WorkflowInstanceStatus = "Active" | "Complete";

export interface WorkflowInstance {
  id: string;
  templateId: string;
  title: string;
  /** Free-text extra info (e.g. "Video Title: X, Sub Part: Y, Location: Z"). */
  details: string;
  startedAt: string; // ISO timestamp
  status: WorkflowInstanceStatus;
  requestedBy: string;
}

export type WorkflowStepStatus = "Pending" | "Active" | "Complete" | "Blocked" | "Overdue";

export interface WorkflowStepEvent {
  id: string;
  instanceId: string;
  stepNo: number;
  what: string;
  doerId: string;
  how: string;
  tat: string;
  planned: string; // ISO timestamp, "" if WHENEVER_NEEDED
  actual: string; // ISO timestamp, "" until complete
  status: WorkflowStepStatus;
  reworkCount: number;
}

// ---- DGMAX Negative Performance Scoring System Types ----------------------
//
// Green/Yellow/Red are the DB column names (unchanged, no migration needed)
// but now carry DGMAX's exact meanings:
//   Green  = On Time  (completed on or before due date)
//   Yellow = Late Done (completed after due date)
//   Red    = Not Done (still incomplete, due date has passed)
//   Pending = still incomplete, not yet due — excluded from the score entirely.

export type TaskScoreCategory = "Green" | "Yellow" | "Red" | "Pending";

export interface DgmaxEmployeeSummary {
  doerId: string;
  doerName: string;
  department: string;
  assignedTasks: number; // Green + Yellow + Red (Pending excluded — not yet scoreable)
  completedTasks: number;
  greenCount: number; // On Time
  yellowCount: number; // Late Done
  redCount: number; // Not Done
  pendingCount: number; // not yet due — informational only
  negativeScore: number; // -(Not Done Penalty + Late Done Penalty), 0 to -100
  performanceScore: number; // 100 + negativeScore, clamped 0-100
}

export interface DgmaxWeeklySummary {
  weekLabel: string; // e.g. "21-07-2026 to 27-07-2026" (Monday-Sunday)
  fromDate: string; // YYYY-MM-DD, Monday
  toDate: string; // YYYY-MM-DD, Sunday
  lateDoneWeight: number; // 0-100, the weight used for this summary
  summaries: DgmaxEmployeeSummary[];
  totals: {
    assigned: number;
    completed: number;
    green: number;
    yellow: number;
    red: number;
    pending: number;
    /** Team average of the final (negative) score, 0 down to -100. */
    negativeScore: number;
    /** Same team average on the 0-100 scale. */
    performanceScore: number;
  };
}


