export type UserRole = "Admin" | "Manager" | "PC" | "Doer";
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
  createdAt: string;
}

export interface UserWithSecrets extends User {
  passwordHash: string;
}

/** The subset of Doer fields safe to embed on a joined task. */
export type DoerSummary = Pick<User, "id" | "name" | "mobile" | "email" | "department" | "role">;

export type TaskPriority = "Low" | "Normal" | "Urgent" | "Critical";

export type TaskStatus = "Pending" | "In Progress" | "Completed" | "Cancelled";

/** A row from TASKLIST. `assignedDoerId` must reference DOERLIST."Doer ID" — never a name. */
export interface Task {
  id: string;
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
  | "Quarterly"
  | "HalfYearly"
  | "Yearly";

export type ChecklistTemplateStatus = "Active" | "Inactive";

export interface ChecklistTemplate {
  id: string;
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
  role: UserRole;
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
