export type UserRole = "Admin" | "Manager" | "PC" | "Doer";
export type UserStatus = "Active" | "Inactive";

export interface Doer {
  id: string;
  employeeCode: string;
  name: string;
  mobile: string;
  email: string;
  department: string;
  role: UserRole;
  status: UserStatus;
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
  createdAt: string;
}

/** A form's responses, read live from its linked Google Sheet. */
export interface FormResponses {
  headers: string[];
  rows: Array<{ row: number; data: Record<string, string> }>;
}

export type FormResponseStatusValue = "" | "Working" | "Complete";
/** Row number (in the sheet) -> its dashboard-only Working/Complete status. */
export type FormResponseStatusMap = Record<number, FormResponseStatusValue>;

export type TaskPriority = "Low" | "Normal" | "Urgent" | "Critical";
export type TaskStatus = "Pending" | "In Progress" | "Completed" | "Cancelled";
export type RepeatType = "None" | "Daily" | "Weekly" | "Monthly (By Date)" | "Monthly (By Day)";
export type ChecklistInstanceStatus = "Pending" | "Completed";

export interface ChecklistTemplate {
  id: string;
  listId: string;
  taskName: string;
  assignedDoerId: string;
  frequency: string;
  status: string;
  createdAt: string;
}

export interface ChecklistInstance {
  id: string;
  templateId: string;
  taskName: string;
  date: string;
  assignedDoerId: string;
  status: ChecklistInstanceStatus;
  completedBy: string;
  completedAt: string;
  doer?: DoerSummary | null;
}

export interface DoerSummary {
  id: string;
  name: string;
  mobile: string;
  email: string;
  department: string;
  role: UserRole;
}

export type ListType = "task" | "checklist";

export interface List {
  id: string;
  name: string;
  type: ListType;
  memberIds: string[];
  createdAt: string;
}

export interface Task {
  id: string;
  listId: string;
  title: string;
  description: string;
  assignedDoerId: string;
  priority: TaskPriority;
  dueDate: string;
  status: TaskStatus;
  revisionDate: string;
  revisionCount: number;
  department: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  repeatType: RepeatType;
  repeatValue: string;
  doer: DoerSummary | null;
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

export interface FullDashboard {
  summary: DashboardSummary;
  breakdowns: {
    userWiseTasks: UserWiseTaskStat[];
    departmentWiseTasks: DepartmentWiseTaskStat[];
  };
  sections: {
    todaysTasks: Task[];
    urgentTasks: Task[];
    criticalTasks: Task[];
    overdueTasks: Task[];
    upcomingTasks: Task[];
    revisionTodayTasks: Task[];
    checklistToday: unknown[];
    completedToday: Task[];
    activityTimeline: ActivityLog[];
  };
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

// ---- Workflow Monitoring System (WFMS) ------------------------------------

export interface WorkflowStep {
  id: string;
  templateId: string;
  stepNo: number;
  what: string;
  doerId: string;
  how: string;
  tat: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  createdAt: string;
  steps: WorkflowStep[];
}

export type WorkflowInstanceStatus = "Active" | "Complete";

export interface WorkflowInstance {
  id: string;
  templateId: string;
  title: string;
  details: string;
  startedAt: string;
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
  planned: string;
  actual: string;
  status: WorkflowStepStatus;
  reworkCount: number;
}

// ---- Help Ticket System --------------------------------------------------

export type TicketStatus = "Pending" | "Waiting for Employee" | "Reopened" | "Completed";
export type TicketPriority = "Low" | "Medium" | "High" | "Urgent";

export interface Ticket {
  id: string;
  employee_id: string;
  employee_name: string;
  department: string;
  title: string;
  description: string;
  solution_option1: string;
  solution_option2: string;
  blanket_required: string;
  priority: TicketPriority;
  attachment_url: string;
  status: TicketStatus;
  solution: string;
  solution_type: string;
  created_at: string;
  updated_at: string;
}

export interface TicketDashboardStats {
  total: number;
  pending: number;
  waiting: number;
  reopened: number;
  completedToday: number;
}

