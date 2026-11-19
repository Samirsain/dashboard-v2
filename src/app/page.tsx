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
import { useConfirm } from "@/components/ConfirmDialog";
import { canAccessAllTasks, canManageDoers, canManageWorkflow } from "@/lib/access";
import ReviseTaskModal from "@/components/ReviseTaskModal";
import CreateTaskModal from "@/components/CreateTaskModal";
import CreateChecklistModal from "@/components/CreateChecklistModal";
import StartWorkflowInstanceModal from "@/components/StartWorkflowInstanceModal";
import { isOrphanedTask } from "@/lib/types";
import type {
  ChecklistInstance,
  ChecklistTemplate,
  Doer,
  DashboardSummary,
  List,
  Task,
  Ticket,
  WorkflowFieldValue,
  WorkflowStepEvent,
  WorkflowTemplate,
} from "@/lib/types";

/** One of the signed-in user's own workflow steps, from GET /workflow/my-steps. */
type MyWorkflowStep = {
  instanceId: string;
  instanceTitle: string;
  templateName: string;
  fieldValues: WorkflowFieldValue[];
  isMyTurn: boolean;
  doerName: string;
  step: WorkflowStepEvent;
};

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
  const isAdmin = user?.role === "MD" || user?.role === "PC";
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [pendingChecklist, setPendingChecklist] = useState<ChecklistInstance[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [doers, setDoers] = useState<Doer[]>([]);
  const [taskToRevise, setTaskToRevise] = useState<Task | null>(null);
  const [hasPendingTickets, setHasPendingTickets] = useState(false);
  // A workflow step is a different shape from a TASKLIST row (no dueDate/
  // priority — it has Planned/Actual/Status instead), so it gets its own
  // section here rather than being forced into the Pending Tasks table.
  const [myWorkflowSteps, setMyWorkflowSteps] = useState<MyWorkflowStep[]>([]);
  // The row whose Done/Send Back is in flight — disables it so a second tap
  // can't fire a duplicate request, and shows that something is happening.
  const [busyKey, setBusyKey] = useState<string | null>(null);
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
  // Starting a workflow run isn't a "create task" in the TASKLIST sense, but
  // it's the same "I need to kick something off" moment for whoever manages
  // workflows, so it lives in the same picker rather than sending them to a
  // different page first.
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplate[]>([]);
  const [showStartWorkflow, setShowStartWorkflow] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // GET /checklist/today creates today's checklist rows. The pending list
      // and the KPI summary (which also generates) must wait for it — run in
      // parallel they'd miss today's rows or race into duplicates — but
      // nothing else depends on it, so everything else starts right away
      // instead of queueing behind it.
      const generated = api.get<ChecklistInstance[]>("/checklist/today").catch(() => []);
      const [summaryData, tasks, listsData, checklist, templateData, doerData, ticketData, workflowSteps, workflowTemplateData] =
        await Promise.all([
          // Only the four KPI numbers are shown, and only to MD/PC; the full
          // /dashboard payload also scans the whole activity log.
          isPrivileged
            ? generated.then(() => api.get<DashboardSummary>("/dashboard/summary"))
            : Promise.resolve(null),
          api.get<Task[]>("/tasks"),
          api.get<List[]>("/lists").catch(() => [] as List[]),
          generated.then(() =>
            api
              .get<ChecklistInstance[]>("/checklist/instances?status=Pending")
              .catch(() => [] as ChecklistInstance[])
          ),
          api.get<ChecklistTemplate[]>("/checklist/templates").catch(() => [] as ChecklistTemplate[]),
          api.get<Doer[]>("/users").catch(() => [] as Doer[]),
          api.get<Ticket[]>("/tickets").catch(() => [] as Ticket[]),
          api.get<MyWorkflowStep[]>("/workflow/my-steps").catch(() => [] as MyWorkflowStep[]),
          api.get<WorkflowTemplate[]>("/workflow/templates").catch(() => [] as WorkflowTemplate[]),
        ]);
      setSummary(summaryData);
      setLists(listsData);
      setAllTasks(tasks);
      setPendingChecklist(checklist);
      setTemplates(templateData);
      setDoers(doerData);
      setHasPendingTickets((ticketData ?? []).some((t) => t.status !== "Completed"));
      setWorkflowTemplates(workflowTemplateData);
      setMyWorkflowSteps(workflowSteps);
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

  const confirm = useConfirm();

  async function handleTaskDone(id: string) {
    if (!(await confirm({ title: "Mark as done?", message: allTasks.find((t) => t.id === id)?.title }))) return;
    setBusyKey(id);
    try {
      await api.patch(`/tasks/${id}`, { status: "Completed" });
      setAllTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "Completed" } : t)));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to update task.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleChecklistDone(id: string) {
    if (!(await confirm({ title: "Mark as done?", message: pendingChecklist.find((c) => c.id === id)?.taskName }))) return;
    setBusyKey(id);
    try {
      await api.post(`/checklist/instances/${id}/complete`);
      setPendingChecklist((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to complete checklist item.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleWorkflowAction(row: MyWorkflowStep, action: "complete" | "reject") {
    let reason = "";
    if (action === "reject") {
      // A bounce with no explanation just moves the confusion to whoever
      // picks it back up next — they need to know what to fix.
      const input = prompt(`Why is "${row.step.what}" being sent back? This will be shown to whoever reworks it.`);
      if (input === null) return; // cancelled
      reason = input.trim();
      if (!reason) {
        alert("Please say why this is being sent back.");
        return;
      }
    } else if (!(await confirm({ title: "Mark step as done?", message: row.step.what }))) {
      return;
    }
    const key = `${row.instanceId}:${row.step.stepNo}`;
    setBusyKey(key);
    try {
      await api.post(
        `/workflow/instances/${row.instanceId}/steps/${row.step.stepNo}/${action}`,
        action === "reject" ? { reason } : undefined
      );
      const refreshed = await api.get<MyWorkflowStep[]>("/workflow/my-steps").catch(() => myWorkflowSteps);
      setMyWorkflowSteps(refreshed);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not update this step.");
    } finally {
      setBusyKey(null);
    }
  }

  const myWorkflowTurn = myWorkflowSteps.filter((r) => r.isMyTurn);

  const isPrivileged = user?.role === "MD" || user?.role === "PC";
  const canCreateTasks = canAccessAllTasks(user);
  const assignableDoers = doers.filter((d) => d.role === "Doer" || d.role === "MD" || d.role === "PC");
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
  // (Checklist) + a doer's own workflow steps — as one uniform row: what it
  // is, which system, its type, due date, and the action to take. A workflow
  // step is shaped nothing like a Task (Planned/Actual/Status, no priority),
  // so it's normalised down to just what this table needs rather than
  // getting a whole separate section that duplicates this same list.
  type PendRow = {
    id: string;
    kind: "task" | "checklist" | "workflow";
    task: string;
    systemName: string;
    systemType: string;
    dueDate: string;
    taskObj?: Task;
    workflowRow?: MyWorkflowStep;
    assignedDoerId?: string;
  };

  /** ISO timestamp -> local YYYY-MM-DD, matching how `today` below is computed. */
  function isoToLocalDate(iso: string): string {
    return iso ? new Date(iso).toLocaleDateString("en-CA") : "";
  }

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
    ...myWorkflowTurn
      .map((r) => ({
        id: `${r.instanceId}:${r.step.stepNo}`,
        kind: "workflow" as const,
        task: r.step.what,
        systemName: r.templateName,
        systemType: "Workflow",
        dueDate: isoToLocalDate(r.step.planned),
        workflowRow: r,
        assignedDoerId: user?.id,
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


  const kpis = [
    { label: "Total Tasks", short: "Total", value: summary?.totalTasks ?? 0 },
    { label: "Completed", short: "Done", value: summary?.completed ?? 0 },
    { label: "Overdue", value: summary?.overdue ?? 0 },
    { label: "Pending", value: summary?.pending ?? 0 },
  ];

  return (
    <>
      <MobileHeader ticketAlert={hasPendingTickets} />
      <SideNav active="dashboard" />

      <PageBody>
        {/* Phones keep only the primary action here: Help Ticket moves to an
            icon (with the pending-ticket dot) in the top bar, Settings and
            Logout live in the More menu, and CSV export is a desk task. */}
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
                <Button
                  className="max-md:hidden"
                  onClick={() => exportTasksToCsv(allTasks)}
                  disabled={allTasks.length === 0}
                >
                  Export CSV
                </Button>
              )}
              <Link
                href="/help-ticket"
                className={
                  hasPendingTickets
                    ? `${buttonClass("secondary", "md", "max-md:hidden")} border-2 border-red-600 font-bold animate-blink-red`
                    : buttonClass("secondary", "md", "max-md:hidden")
                }
              >
                Help Ticket
              </Link>
              {canManageDoers(user) && (
                <Link href="/settings" className={buttonClass("secondary", "md", "max-md:hidden")}>
                  Settings
                </Link>
              )}
              <Button variant="ghost" className="max-md:hidden" onClick={logout}>
                Logout
              </Button>
            </>
          }
        />

        {error && <ErrorNote>{error}</ErrorNote>}

        {/* KPIs — admin/manager only */}
        {isPrivileged && (
          <div className="grid grid-cols-2 gap-2 max-md:grid-cols-4 lg:grid-cols-4">
            {kpis.map((kpi) => (
              <Stat key={kpi.label} label={kpi.label} shortLabel={kpi.short} value={kpi.value} />
            ))}
          </div>
        )}

        {/* Pending Tasks & Checklists — all open items (tasks + checklist), All / Today */}
        {/* Phones drop the card frame: the rows below are cards themselves. */}
        <Card
          className="max-md:border-0 max-md:bg-transparent max-md:[&>div:first-child]:border-0 max-md:[&>div:first-child]:px-0 max-md:[&>div:first-child]:pt-1"
          title={`Pending Tasks & Checklists (${pendingRows.length})`}
          bodyClassName=""
          actions={
            <>
              {showDoerColumn && (
                <select
                  value={pendingDoerFilter}
                  onChange={(e) => setPendingDoerFilter(e.target.value)}
                  aria-label="Filter by doer"
                  className={`${fieldInlineClass} text-xs uppercase max-md:normal-case max-sm:min-w-0 max-sm:flex-1`}
                >
                  <option value="">All Doers</option>
                  {assignableDoers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
              {/* One joined All/Today toggle rather than two loose buttons. */}
              <div className="flex" role="group" aria-label="Show">
                {(["all", "today"] as const).map((f, i) => (
                  <Button
                    key={f}
                    variant={pendingFilter === f ? "primary" : "secondary"}
                    aria-pressed={pendingFilter === f}
                    className={`min-w-[64px] ${i > 0 ? "-ml-px" : ""}`}
                    onClick={() => setPendingFilter(f)}
                  >
                    {f === "all" ? "All" : "Today"}
                  </Button>
                ))}
              </div>
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
                  <th className={thClass}>Action</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {/* "Loading" only on the first fetch — a refresh after an edit
                    keeps the current rows on screen instead of blanking them. */}
                {loading && allPending.length === 0 && (
                  <StateRow colSpan={showDoerColumn ? 6 : 5}>Loading…</StateRow>
                )}
                {!loading && pendingRows.length === 0 && (
                  <StateRow colSpan={showDoerColumn ? 6 : 5}>
                    {pendingFilter === "today" ? "Nothing pending today. 🎉" : "Nothing pending. 🎉"}
                  </StateRow>
                )}
                {!(loading && allPending.length === 0) &&
                  pendingRows.map((r) => {
                    const overdue = isOverdue(r.dueDate);
                    const urgent =
                      !overdue &&
                      r.kind === "task" &&
                      (r.taskObj?.priority === "Urgent" || r.taskObj?.priority === "Critical");
                    return (
                      <tr
                        key={`${r.kind}-${r.id}`}
                        className={`${trClass} ${
                          overdue
                            ? "!bg-[#fecaca] hover:!bg-[#fca5a5] !text-black"
                            : urgent
                            ? "!bg-[#fef08a] hover:!bg-[#fde047] !text-black"
                            : ""
                        }`}
                      >
                        <td className={`${tdClass} min-w-[200px]`}>{r.task}</td>
                        <td data-meta className={`${tdClass} font-label-sm text-xs uppercase text-on-surface-variant`}>
                          {r.systemName}
                        </td>
                        <td data-meta className={`${tdClass} font-label-sm text-xs uppercase text-on-surface-variant`}>
                          {r.systemType}
                        </td>
                        {showDoerColumn && (
                          <td data-meta className={`${tdClass} text-on-surface-variant`}>
                            {r.kind === "task" && r.taskObj?.doer?.name ? (
                              r.taskObj.doer.name
                            ) : r.kind === "task" && r.taskObj && isOrphanedTask(r.taskObj) ? (
                              // Doer deleted — fall back to the name stored on the
                              // task rather than showing a raw ID.
                              <>
                                {r.taskObj.doerName || "—"}
                                <span className="ml-1.5 border border-error px-1 py-0.5 font-label-sm text-[10px] uppercase text-error">
                                  Unassigned
                                </span>
                              </>
                            ) : (
                              doers.find((d) => d.id === r.assignedDoerId)?.name || r.assignedDoerId || "—"
                            )}
                          </td>
                        )}
                        <td
                          data-aside
                          className={`${tdClass} whitespace-nowrap text-center font-data-mono text-xs ${overdue ? "font-bold" : ""}`}
                        >
                          {formatDMY(r.dueDate)}
                        </td>
                        <td data-actions className={tdClass}>
                          {/* Left-aligned so Done sits in the same spot on every row,
                              whether or not a Revise / Send Back follows it. */}
                          <div className="flex items-center gap-2">
                            {r.kind === "workflow" && r.workflowRow ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="max-md:order-2"
                                  disabled={busyKey === r.id}
                                  onClick={() => handleWorkflowAction(r.workflowRow!, "complete")}
                                >
                                  {busyKey === r.id ? "Saving…" : "Done"}
                                </Button>
                                {r.workflowRow.step.stepNo > 1 && (
                                  <Button
                                    size="sm"
                                    disabled={busyKey === r.id}
                                    onClick={() => handleWorkflowAction(r.workflowRow!, "reject")}
                                  >
                                    Send Back
                                  </Button>
                                )}
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="max-md:order-2"
                                  disabled={busyKey === r.id}
                                  onClick={() => (r.kind === "task" ? handleTaskDone(r.id) : handleChecklistDone(r.id))}
                                >
                                  {busyKey === r.id ? "Saving…" : "Done"}
                                </Button>
                                {r.kind === "task" && r.taskObj && (
                                  <Button size="sm" disabled={busyKey === r.id} onClick={() => setTaskToRevise(r.taskObj!)}>
                                    Revise
                                  </Button>
                                )}
                              </>
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
            {/* Starting a run of an existing workflow — not creating a new
                workflow template, that's a Workflow-page-only action. */}
            {canManageWorkflow(user) && (
              <Button
                fullWidth
                disabled={workflowTemplates.length === 0}
                className="justify-start text-left normal-case"
                onClick={() => {
                  setShowCreatePicker(false);
                  setShowStartWorkflow(true);
                }}
              >
                {workflowTemplates.length === 0
                  ? "Workflow — no workflows set up yet"
                  : "Workflow — start a run, fill in its details"}
              </Button>
            )}
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

      {showStartWorkflow && (
        <StartWorkflowInstanceModal
          templates={workflowTemplates}
          onClose={() => setShowStartWorkflow(false)}
          onStarted={() => {
            setShowStartWorkflow(false);
            load(); // the new run may already show up if it's assigned to me
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
