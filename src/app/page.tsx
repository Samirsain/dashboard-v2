"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import Stat from "@/components/Stat";
import { api, ApiError } from "@/lib/api";
import { formatDMY, formatPct } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { canAccessAllTasks } from "@/lib/access";
import { addDays, mondayOf, sundayOf } from "@/lib/week";
import { getTaskCategory, CATEGORY_LABEL } from "@/lib/scoring";
import ReviseTaskModal from "@/components/ReviseTaskModal";
import CreateTaskModal from "@/components/CreateTaskModal";
import CreateChecklistModal from "@/components/CreateChecklistModal";
import type {
  ChecklistInstance,
  ChecklistTemplate,
  DgmaxWeeklySummary,
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
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const weekEnd = sundayOf(weekStart);
  const [weekSummary, setWeekSummary] = useState<DgmaxWeeklySummary | null>(null);
  const [weekLoading, setWeekLoading] = useState(false);
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

  async function fetchWeekSummary(start: string, end: string) {
    setWeekLoading(true);
    try {
      const summary = await api.get<DgmaxWeeklySummary>(`/performance/dgmax?from=${start}&to=${end}`);
      setWeekSummary(summary);
    } catch {
      setWeekSummary(null);
    } finally {
      setWeekLoading(false);
    }
  }

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

  useEffect(() => {
    queueMicrotask(() => {
      fetchWeekSummary(weekStart, weekEnd);
    });
  }, [weekStart, weekEnd]);

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

  // This week's DGMAX score. Everyone sees their own; privileged users also
  // get the whole team's scoreboard.
  const myScore = weekSummary?.summaries.find((s) => s.doerId === user?.id) ?? null;
  const weekRange = weekSummary
    ? `${formatDMY(weekSummary.fromDate)} — ${formatDMY(weekSummary.toDate)}`
    : "";

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
                className="border border-on-surface bg-on-surface px-3 py-1.5 font-label-sm text-xs uppercase text-surface transition-colors"
              >
                + Create Task
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => exportTasksToCsv(allTasks)}
                disabled={allTasks.length === 0}
                className="border border-on-surface bg-on-surface px-3 py-1.5 font-label-sm text-xs uppercase text-surface transition-colors disabled:opacity-50"
              >
                Export Report (CSV)
              </button>
            )}
            <Link
              href="/help-ticket"
              className={
                hasPendingTickets
                  ? "border-2 border-red-600 px-3 py-1.5 font-label-sm text-label-sm uppercase font-bold animate-blink-red transition-colors"
                  : "border border-on-surface px-3 py-1.5 font-label-sm text-xs uppercase text-on-surface hover:bg-surface-container transition-colors"
              }
            >
              Help Ticket
            </Link>
            {isAdmin && (
              <Link
                href="/settings"
                className="border border-on-surface px-3 py-1.5 font-label-sm text-xs uppercase text-on-surface hover:bg-surface-container transition-colors"
              >
                Settings
              </Link>
            )}
            <button
              onClick={logout}
              className="border border-on-surface px-3 py-1.5 font-label-sm text-xs uppercase text-on-surface hover:bg-on-surface hover:text-surface transition-colors"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Dashboard Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-container-padding">
          <div className="max-w-[1440px] mx-auto grid grid-cols-12 gap-4 md:gap-gutter">
            {/* Mobile quick actions (desktop header is hidden below md) */}
            <div className="col-span-12 md:hidden flex flex-wrap gap-2">
              <Link
                href="/help-ticket"
                className={
                  hasPendingTickets
                    ? "flex-1 text-center border-2 border-red-600 px-3 py-2 font-label-sm text-label-sm uppercase font-bold animate-blink-red"
                    : "flex-1 text-center border border-on-surface px-3 py-2 font-label-sm text-label-sm uppercase text-on-surface"
                }
              >
                Help Ticket
              </Link>
              {isAdmin && (
                <button
                  onClick={() => exportTasksToCsv(allTasks)}
                  disabled={allTasks.length === 0}
                  className="flex-1 border border-on-surface bg-on-surface px-3 py-2 font-label-sm text-label-sm uppercase text-surface disabled:opacity-50"
                >
                  Export CSV
                </button>
              )}
            </div>

            {error && (
              <div className="col-span-12">
                <p className="font-label-sm text-label-sm text-error border border-error px-3 py-2">
                  {error}
                </p>
              </div>
            )}

            {/* KPIs — admin/manager only */}
            {isPrivileged && (
              <div className="col-span-12 grid grid-cols-2 md:grid-cols-4 gap-2">
                {kpis.map((kpi) => (
                  <Stat key={kpi.label} label={kpi.label} value={kpi.value} />
                ))}
              </div>
            )}

            {/* This week's performance score */}
            <section className="col-span-12 flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-label-sm text-xs uppercase text-on-surface-variant">
                  This Week&apos;s Score
                  {weekRange && <span className="ml-2 font-data-mono normal-case">{weekRange}</span>}
                </h3>
                <Link href="/performance" className="font-label-sm text-xs uppercase text-on-surface-variant hover:text-on-surface hover:underline">
                  View detail →
                </Link>
              </div>

              {!weekSummary ? (
                <div className="border border-on-surface/25 px-3 py-3 font-data-mono text-xs text-on-surface-variant">
                  {loading ? "Loading…" : "Score unavailable."}
                </div>
              ) : isPrivileged ? (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <Stat label="Team Score" value={formatPct(weekSummary.totals.negativeScore)} />
                  <Stat label="Assigned" value={weekSummary.totals.assigned} />
                  <Stat label="On Time" value={weekSummary.totals.green} />
                  <Stat label="Late Done" value={weekSummary.totals.yellow} />
                  <Stat label="Not Done" value={weekSummary.totals.red} />
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <Stat label="My Score" value={formatPct(myScore?.negativeScore)} />
                  <Stat label="Assigned" value={myScore?.assignedTasks ?? 0} />
                  <Stat label="On Time" value={myScore?.greenCount ?? 0} />
                  <Stat label="Late Done" value={myScore?.yellowCount ?? 0} />
                  <Stat label="Not Done" value={myScore?.redCount ?? 0} />
                </div>
              )}
            </section>

            {/* Pending Tasks — all open items (tasks + checklist), All / Today */}
            <div className="col-span-12 bg-surface border border-on-surface flex flex-col">
              <div className="border-b border-on-surface p-3 flex flex-wrap justify-between items-center gap-3">
                <h3 className="font-label-sm text-xs uppercase text-on-surface-variant">Pending Tasks</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {canCreateTasks && (
                    <button
                      onClick={() => setShowCreatePicker(true)}
                      className="md:hidden px-3 py-1.5 border border-on-surface bg-on-surface text-surface font-label-sm text-xs uppercase transition-colors"
                    >
                      + Create
                    </button>
                  )}
                  {showDoerColumn && (
                    <select
                      value={pendingDoerFilter}
                      onChange={(e) => setPendingDoerFilter(e.target.value)}
                      className="border border-on-surface bg-surface px-2 py-1.5 font-label-sm text-xs uppercase text-on-surface focus:outline-none"
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
                    <button
                      key={f}
                      onClick={() => setPendingFilter(f)}
                      className={`px-3 py-1.5 border border-on-surface font-label-sm text-xs uppercase transition-colors ${
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
                    <tr className="border-b border-on-surface font-label-sm text-[11px] uppercase text-on-surface-variant">
                      <th className="py-2 px-3 font-normal">Task</th>
                      <th className="py-2 px-3 font-normal">System Name</th>
                      <th className="py-2 px-3 font-normal">System Type</th>
                      {showDoerColumn && <th className="py-2 px-3 font-normal">Doer Name</th>}
                      <th className="py-2 px-3 font-normal text-center">Due Date</th>
                      <th className="py-2 px-3 font-normal text-center">Action</th>
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
                        className="border-b border-on-surface/15 last:border-b-0 hover:bg-surface-container-low transition-colors"
                      >
                        <td className="py-2 px-3">{r.task}</td>
                        <td className="py-2 px-3 font-label-sm text-xs uppercase text-on-surface-variant">
                          {r.systemName}
                        </td>
                        <td className="py-2 px-3 font-label-sm text-xs uppercase text-on-surface-variant">
                          {r.systemType}
                        </td>
                        {showDoerColumn && (
                          <td className="py-2 px-3 text-on-surface-variant">
                            {r.kind === "task" && r.taskObj?.doer?.name
                              ? r.taskObj.doer.name
                              : doers.find((d) => d.id === r.assignedDoerId)?.name ||
                                r.assignedDoerId ||
                                "—"}
                          </td>
                        )}
                        <td className="py-2 px-3 text-center font-data-mono whitespace-nowrap">
                          {formatDMY(r.dueDate)}
                          {overdue && <span className="ml-1 text-on-surface-variant">(overdue)</span>}
                          {urgent && <span className="ml-1 text-on-surface-variant">({r.taskObj?.priority?.toLowerCase()})</span>}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() =>
                                r.kind === "task" ? handleTaskDone(r.id) : handleChecklistDone(r.id)
                              }
                              className="px-3 py-1 bg-on-surface text-surface font-label-sm text-xs uppercase transition-colors"
                            >
                              Done
                            </button>
                            {r.kind === "task" && r.taskObj && (
                              <button
                                onClick={() => setTaskToRevise(r.taskObj!)}
                                className="px-3 py-1 border border-on-surface text-on-surface font-label-sm text-xs uppercase hover:bg-surface-container transition-colors"
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

            {/* ---------------------------------------------------------------- */}
            {/* NEW: THIS WEEK OVERVIEW SECTION                                 */}
            {/* ---------------------------------------------------------------- */}

            {(() => {
              // Filter allTasks for Task List items belonging to [weekStart, weekEnd]
              const weeklyTasks = allTasks
                .filter((t) => {
                  if (t.status === "Cancelled" || !t.dueDate) return false;
                  const completedAt = t.status === "Completed" && t.updatedAt ? t.updatedAt.slice(0, 10) : null;
                  if (completedAt) {
                    return (completedAt >= weekStart && completedAt <= weekEnd) || (t.dueDate >= weekStart && t.dueDate <= weekEnd);
                  }
                  return t.dueDate >= weekStart && t.dueDate <= weekEnd;
                })
                .sort((a, b) => {
                  const aCompleted = a.status === "Completed";
                  const bCompleted = b.status === "Completed";
                  if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;

                  const aOverdue = isOverdue(a.dueDate);
                  const bOverdue = isOverdue(b.dueDate);
                  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

                  const aToday = a.dueDate === today;
                  const bToday = b.dueDate === today;
                  if (aToday !== bToday) return aToday ? -1 : 1;

                  return a.dueDate.localeCompare(b.dueDate);
                });

              // Weekly score values
              const currentScore = isPrivileged ? null : myScore;
              const perfScore = isPrivileged
                ? weekSummary?.totals.performanceScore ?? 100
                : currentScore?.performanceScore ?? 100;
              const negScore = isPrivileged
                ? weekSummary?.totals.negativeScore ?? 0
                : currentScore?.negativeScore ?? 0;
              const assignedCount = isPrivileged
                ? weekSummary?.totals.assigned ?? 0
                : currentScore?.assignedTasks ?? 0;
              const greenCount = isPrivileged
                ? weekSummary?.totals.green ?? 0
                : currentScore?.greenCount ?? 0;
              const yellowCount = isPrivileged
                ? weekSummary?.totals.yellow ?? 0
                : currentScore?.yellowCount ?? 0;
              const redCount = isPrivileged
                ? weekSummary?.totals.red ?? 0
                : currentScore?.redCount ?? 0;
              const pendingCount = isPrivileged
                ? weekSummary?.totals.pending ?? 0
                : currentScore?.pendingCount ?? 0;

              const statusColorStr = perfScore >= 90 ? "Green" : perfScore >= 70 ? "Yellow" : perfScore >= 50 ? "Orange" : "Red";
              const statusBg =
                statusColorStr === "Green"
                  ? "bg-emerald-900/30 border-emerald-600 text-emerald-300"
                  : statusColorStr === "Yellow"
                  ? "bg-amber-900/30 border-amber-600 text-amber-300"
                  : statusColorStr === "Orange"
                  ? "bg-orange-900/30 border-orange-600 text-orange-300"
                  : "bg-red-900/30 border-red-600 text-red-300";

              return (
                <section className="col-span-12 flex flex-col gap-4 mt-6 pt-6 border-t-2 border-on-surface">
                  {/* Header & Date Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border-2 border-on-surface p-4">
                    <div>
                      <h2 className="font-headline-md text-headline-md text-on-surface uppercase tracking-tight">
                        This Week Overview
                      </h2>
                      <p className="font-data-mono text-xs text-on-surface-variant mt-0.5">
                        {formatDMY(weekStart)} ↓ {formatDMY(weekEnd)} (Mon–Sun)
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setWeekStart((prev) => addDays(prev, -7))}
                        className="px-3 py-1.5 border-2 border-on-surface font-label-sm text-xs uppercase text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                      >
                        ← Prev Week
                      </button>
                      <button
                        onClick={() => setWeekStart(mondayOf())}
                        className="px-3 py-1.5 border-2 border-on-surface bg-on-surface text-surface font-label-sm text-xs uppercase hover:bg-primary transition-colors cursor-pointer"
                      >
                        Current Week
                      </button>
                      <button
                        onClick={() => setWeekStart((prev) => addDays(prev, 7))}
                        className="px-3 py-1.5 border-2 border-on-surface font-label-sm text-xs uppercase text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                      >
                        Next Week →
                      </button>
                      <input
                        type="date"
                        value={weekStart}
                        onChange={(e) => e.target.value && setWeekStart(mondayOf(e.target.value))}
                        className="border-2 border-on-surface bg-surface px-2 py-1 font-data-mono text-xs uppercase text-on-surface focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Performance Summary Card */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    {/* DGMAX Score Spotlight Card */}
                    <div className="md:col-span-4 bg-surface border-2 border-on-surface p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between border-b-2 border-on-surface pb-2 mb-3">
                          <span className="font-label-sm text-xs uppercase text-on-surface-variant">
                            DGMAX Performance Score
                          </span>
                          <span className={`px-2 py-0.5 border font-label-sm text-xs uppercase font-bold ${statusBg}`}>
                            {statusColorStr}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-3 my-2">
                          <span className="font-headline-lg text-4xl font-bold text-on-surface">
                            {perfScore}%
                          </span>
                          <span className="font-data-mono text-sm text-on-surface-variant">
                            (Penalty: {negScore > 0 ? `-${negScore}` : negScore}%)
                          </span>
                        </div>
                        <p className="font-data-mono text-xs text-on-surface-variant">
                          {isPrivileged
                            ? "Overall team average score for the selected week."
                            : "Your individual weekly performance score based on on-time completion."}
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-on-surface/20 flex gap-2">
                        <Link
                          href="/performance"
                          className="flex-1 text-center border-2 border-on-surface px-2 py-1 font-label-sm text-[11px] uppercase text-on-surface hover:bg-surface-container transition-colors"
                        >
                          My Performance
                        </Link>
                        {isPrivileged && (
                          <Link
                            href="/team-performance"
                            className="flex-1 text-center border-2 border-on-surface bg-on-surface text-surface font-label-sm text-[11px] uppercase transition-colors"
                          >
                            Team Leaderboard
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Breakdown Metrics */}
                    <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <div className="bg-surface border-2 border-on-surface p-3 flex flex-col justify-between">
                        <span className="font-label-sm text-xs uppercase text-on-surface-variant">Assigned</span>
                        <span className="font-headline-lg text-2xl font-bold text-on-surface mt-2">{assignedCount}</span>
                        <span className="font-data-mono text-[10px] text-on-surface-variant uppercase mt-1">Evaluated</span>
                      </div>
                      <div className="bg-surface border-2 border-emerald-600/60 p-3 flex flex-col justify-between">
                        <span className="font-label-sm text-xs uppercase text-emerald-400">On Time 🟢</span>
                        <span className="font-headline-lg text-2xl font-bold text-emerald-400 mt-2">{greenCount}</span>
                        <span className="font-data-mono text-[10px] text-emerald-400/80 uppercase mt-1">0% Penalty</span>
                      </div>
                      <div className="bg-surface border-2 border-amber-600/60 p-3 flex flex-col justify-between">
                        <span className="font-label-sm text-xs uppercase text-amber-400">Late Done 🟡</span>
                        <span className="font-headline-lg text-2xl font-bold text-amber-400 mt-2">{yellowCount}</span>
                        <span className="font-data-mono text-[10px] text-amber-400/80 uppercase mt-1">60% Penalty</span>
                      </div>
                      <div className="bg-surface border-2 border-red-600/60 p-3 flex flex-col justify-between">
                        <span className="font-label-sm text-xs uppercase text-red-400">Not Done 🔴</span>
                        <span className="font-headline-lg text-2xl font-bold text-red-400 mt-2">{redCount}</span>
                        <span className="font-data-mono text-[10px] text-red-400/80 uppercase mt-1">100% Penalty</span>
                      </div>
                      <div className="bg-surface border-2 border-on-surface/40 p-3 flex flex-col justify-between col-span-2 sm:col-span-1">
                        <span className="font-label-sm text-xs uppercase text-on-surface-variant">Pending</span>
                        <span className="font-headline-lg text-2xl font-bold text-on-surface mt-2">{pendingCount}</span>
                        <span className="font-data-mono text-[10px] text-on-surface-variant uppercase mt-1">Not Yet Due</span>
                      </div>
                    </div>
                  </div>

                  {/* Weekly Task List Table */}
                  <div className="bg-surface border-2 border-on-surface flex flex-col">
                    <div className="border-b-2 border-on-surface p-3 flex flex-wrap justify-between items-center gap-3">
                      <div className="flex items-center gap-2">
                        <h3 className="font-headline-md text-headline-md text-on-surface uppercase">
                          Weekly Task List
                        </h3>
                        <span className="font-data-mono text-xs text-on-surface-variant">
                          ({weeklyTasks.length} task{weeklyTasks.length === 1 ? "" : "s"})
                        </span>
                      </div>
                      <Link
                        href="/all-tasks"
                        className="border-2 border-on-surface px-3 py-1 font-label-sm text-xs uppercase text-on-surface hover:bg-surface-container transition-colors"
                      >
                        View All Tasks →
                      </Link>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[850px]">
                        <thead>
                          <tr className="bg-surface-container-low border-b-2 border-on-surface font-label-sm text-xs uppercase text-on-surface">
                            <th className="py-2.5 px-3">Task Name</th>
                            <th className="py-2.5 px-3">List / System</th>
                            {showDoerColumn && <th className="py-2.5 px-3">Assigned To</th>}
                            <th className="py-2.5 px-3 text-center">Due Date</th>
                            <th className="py-2.5 px-3 text-center">Completed On</th>
                            <th className="py-2.5 px-3 text-center">Category</th>
                            <th className="py-2.5 px-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="font-body-md text-body-md text-on-surface">
                          {weekLoading && (
                            <tr>
                              <td colSpan={showDoerColumn ? 7 : 6} className="py-8 text-center font-data-mono text-data-mono text-on-surface-variant">
                                Loading weekly tasks...
                              </td>
                            </tr>
                          )}
                          {!weekLoading && weeklyTasks.length === 0 && (
                            <tr>
                              <td colSpan={showDoerColumn ? 7 : 6} className="py-8 text-center font-data-mono text-data-mono text-on-surface-variant">
                                No tasks scheduled or completed for this week.
                              </td>
                            </tr>
                          )}
                          {weeklyTasks.map((t) => {
                            const cat = getTaskCategory(t, today);
                            const categoryBadge =
                              cat === "Green"
                                ? "bg-emerald-900/30 border-emerald-600 text-emerald-300"
                                : cat === "Yellow"
                                ? "bg-amber-900/30 border-amber-600 text-amber-300"
                                : cat === "Red"
                                ? "bg-red-900/30 border-red-600 text-red-300"
                                : "border-on-surface/40 text-on-surface-variant";

                            const completedOnStr =
                              t.status === "Completed" && t.updatedAt ? formatDMY(t.updatedAt.slice(0, 10)) : "—";

                            return (
                              <tr key={t.id} className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors">
                                <td className="py-3 px-3 font-medium">
                                  {t.title}
                                  {t.priority === "Urgent" || t.priority === "Critical" ? (
                                    <span className="ml-2 font-label-sm text-[10px] uppercase border border-error text-error px-1 py-0.2">
                                      {t.priority}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="py-3 px-3 font-label-sm text-xs uppercase text-on-surface-variant">
                                  {listLabelFor(t.listId)}
                                </td>
                                {showDoerColumn && (
                                  <td className="py-3 px-3 text-on-surface-variant">
                                    {t.doer?.name || doers.find((d) => d.id === t.assignedDoerId)?.name || t.assignedDoerId || "—"}
                                  </td>
                                )}
                                <td className="py-3 px-3 text-center font-data-mono text-xs whitespace-nowrap">
                                  {formatDMY(t.dueDate)}
                                </td>
                                <td className="py-3 px-3 text-center font-data-mono text-xs text-on-surface-variant whitespace-nowrap">
                                  {completedOnStr}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {cat ? (
                                    <span className={`inline-block border font-label-sm text-[10px] uppercase px-2 py-0.5 font-bold ${categoryBadge}`}>
                                      {CATEGORY_LABEL[cat]}
                                    </span>
                                  ) : (
                                    <span className="font-data-mono text-xs text-on-surface-variant">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span
                                    className={`inline-block border font-label-sm text-[10px] uppercase px-2 py-0.5 ${
                                      t.status === "Completed"
                                        ? "border-emerald-600 text-emerald-300"
                                        : isOverdue(t.dueDate)
                                        ? "border-red-600 text-red-300"
                                        : "border-on-surface text-on-surface"
                                    }`}
                                  >
                                    {t.status === "Completed" ? "Completed" : isOverdue(t.dueDate) ? "Overdue" : "Pending"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              );
            })()}

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
          <div className="w-full max-w-sm bg-surface-container-lowest border border-on-surface">
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
                className="px-4 py-3 border border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors text-left"
              >
                Task List — one-time or recurring tasks
              </button>
              <button
                onClick={() => {
                  setShowCreatePicker(false);
                  setCreateMode("checklist");
                }}
                className="px-4 py-3 border border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors text-left"
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
