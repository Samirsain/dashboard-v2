export type UserRole = "Admin" | "Manager" | "Doer";
export type UserStatus = "Active" | "Inactive";

export interface User {
  id: string;
  name: string;
  email: string;
  department: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export interface UserWithSecrets extends User {
  passwordHash: string;
}

export type TaskPriority = "Low" | "Normal" | "Urgent" | "Critical";

export type TaskStatus = "Pending" | "In Progress" | "Completed" | "Cancelled";

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  priority: TaskPriority;
  dueDate: string; // ISO date (YYYY-MM-DD)
  status: TaskStatus;
  revisionDate: string; // last revised-to date, ISO date or ""
  revisionCount: number;
  department: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
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
  assignedTo: string;
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
  assignedTo: string;
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
  completed: number;
  pending: number;
  urgent: number;
  overdue: number;
  revisionToday: number;
  checklistToday: number;
  todaysDue: number;
  upcoming: number;
}
