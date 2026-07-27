"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import Stat from "@/components/Stat";
import {
  Button,
  Card,
  ErrorNote,
  PageBody,
  PageHeader,
  Modal,
  StateRow,
  TableWrap,
  buttonClass,
  fieldInlineClass,
  tableClass,
  tdClass,
  thClass,
  theadClass,
  trClass,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDMY } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { canAccessAllTasks } from "@/lib/access";
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
  Ticket,
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
  const [hasPendingTickets, setHasPendingTickets] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Pending Tasks filter: "all" = every open item (past/today/future);
  // "today" = only items due on today's date.
  const [pendingFilter, setPendingFilter] = useState<"all" | "today">("all");
  // Pending Tasks doer filter: "" = every doer.
  const [pendingDoerFilter, setPendingDoerFilter] = useState("");
  // Create-task flow: pick a type (Task List / Checklist) first, then show
  // the matching modal with that type's named lists (+ implicit Office) to
  // choose from.
  const [showCreatePicker, setShowCreatePicker] = useState(false);
  const [createMode, setCreateMode] = useState<"task" | "checklist" | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      await api.get<ChecklistInstance[]>("/checklist/today").catch(() => []);
      const [dash, tasks, listsData, checklist, templateData, doerData, ticketData] = await Promise.all([
        api.get<FullDashboard>("/dashboard"),
        api.get<Task[]>("/tasks"),
        api.get<List[]>("/lists").catch(() => [] as List[]),
        api
          .get<ChecklistInstance[]>("/checklist/instances?status=Pending")
          .catch(() => [] as ChecklistInstance[]),
        api.get<ChecklistTemplate[]>("/checklist/templates").catch(() => [] as ChecklistTemplate[]),
        api.get<Doer[]>("/users").catch(() => [] as Doer[]),
        api.get<Ticket[]>("/tickets").catch(() => [] as Ticket[]),
      ]);
      setDashboard(dash);
      setLists(listsData);
      setAllTasks(tasks);
      setPendingChecklist(checklist);
      setTemplates(templateData);
      setDoers(doerData);
      setHasPendingTickets((ticketData ?? []).some((t) => t.status !== "Completed"));
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
  const canCreateTasks = canAccessAllTasks(user);
  const assignableDoers = doers.filter((d) => d.role === "Doer" || d.role === "Admin");
  const taskLists = lists.filter((l) => l.type === "task");
  const checklistLists = lists.filter((l) => l.type === "checklist");
  const showDoerColumn = canAccessAllTasks(user);
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
  const pendingRows = allPending
    .filter((r) => (pendingFilter === "today" ? r.dueDate === today || isOverdue(r.dueDate) : true))
    .filter((r) => (pendingDoerFilter ? r.assignedDoerId === pendingDoerFilter : true));

  const summary = dashboard?.summary;

  const kpis = [
    { label: "Total Tasks", value: summary?.totalTasks ?? 0 },
    { label: "Completed", value: summary?.completed ?? 0 },
    { label: "Overdue", value: summary?.overdue ?? 0 },
    { label: "Pending", value: summary?.pending ?? 0 },
  ];

  return (
    <>
      <MobileHeader />
      <SideNav active="dashboard" />

      <PageBody>
        <PageHeader
          title="Dashboard"
          actions={
            <>
              {canCreateTasks && (
                <Button variant="primary" onClick={() => setShowCreatePicker(true)}>
                  + Create Task
                </Button>
              )}
              {isAdmin && (
                <Button onClick={() => exportTasksToCsv(allTasks)} disabled={allTasks.length === 0}>
                  Export CSV
                </Button>
              )}
              <Link
                href="/help-ticket"
                className={
                  hasPendingTickets
                    ? `${buttonClass("secondary")} border-2 border-red-600 font-bold animate-blink-red`
                    : buttonClass("secondary")
                }
              >
                Help Ticket
              </Link>
              {isAdmin && (
                <Link href="/settings" className={buttonClass("secondary")}>
                  Settings
                </Link>
              )}
              <Button variant="ghost" onClick={logout}>
                Logout
              </Button>
            </>
          }
        />

        {error && <ErrorNote>{error}</ErrorNote>}

        {/* KPIs — admin/manager only */}
        {isPrivileged && (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {kpis.map((kpi) => (
              <Stat key={kpi.label} label={kpi.label} value={kpi.value} />
            ))}
          </div>
        )}

        {/* Pending Tasks & Checklists — all open items (tasks + checklist), All / Today */}
        <Card
          title={`Pending Tasks & Checklists (${pendingRows.length})`}
          bodyClassName=""
          actions={
            <>
              {showDoerColumn && (
                <select
                  value={pendingDoerFilter}
                  onChange={(e) => setPendingDoerFilter(e.target.value)}
                  aria-label="Filter by doer"
                  className={`${fieldInlineClass} text-xs uppercase`}
                >
                  <option value="">All Doers</option>
                  {assignableDoers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
              {(["all", "today"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={pendingFilter === f ? "primary" : "secondary"}
                  aria-pressed={pendingFilter === f}
                  onClick={() => setPendingFilter(f)}
                >
                  {f === "all" ? "All" : "Today"}
                </Button>
              ))}
            </>
          }
        >
          <TableWrap className="border-0">
            <table className={`${tableClass} min-w-[720px]`}>
              <thead className={theadClass}>
                <tr>
                  <th className={thClass}>Task</th>
                  <th className={thClass}>System</th>
                  <th className={thClass}>Type</th>
                  {showDoerColumn && <th className={thClass}>Doer</th>}
                  <th className={`${thClass} text-center`}>Due Date</th>
                  <th className={`${thClass} text-center`}>Action</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {loading && <StateRow colSpan={showDoerColumn ? 6 : 5}>Loading…</StateRow>}
                {!loading && pendingRows.length === 0 && (
                  <StateRow colSpan={showDoerColumn ? 6 : 5}>
                    {pendingFilter === "today" ? "Nothing pending today. 🎉" : "Nothing pending. 🎉"}
                  </StateRow>
                )}
                {!loading &&
                  pendingRows.map((r) => {
                    const overdue = isOverdue(r.dueDate);
                    const urgent =
                      !overdue &&
                      r.kind === "task" &&
                      (r.taskObj?.priority === "Urgent" || r.taskObj?.priority === "Critical");
                    return (
                      <tr
                        key={`${r.kind}-${r.id}`}
                        className={`${trClass} ${urgent ? "!bg-[#fef08a] hover:!bg-[#fde047] !text-black" : ""}`}
                      >
                        <td className={`${tdClass} min-w-[200px]`}>{r.task}</td>
                        <td className={`${tdClass} font-label-sm text-xs uppercase text-on-surface-variant`}>
                          {r.systemName}
                        </td>
                        <td className={`${tdClass} font-label-sm text-xs uppercase text-on-surface-variant`}>
                          {r.systemType}
                        </td>
                        {showDoerColumn && (
                          <td className={`${tdClass} text-on-surface-variant`}>
                            {r.kind === "task" && r.taskObj?.doer?.name
                              ? r.taskObj.doer.name
                              : doers.find((d) => d.id === r.assignedDoerId)?.name || r.assignedDoerId || "—"}
                          </td>
                        )}
                        <td className={`${tdClass} whitespace-nowrap text-center font-data-mono text-xs`}>
                          {formatDMY(r.dueDate)}
                          {overdue && <span className="ml-1 text-error">(overdue)</span>}
                          {urgent && (
                            <span className="ml-1 text-on-surface-variant">
                              ({r.taskObj?.priority?.toLowerCase()})
                            </span>
                          )}
                        </td>
                        <td className={tdClass}>
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => (r.kind === "task" ? handleTaskDone(r.id) : handleChecklistDone(r.id))}
                            >
                              Done
                            </Button>
                            {r.kind === "task" && r.taskObj && (
                              <Button size="sm" onClick={() => setTaskToRevise(r.taskObj!)}>
                                Revise
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      </PageBody>

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
        <Modal title="Create Task" size="sm" onClose={() => setShowCreatePicker(false)}>
          <div className="flex flex-col gap-3">
            <p className="font-label-sm text-xs uppercase text-on-surface-variant">
              Add it to which system?
            </p>
            <Button
              fullWidth
              className="justify-start text-left normal-case"
              onClick={() => {
                setShowCreatePicker(false);
                setCreateMode("task");
              }}
            >
              Task List — one-time or recurring tasks
            </Button>
            <Button
              fullWidth
              className="justify-start text-left normal-case"
              onClick={() => {
                setShowCreatePicker(false);
                setCreateMode("checklist");
              }}
            >
              Checklist — repeating checklist item
            </Button>
          </div>
        </Modal>
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
