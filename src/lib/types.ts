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

export type TaskPriority = "Low" | "Normal" | "Urgent" | "Critical";
export type TaskStatus = "Pending" | "In Progress" | "Completed" | "Cancelled";
export type ChecklistInstanceStatus = "Pending" | "Completed";

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

export interface Task {
  id: string;
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
