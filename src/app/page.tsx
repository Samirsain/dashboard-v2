"use client";

import { useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type {
  ChecklistInstance,
  ChecklistTemplate,
  FullDashboard,
  List,
  Task,
  TaskStatus,
} from "@/lib/types";

/** Builds and downloads a CSV of the given tasks (client-side, no server round-trip). */
function exportTasksToCsv(tasks: Task[]) {
  const headers = [
    "Title",
    "Assigned To",
    "Department",
    "Priority",
    "Status",
    "Due Date",
    "Revision Count",
    "Created At",
  ];
  const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const rows = tasks.map((t) =>
    [
      t.title,
      t.doer?.name ?? t.assignedDoerId,
      t.department,
      t.priority,
      t.status,
      t.dueDate,
      String(t.revisionCount),
      t.createdAt,
    ]
      .map(escape)
      .join(",")
  );
  const csv = [headers.map(escape).join(","), ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tasks-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }: { status: TaskStatus }) {
  if (status === "Completed") {
    return (
      <span className="inline-block bg-primary-container text-on-primary font-label-sm text-label-sm uppercase px-3 py-1 border border-primary-container">
        Completed
      </span>
    );
  }
  return (
    <span className="inline-block bg-surface-variant text-on-surface font-label-sm text-label-sm uppercase px-3 py-1 border border-on-surface-variant">
      {status}
    </span>
  );
}

const ALL_SCOPE = "ALL";
const OFFICE_CL = "OFFICE_CL"; // checklist instances whose template has no listId

type SystemType = "task-list" | "checklist" | "workflow";

const SYSTEM_OPTIONS: { key: SystemType; label: string }[] = [
  { key: "task-list", label: "Task List" },
  { key: "checklist", label: "Checklist" },
  { key: "workflow", label: "Workflow" },
];

function DashboardInner() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "Admin";
  const [dashboard, setDashboard] = useState<FullDashboard | null>(null);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [checklistToday, setChecklistToday] = useState<ChecklistInstance[]>([]);
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── DUAL FILTER STATE ────────────────────────────────────────────────────
  // Filter 1: System type (Task List / Checklist / Workflow)
  // Filter 2: Specific list within the selected system (ALL = show all)
  const [systemFilter, setSystemFilter] = useState<SystemType>("task-list");
  const [listFilter, setListFilter] = useState<string>(ALL_SCOPE);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [dash, tasks, listsData, checklist, templates] = await Promise.all([
          api.get<FullDashboard>("/dashboard"),
          api.get<Task[]>("/tasks"),
          api.get<List[]>("/lists").catch(() => [] as List[]),
          api.get<ChecklistInstance[]>("/checklist/today").catch(() => [] as ChecklistInstance[]),
          api.get<ChecklistTemplate[]>("/checklist/templates").catch(() => [] as ChecklistTemplate[]),
        ]);
        setDashboard(dash);
        setLists(listsData);
        setAllTasks(tasks);
        setChecklistToday(checklist);
        setChecklistTemplates(templates);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // When system changes, reset list filter
  function handleSystemChange(sys: SystemType) {
    setSystemFilter(sys);
    setListFilter(ALL_SCOPE);
  }

  // Helpers
  function listNameFor(listId: string): string {
    if (!listId) return "Office";
    const found = lists.find((l) => l.id === listId);
    return found ? found.name : "Office";
  }

  /** Given a checklist instance, find the listId via its template. */
  function listIdForInstance(instance: ChecklistInstance): string {
    const template = checklistTemplates.find((t) => t.id === instance.templateId);
    return template?.listId ?? "";
  }

  // Lists available in second dropdown based on selected system
  // For checklist: we handle OFFICE CL specially (hardcoded), so only return named checklist lists
  const taskListOptions = lists.filter((l) => l.type === "task");
  const checklistListOptions = lists.filter((l) => l.type === "checklist");

  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  const isPrivileged = user?.role === "Admin" || user?.role === "Manager";

  type DirRow = {
    id: string;
    description: string;
    doerName: string;
    status: TaskStatus;
    listLabel: string;
    rowType: "task" | "checklist"; // to know which API to call on Done
  };

  // ── BUILD ROWS BASED ON DUAL FILTER ──────────────────────────────────────
  const directoryRows: DirRow[] = (() => {
    // ── CHECKLIST SYSTEM ────────────────────────────────────────────────────
    if (systemFilter === "checklist") {
      const base = isPrivileged
        ? checklistToday
        : checklistToday.filter((c) => c.assignedDoerId === user?.id);

      return base
        .filter((c) => c.status !== "Completed")
        .filter((c) => {
          if (listFilter === ALL_SCOPE) return true;
          const instanceListId = listIdForInstance(c);
          // OFFICE CL = templates with no listId
          if (listFilter === OFFICE_CL) return !instanceListId;
          return instanceListId === listFilter;
        })
        .map((c) => ({
          id: c.id,
          description: c.taskName,
          doerName: c.doer?.name ?? user?.name ?? "",
          status: "Pending" as TaskStatus,
          listLabel: listNameFor(listIdForInstance(c)) || "Checklist",
          rowType: "checklist" as const,
        }));
    }

    // ── WORKFLOW SYSTEM ─────────────────────────────────────────────────────
    if (systemFilter === "workflow") {
      const taskListIds = new Set(lists.filter((l) => l.type === "task").map((l) => l.id));
      const checklistIds = new Set(lists.filter((l) => l.type === "checklist").map((l) => l.id));

      const base = isPrivileged
        ? allTasks
        : allTasks.filter((t) => t.assignedDoerId === user?.id);

      return base
        .filter((t) => t.status !== "Completed" && t.status !== "Cancelled")
        .filter((t) => t.listId && !taskListIds.has(t.listId) && !checklistIds.has(t.listId))
        .filter((t) => {
          if (listFilter === ALL_SCOPE) return true;
          return t.listId === listFilter;
        })
        .map((t) => ({
          id: t.id,
          description: t.title,
          doerName: t.doer?.name ?? user?.name ?? "Unassigned",
          status: t.status,
          listLabel: listNameFor(t.listId),
          rowType: "task" as const,
        }));
    }

    // ── TASK LIST SYSTEM (default) ──────────────────────────────────────────
    const taskListIds = new Set(lists.filter((l) => l.type === "task").map((l) => l.id));

    const base = isPrivileged
      ? allTasks.filter(
          (t) => t.status !== "Completed" && t.status !== "Cancelled" && t.dueDate === today
        )
      : allTasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled");

    return base
      .filter((t) => taskListIds.has(t.listId) || !t.listId)
      .filter((t) => {
        if (listFilter === ALL_SCOPE) return true;
        return t.listId === listFilter;
      })
      .map((t) => ({
        id: t.id,
        description: t.title,
        doerName: t.doer?.name ?? user?.name ?? "Unassigned",
        status: t.status,
        listLabel: listNameFor(t.listId),
        rowType: "task" as const,
      }));
  })();

  const directoryTitle = isPrivileged ? "Today's Pending Tasks" : "Pending Tasks";

  // ── DONE ACTION ───────────────────────────────────────────────────────────
  const [doneLoading, setDoneLoading] = useState<Set<string>>(new Set());

  async function handleMarkDone(row: DirRow) {
    setDoneLoading((prev) => new Set(prev).add(row.id));
    try {
      if (row.rowType === "checklist") {
        await api.post(`/checklist/instances/${row.id}/complete`);
        setChecklistToday((prev) => prev.filter((c) => c.id !== row.id));
      } else {
        await api.patch<Task>(`/tasks/${row.id}`, { status: "Completed" });
        setAllTasks((prev) =>
          prev.map((t) => (t.id === row.id ? { ...t, status: "Completed" } : t))
        );
      }
    } catch {
      // silently ignore — row stays visible so user can retry
    } finally {
      setDoneLoading((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  }

  const summary = dashboard?.summary;
  const overallPct =
    summary && summary.totalTasks > 0
      ? Math.round((summary.completed / summary.totalTasks) * 100)
      : 0;

  const kpis = [
    { label: "Total Tasks", value: summary?.totalTasks ?? 0, color: "text-on-surface" },
    { label: "Completed", value: summary?.completed ?? 0, color: "text-on-surface" },
    { label: "Overdue", value: summary?.overdue ?? 0, color: "text-error" },
    { label: "Pending", value: summary?.pending ?? 0, color: "text-on-surface-variant" },
  ];

  // Show second dropdown for task-list AND checklist (both have named lists)
  const showListDropdown = systemFilter === "task-list" || systemFilter === "checklist";

  return (
    <>
      <MobileHeader />
      <SideNav active="dashboard" />

      <div className="md:ml-64 flex flex-col min-h-screen bg-background">
        {/* TopNavBar */}
        <header className="hidden md:flex justify-between items-center h-16 w-full px-container-padding sticky top-0 z-30 border-b-2 border-on-surface bg-surface text-primary">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 font-headline-md text-headline-md">
              <span className="text-on-surface font-bold border-b-2 border-on-surface pb-0.5">
                Dashboard
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isAdmin && (
              <>
                <button
                  onClick={() => exportTasksToCsv(allTasks)}
                  disabled={allTasks.length === 0}
                  className="border-2 border-on-surface bg-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-surface hover:bg-primary transition-colors disabled:opacity-50"
                >
                  Export Report (CSV)
                </button>
              </>
            )}
            <div className="flex items-center gap-3">
              <a
                href="/help-ticket"
                className="border-2 border-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
              >
                Help Ticket
              </a>
              {isAdmin && (
                <a
                  href="/settings"
                  className="border-2 border-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
                >
                  Settings
                </a>
              )}
              <button
                onClick={logout}
                className="border-2 border-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface hover:bg-on-surface hover:text-surface transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-container-padding">
          <div className="max-w-[1440px] mx-auto grid grid-cols-12 gap-4 md:gap-gutter">
            {error && (
              <div className="col-span-12">
                <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">
                  {error}
                </p>
              </div>
            )}

            {/* Hero Metric */}
            <div className="col-span-12 bg-on-surface text-inverse-on-surface border-2 border-on-surface p-6 md:p-stack-lg flex flex-col justify-center relative overflow-hidden group">
              <div className="absolute -right-10 -top-10 w-64 h-64 border-4 border-surface/10 rounded-full opacity-20 pointer-events-none group-hover:scale-110 transition-transform duration-700" />
              <span className="font-label-sm text-label-sm uppercase tracking-widest text-surface-variant mb-stack-md relative z-10">
                System Status
              </span>
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-xl md:text-headline-xl text-surface-container-lowest relative z-10">
                {loading ? "Loading..." : `${overallPct}% Overall Completion`}
              </h2>
            </div>

            {/* KPI Grid */}
            <div className="col-span-12 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-gutter">
              {kpis.map((kpi) => (
                <div
                  key={kpi.label}
                  className="bg-surface border-2 border-on-surface p-stack-md flex flex-col justify-between hover:bg-surface-container-lowest transition-colors"
                >
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase border-b-2 border-on-surface pb-2 mb-4">
                    {kpi.label}
                  </span>
                  <div className={`font-data-mono text-data-mono text-4xl font-bold ${kpi.color}`}>
                    {String(kpi.value).padStart(2, "0")}
                  </div>
                </div>
              ))}
            </div>

            {/* Task Directory Table */}
            <div className="col-span-12 bg-surface border-2 border-on-surface flex flex-col">
              {/* Header with dual filters */}
              <div className="bg-surface-container-low border-b-2 border-on-surface p-stack-md flex flex-wrap justify-between items-center gap-3">
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  {directoryTitle}
                </h3>
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Filter 1: System Type */}
                  <select
                    id="system-filter"
                    value={systemFilter}
                    onChange={(e) => handleSystemChange(e.target.value as SystemType)}
                    className="border-2 border-on-surface bg-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
                  >
                    {SYSTEM_OPTIONS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>

                  {/* Filter 2: Specific List (for Task List AND Checklist systems) */}
                  {systemFilter === "task-list" && (
                    <select
                      id="list-filter"
                      value={listFilter}
                      onChange={(e) => setListFilter(e.target.value)}
                      className="border-2 border-on-surface bg-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
                    >
                      <option value={ALL_SCOPE}>All Task Lists</option>
                      {taskListOptions.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {systemFilter === "checklist" && (
                    <select
                      id="checklist-filter"
                      value={listFilter}
                      onChange={(e) => setListFilter(e.target.value)}
                      className="border-2 border-on-surface bg-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
                    >
                      <option value={ALL_SCOPE}>All Checklists</option>
                      <option value={OFFICE_CL}>OFFICE CL</option>
                      {checklistListOptions.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name.replace(/CHECKLIST/i, "CL").replace(/SIR\s*/i, "").trim()}
                        </option>
                      ))}
                    </select>
                  )}

                  <a
                    href="/task-list"
                    className="font-label-sm text-label-sm uppercase border-2 border-on-surface px-4 py-2 hover:bg-on-surface hover:text-on-primary transition-colors"
                  >
                    View All
                  </a>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b-2 border-on-surface">
                      <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface">
                        Description
                      </th>
                      <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface">
                        Doer
                      </th>
                      <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface text-center">
                        List
                      </th>
                      <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="font-body-md text-body-md text-on-surface">
                    {!loading && directoryRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                          {isPrivileged ? "Nothing pending today. 🎉" : "Nothing pending. 🎉"}
                        </td>
                      </tr>
                    )}
                    {directoryRows.map((t) => (
                      <tr
                        key={t.id}
                        className="border-b border-outline-variant last:border-b-0 hover:bg-surface-container-lowest transition-colors"
                      >
                        <td className="py-4 px-4 font-medium">{t.description}</td>
                        <td className="py-4 px-4 text-on-surface-variant">
                          {t.doerName || "Unassigned"}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="font-label-sm text-label-sm uppercase text-on-surface-variant border border-on-surface-variant px-2 py-0.5">
                            {t.listLabel}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={() => handleMarkDone(t)}
                            disabled={doneLoading.has(t.id)}
                            className="border-2 border-on-surface bg-on-surface text-surface font-label-sm text-label-sm uppercase px-4 py-1.5 hover:bg-primary hover:border-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {doneLoading.has(t.id) ? "..." : "Done"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardInner />
    </AuthGuard>
  );
}
