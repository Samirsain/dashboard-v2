"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { formatDMY } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import ReviseTaskModal from "@/components/ReviseTaskModal";
import CreateTaskModal from "@/components/CreateTaskModal";
import CreateChecklistModal from "@/components/CreateChecklistModal";
import type {
  ChecklistInstance,
  ChecklistTemplate,
  Doer,
  FullDashboard,
  List,
  Task,
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

/** First word of a list's name, uppercased — how the sidebar groups OFFICE/SAHIL TL+CL together. */
function listGroupKey(name: string): string {
  return name.trim().split(/\s+/)[0]?.toUpperCase() || "LIST";
}


function DashboardInner() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "Admin";
  const [dashboard, setDashboard] = useState<FullDashboard | null>(null);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [pendingChecklist, setPendingChecklist] = useState<ChecklistInstance[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [doers, setDoers] = useState<Doer[]>([]);
  const [taskToRevise, setTaskToRevise] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Pending Tasks filter: "all" = every open item (past/today/future);
  // "today" = only items due on today's date.
  const [pendingFilter, setPendingFilter] = useState<"all" | "today">("all");
  // Create-task flow: pick a type (Task List / Checklist) first, then show
  // the matching modal with that type's named lists (+ implicit Office) to
  // choose from.
  const [showCreatePicker, setShowCreatePicker] = useState(false);
  const [createMode, setCreateMode] = useState<"task" | "checklist" | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // Same as the Checklist page: hit /checklist/today first so any
      // active template still missing today's instance gets one generated —
      // keeps every page's pending-checklist view consistent.
      await api.get<ChecklistInstance[]>("/checklist/today").catch(() => []);
      const [dash, tasks, listsData, checklist, templateData, doerData] = await Promise.all([
        api.get<FullDashboard>("/dashboard"),
        api.get<Task[]>("/tasks"),
        api.get<List[]>("/lists").catch(() => [] as List[]),
        api
          .get<ChecklistInstance[]>("/checklist/instances?status=Pending")
          .catch(() => [] as ChecklistInstance[]),
        api.get<ChecklistTemplate[]>("/checklist/templates").catch(() => [] as ChecklistTemplate[]),
        api.get<Doer[]>("/users").catch(() => [] as Doer[]),
      ]);
      setDashboard(dash);
      setLists(listsData);
      setAllTasks(tasks);
      setPendingChecklist(checklist);
      setTemplates(templateData);
      setDoers(doerData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
  }, []);

  const templateListMap = new Map(templates.map((t) => [t.id, t.listId]));

  async function handleTaskDone(id: string) {
    try {
      await api.patch(`/tasks/${id}`, { status: "Completed" });
      setAllTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "Completed" } : t)));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to update task.");
    }
  }

  async function handleChecklistDone(id: string) {
    try {
      await api.post(`/checklist/instances/${id}/complete`);
      setPendingChecklist((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to complete checklist item.");
    }
  }

  const isPrivileged = user?.role === "Admin";
  const canCreateTasks = user?.role === "Admin";
  const assignableDoers = doers.filter((d) => d.role === "Doer" || d.role === "Admin");
  const taskLists = lists.filter((l) => l.type === "task");
  const checklistLists = lists.filter((l) => l.type === "checklist");
  const showDoerColumn =
    user?.role === "Admin" || user?.employeeCode?.toUpperCase() === "TM03";
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local

  /** "Office" for no list, else the list's group name (e.g. "SAHIL"). */
  function listLabelFor(listId: string): string {
    if (!listId) return "Office";
    const list = lists.find((l) => l.id === listId);
    return list ? listGroupKey(list.name) : "Office";
  }

  // Every open item across the systems — tasks (Task List) + checklist items
  // (Checklist) — as one uniform row: what it is, which system (Office/Sahil),
  // its type, due date, and the action to take.
  type PendRow = {
    id: string;
    kind: "task" | "checklist";
    task: string;
    systemName: string;
    systemType: string;
    dueDate: string;
    taskObj?: Task;
    assignedDoerId?: string;
  };

  const allPending: PendRow[] = [
    ...allTasks
      .filter((t) => t.status !== "Completed" && t.status !== "Cancelled")
      .map((t) => ({
        id: t.id,
        kind: "task" as const,
        task: t.title,
        systemName: listLabelFor(t.listId),
        systemType: "Task List",
        dueDate: t.dueDate,
        taskObj: t,
        assignedDoerId: t.assignedDoerId,
      })),
    ...pendingChecklist
      .filter((c) => c.status !== "Completed")
      .map((c) => ({
        id: c.id,
        kind: "checklist" as const,
        task: c.taskName,
        systemName: listLabelFor(templateListMap.get(c.templateId) ?? ""),
        systemType: "Checklist",
        dueDate: c.date,
        assignedDoerId: c.assignedDoerId,
      })),
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  /** An item is overdue if it's still open and its due date is before today. */
  const isOverdue = (dueDate: string) => !!dueDate && dueDate < today;

  // "today" view = today's items PLUS every overdue (past, still-pending) item.
  // allPending is sorted by dueDate ascending, so overdue rows (earlier dates)
  // naturally list before today's rows.
  const pendingRows =
    pendingFilter === "today"
      ? allPending.filter((r) => r.dueDate === today || isOverdue(r.dueDate))
      : allPending;

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

          <div className="flex items-center gap-3">
            {canCreateTasks && (
              <button
                onClick={() => setShowCreatePicker(true)}
                className="border-2 border-on-surface bg-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-surface hover:bg-primary transition-colors"
              >
                + Create Task
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => exportTasksToCsv(allTasks)}
                disabled={allTasks.length === 0}
                className="border-2 border-on-surface bg-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-surface hover:bg-primary transition-colors disabled:opacity-50"
              >
                Export Report (CSV)
              </button>
            )}
            <Link
              href="/help-ticket"
              className="border-2 border-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
            >
              Help Ticket
            </Link>
            {isAdmin && (
              <Link
                href="/settings"
                className="border-2 border-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
              >
                Settings
              </Link>
            )}
            <button
              onClick={logout}
              className="border-2 border-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface hover:bg-on-surface hover:text-surface transition-colors"
            >
              Logout
            </button>
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

            {/* System Status + KPIs — admin/manager only */}
            {isPrivileged && (
              <>
                <div className="col-span-12 bg-on-surface text-inverse-on-surface border-2 border-on-surface p-6 md:p-stack-lg flex flex-col justify-center relative overflow-hidden group">
                  <div className="absolute -right-10 -top-10 w-64 h-64 border-4 border-surface/10 rounded-full opacity-20 pointer-events-none group-hover:scale-110 transition-transform duration-700" />
                  <span className="font-label-sm text-label-sm uppercase tracking-widest text-surface-variant mb-stack-md relative z-10">
                    System Status
                  </span>
                  <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-xl md:text-headline-xl text-surface-container-lowest relative z-10">
                    {loading ? "Loading..." : `${overallPct}% Overall Completion`}
                  </h2>
                </div>

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
              </>
            )}

            {/* Pending Tasks — all open items (tasks + checklist), All / Today */}
            <div className="col-span-12 bg-surface border-2 border-on-surface flex flex-col">
              <div className="bg-surface-container-low border-b-2 border-on-surface p-stack-md flex flex-wrap justify-between items-center gap-3">
                <h3 className="font-headline-md text-headline-md text-on-surface">Pending Tasks</h3>
                <div className="flex items-center gap-2">
                  {canCreateTasks && (
                    <button
                      onClick={() => setShowCreatePicker(true)}
                      className="md:hidden px-3 py-1.5 border-2 border-on-surface bg-on-surface text-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors"
                    >
                      + Create
                    </button>
                  )}
                  {(["all", "today"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setPendingFilter(f)}
                      className={`px-3 py-1.5 border-2 border-on-surface font-label-sm text-label-sm uppercase transition-colors ${
                        pendingFilter === f
                          ? "bg-on-surface text-surface"
                          : "text-on-surface hover:bg-surface-container"
                      }`}
                    >
                      {f === "all" ? "All Tasks" : "Today"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[720px]">
                  <thead>
                    <tr className="bg-surface-container-low border-b-2 border-on-surface">
                      <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface">Task</th>
                      <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface">System Name</th>
                      <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface">System Type</th>
                      {showDoerColumn && (
                        <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface">Doer Name</th>
                      )}
                      <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface text-center">Due Date</th>
                      <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-md text-body-md text-on-surface">
                    {loading && (
                      <tr>
                        <td colSpan={showDoerColumn ? 6 : 5} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                          Loading...
                        </td>
                      </tr>
                    )}
                    {!loading && pendingRows.length === 0 && (
                      <tr>
                        <td colSpan={showDoerColumn ? 6 : 5} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                          {pendingFilter === "today" ? "Nothing pending today. 🎉" : "Nothing pending. 🎉"}
                        </td>
                      </tr>
                    )}
                    {pendingRows.map((r) => {
                      const overdue = isOverdue(r.dueDate);
                      const urgent =
                        !overdue &&
                        r.kind === "task" &&
                        (r.taskObj?.priority === "Urgent" || r.taskObj?.priority === "Critical");
                      return (
                      <tr
                        key={`${r.kind}-${r.id}`}
                        className={`border-b border-outline-variant last:border-b-0 transition-colors ${
                          overdue
                            ? "bg-red-50 border-l-4 border-l-red-600 hover:bg-red-100"
                            : urgent
                              ? "bg-yellow-50 border-l-4 border-l-yellow-500 hover:bg-yellow-100"
                              : "hover:bg-surface-container-lowest"
                        }`}
                      >
                        <td className={`py-3 px-4 font-medium ${overdue ? "text-red-700" : ""}`}>
                          {r.task}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-label-sm text-label-sm uppercase text-on-surface-variant border border-on-surface-variant px-2 py-0.5">
                            {r.systemName}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface-variant">
                          {r.systemType}
                        </td>
                        {showDoerColumn && (
                          <td className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface-variant">
                            {r.kind === "task" && r.taskObj?.doer?.name
                              ? r.taskObj.doer.name
                              : doers.find((d) => d.id === r.assignedDoerId)?.name ||
                                r.assignedDoerId ||
                                "—"}
                          </td>
                        )}
                        <td
                          className={`py-3 px-4 text-center font-data-mono text-data-mono whitespace-nowrap ${
                            overdue ? "text-red-700 font-bold" : ""
                          }`}
                        >
                          {formatDMY(r.dueDate)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() =>
                                r.kind === "task" ? handleTaskDone(r.id) : handleChecklistDone(r.id)
                              }
                              className="px-3 py-1 bg-on-surface text-surface-container-lowest font-label-sm text-label-sm uppercase hover:bg-primary transition-colors"
                            >
                              Done
                            </button>
                            {r.kind === "task" && r.taskObj && (
                              <button
                                onClick={() => setTaskToRevise(r.taskObj!)}
                                className="px-3 py-1 border-2 border-on-surface text-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors"
                              >
                                Revise
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>

      {taskToRevise && (
        <ReviseTaskModal
          task={taskToRevise}
          onClose={() => setTaskToRevise(null)}
          onRevised={() => {
            setTaskToRevise(null);
            load(); // refresh so the new due date shows
          }}
        />
      )}

      {showCreatePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-surface-container-lowest border-2 border-on-surface">
            <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md">
              <h3 className="font-headline-md text-headline-md text-on-surface uppercase">
                Create Task
              </h3>
              <button
                onClick={() => setShowCreatePicker(false)}
                className="text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase"
              >
                Close
              </button>
            </div>
            <div className="p-stack-lg flex flex-col gap-stack-md">
              <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Add it to which system?
              </p>
              <button
                onClick={() => {
                  setShowCreatePicker(false);
                  setCreateMode("task");
                }}
                className="px-4 py-3 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors text-left"
              >
                Task List — one-time or recurring tasks
              </button>
              <button
                onClick={() => {
                  setShowCreatePicker(false);
                  setCreateMode("checklist");
                }}
                className="px-4 py-3 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors text-left"
              >
                Checklist — repeating checklist item
              </button>
            </div>
          </div>
        </div>
      )}

      {createMode === "task" && (
        <CreateTaskModal
          doers={assignableDoers}
          lists={taskLists}
          onClose={() => setCreateMode(null)}
          onCreated={(task) => {
            const doer = assignableDoers.find((d) => d.id === task.assignedDoerId) ?? null;
            setAllTasks((prev) => [{ ...task, doer }, ...prev]);
            setCreateMode(null);
          }}
        />
      )}

      {createMode === "checklist" && (
        <CreateChecklistModal
          doers={assignableDoers}
          lists={checklistLists}
          onClose={() => setCreateMode(null)}
          onCreated={() => {
            setCreateMode(null);
            load(); // refresh so the new checklist item shows if due today
          }}
        />
      )}
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
