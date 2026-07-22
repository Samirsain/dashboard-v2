"use client";

import { useEffect, useMemo, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { formatDMY } from "@/lib/format";
import { nextChecklistDueDate } from "@/lib/checklistSchedule";
import { useAuth } from "@/lib/auth-context";
import { canAccessAllTasks } from "@/lib/access";
import type { ChecklistInstance, ChecklistTemplate, Doer, List, Task } from "@/lib/types";

type Tab = "tasks" | "checklist";

/** Completion timestamp proxy: updatedAt is stamped when a task is marked Completed. */
function taskCompletedOn(t: Task): string {
  return t.updatedAt ? t.updatedAt.slice(0, 10) : "";
}
function checklistCompletedOn(c: ChecklistInstance): string {
  return c.completedAt ? c.completedAt.slice(0, 10) : c.date || "";
}

/** True if `dateStr` (YYYY-MM-DD) is within the optional [from, to] range. Blank bounds = open. */
function inRange(dateStr: string, from: string, to: string): boolean {
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

function AllTasksInner() {
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState<Tab>("tasks");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [checklist, setChecklist] = useState<ChecklistInstance[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [users, setUsers] = useState<Doer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters (shared across tabs)
  const [search, setSearch] = useState("");
  const [doerFilter, setDoerFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [scope, setScope] = useState<string>("ALL");
  // Checklist tab only: Pending (still to do — what used to show on the
  // Dashboard) vs Completed (the history report this page started as).
  const [checklistStatus, setChecklistStatus] = useState<"Pending" | "Completed">("Pending");

  useEffect(() => {
    async function load() {
      try {
        // Same as the Checklist page: hit /checklist/today first so any
        // active template still missing today's instance gets one generated
        // — otherwise a template created/visited only via a different page
        // could show up there but not here (or vice versa).
        await api.get<ChecklistInstance[]>("/checklist/today").catch(() => []);
        const [taskData, userData, listData, templateData, checklistData] = await Promise.all([
          api.get<Task[]>("/tasks"),
          api.get<Doer[]>("/users"),
          api.get<List[]>("/lists").catch(() => [] as List[]),
          api.get<ChecklistTemplate[]>("/checklist/templates").catch(() => [] as ChecklistTemplate[]),
          api.get<ChecklistInstance[]>("/checklist/instances").catch(() => [] as ChecklistInstance[]),
        ]);
        setTasks(taskData);
        setUsers(userData);
        setLists(listData);
        setTemplates(templateData);
        setChecklist(checklistData);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load data.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    queueMicrotask(() => setScope("ALL"));
  }, [tab]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(u.id, u.name));
    return m;
  }, [users]);

  // template id -> list id, so checklist instances can be scoped by list.
  const templateListMap = useMemo(
    () => Object.fromEntries(templates.map((t) => [t.id, t.listId])),
    [templates]
  );


  function inScope(listId: string): boolean {
    if (scope === "ALL") return true;
    if (scope === "OFFICE") return !listId;
    return listId === scope;
  }

  // People who can be assigned work — shown in the doer filter dropdown.
  const doerOptions = useMemo(
    () => users.filter((u) => u.role === "Doer" || u.role === "Admin"),
    [users]
  );

  const completedTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status === "Completed")
      .filter((t) => inScope(t.listId))
      .filter((t) => (doerFilter ? t.assignedDoerId === doerFilter : true))
      .filter((t) => inRange(taskCompletedOn(t), fromDate, toDate))
      .filter((t) =>
        `${t.title} ${t.doer?.name ?? ""}`.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, doerFilter, fromDate, toDate, search, scope]);

  // A template's next due date: prefer an already-generated Pending
  // instance's date (authoritative once it exists); otherwise compute the
  // next date its frequency is due from today. Recomputed live, so once a
  // Weekly/Monthly task's day passes, this naturally rolls to the next one.
  function dueDateFor(template: ChecklistTemplate): string {
    const pendingInstance = checklist
      .filter((c) => c.templateId === template.id && c.status === "Pending")
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    return pendingInstance?.date || nextChecklistDueDate(template.frequency, template.frequencyValue);
  }

  // "Pending" = the checklist tasks themselves (templates) — what was
  // created, who's doing it, when it's next due, how often. Not tied to
  // whether today's instance happens to have been generated, so a
  // Weekly/Monthly task shows up here every day, not just on its scheduled
  // day — its Due Date column just reflects the upcoming date.
  const pendingChecklistTasks = useMemo(() => {
    return templates
      .filter((t) => inScope(t.listId))
      .filter((t) => (doerFilter ? t.assignedDoerId === doerFilter : true))
      .filter((t) => inRange(dueDateFor(t), fromDate, toDate))
      .filter((t) =>
        `${t.taskName} ${nameById.get(t.assignedDoerId) ?? ""}`.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => dueDateFor(a).localeCompare(dueDateFor(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, checklist, doerFilter, fromDate, toDate, search, nameById, scope]);

  const completedChecklistInstances = useMemo(() => {
    return checklist
      .filter((c) => c.status === "Completed")
      .filter((c) => inScope(templateListMap[c.templateId] ?? ""))
      .filter((c) => (doerFilter ? c.assignedDoerId === doerFilter : true))
      .filter((c) => inRange(checklistCompletedOn(c), fromDate, toDate))
      .filter((c) =>
        `${c.taskName} ${nameById.get(c.assignedDoerId) ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
      .sort((a, b) => (b.completedAt || b.date || "").localeCompare(a.completedAt || a.date || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklist, doerFilter, fromDate, toDate, search, nameById, templateListMap, scope]);

  const checklistRowCount =
    checklistStatus === "Pending" ? pendingChecklistTasks.length : completedChecklistInstances.length;
  const rows = tab === "tasks" ? completedTasks.length : checklistRowCount;

  // Deletes the recurring checklist task entirely (the template + every
  // instance it ever generated) — used when a daily/monthly checklist item
  // is no longer needed at all, not just "stop it going forward."
  async function handleDeleteChecklistTask(task: { id: string; taskName: string }) {
    if (
      !confirm(
        `Permanently delete "${task.taskName}"? This removes the recurring checklist task and its full history — it will stop generating and can't be undone.`
      )
    )
      return;
    try {
      await api.delete(`/checklist/templates/${task.id}`);
      setTemplates((prev) => prev.filter((t) => t.id !== task.id));
      setChecklist((prev) => prev.filter((c) => c.templateId !== task.id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete checklist task.");
    }
  }

  // Reassign a checklist task to a different doer — e.g. the original doer
  // got pulled onto something else. The template's future occurrences pick
  // this up automatically; the backend also carries it onto any instance
  // that's already generated and still Pending, so it takes effect now too.
  async function handleReassignChecklistTask(templateId: string, assignedDoerId: string) {
    try {
      const updated = await api.patch<ChecklistTemplate>(`/checklist/templates/${templateId}`, {
        assignedDoerId,
      });
      setTemplates((prev) => prev.map((t) => (t.id === templateId ? updated : t)));
      setChecklist((prev) =>
        prev.map((c) =>
          c.templateId === templateId && c.status === "Pending" ? { ...c, assignedDoerId } : c
        )
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to reassign checklist task.");
    }
  }

  function clearFilters() {
    setSearch("");
    setDoerFilter("");
    setFromDate("");
    setToDate("");
    setScope("ALL");
  }

  function exportCSV() {
    const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    let headers: string[];
    let dataRows: string[][];
    if (tab === "tasks") {
      headers = ["Task", "Doer", "Planned Date", "Actual Date", "Revisions", "Priority"];
      dataRows = completedTasks.map((t) => [
        t.title,
        t.doer?.name ?? t.assignedDoerId,
        t.dueDate,
        taskCompletedOn(t) || "-",
        String(t.revisionCount),
        t.priority,
      ]);
    } else if (checklistStatus === "Pending") {
      headers = ["Checklist Task", "Doer", "Due Date", "Frequency"];
      dataRows = pendingChecklistTasks.map((t) => [
        t.taskName,
        nameById.get(t.assignedDoerId) ?? t.assignedDoerId,
        dueDateFor(t),
        t.frequency,
      ]);
    } else {
      headers = ["Checklist Task", "Doer", "Scheduled Date", "Completed On", "Completed By"];
      dataRows = completedChecklistInstances.map((c) => [
        c.taskName,
        nameById.get(c.assignedDoerId) ?? c.assignedDoerId,
        c.date,
        checklistCompletedOn(c) || "-",
        nameById.get(c.completedBy) ?? c.completedBy,
      ]);
    }
    const csv = [headers.map(escape).join(","), ...dataRows.map((r) => r.map(escape).join(","))].join(
      "\r\n"
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `all-completed-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const inputCls =
    "border-2 border-on-surface bg-surface px-3 py-1.5 text-on-surface focus:outline-none font-data-mono text-data-mono";
  const dateFilterLabel = tab === "checklist" && checklistStatus === "Pending" ? "due" : "completed";

  return (
    <>
      <MobileHeader />
      <SideNav active="all-tasks" />

      <div className="md:ml-64 flex-1 flex flex-col bg-background min-h-screen">
        <header className="hidden md:flex bg-surface w-full border-b-2 border-on-surface justify-between items-center h-16 px-container-padding sticky top-0 z-30">
          <div className="flex items-center gap-2 border-b-2 border-on-surface pb-1">
            <span className="material-symbols-outlined text-on-surface-variant">search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none focus:ring-0 p-0 font-data-mono text-data-mono uppercase text-on-surface placeholder-on-surface-variant w-48"
              placeholder="SEARCH TASK / DOER"
              type="text"
            />
          </div>
          <button
            onClick={exportCSV}
            disabled={rows === 0}
            className="px-4 py-1 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors disabled:opacity-50"
          >
            Export CSV
          </button>
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-md">
          {/* Mobile search + export (desktop header is hidden below md) */}
          <div className="md:hidden flex flex-col gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="SEARCH TASK / DOER..."
              className="w-full border-2 border-on-surface bg-surface px-3 py-2 font-data-mono text-data-mono uppercase text-on-surface placeholder-on-surface-variant focus:outline-none"
            />
            <button
              onClick={exportCSV}
              disabled={rows === 0}
              className="w-full px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>

          <div className="flex flex-wrap justify-between items-end gap-3 border-b-2 border-on-surface pb-stack-md">
            <div>
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-xl md:text-headline-xl text-on-surface uppercase tracking-tighter">
                {tab === "checklist" ? `All ${checklistStatus}` : "All Completed"}
              </h2>
              <p className="font-data-mono text-data-mono text-on-surface-variant mt-2 uppercase">
                {rows} {tab === "tasks" ? "tasks" : "checklist items"} &bull; Admin View
              </p>
            </div>
            {tab === "checklist" && (
              <div className="flex items-center gap-2">
                {(["Pending", "Completed"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setChecklistStatus(s)}
                    className={`px-3 py-1.5 border-2 border-on-surface font-label-sm text-label-sm uppercase transition-colors ${
                      checklistStatus === s
                        ? "bg-on-surface text-surface"
                        : "text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tabs as dropdown filters */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-2">
              <select
                value={tab === "tasks" ? scope : "ALL"}
                onMouseDown={() => {
                  if (tab !== "tasks") {
                    setTab("tasks");
                    setScope("ALL");
                  }
                }}
                onChange={(e) => {
                  setTab("tasks");
                  setScope(e.target.value);
                }}
                className={
                  tab === "tasks"
                    ? "border-2 border-on-surface bg-on-surface text-surface px-4 py-1.5 font-label-sm text-label-sm uppercase focus:outline-none cursor-pointer"
                    : "border-2 border-on-surface px-4 py-1.5 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors focus:outline-none cursor-pointer"
                }
              >
                <option value="ALL">Tasks (All TL)</option>
                <option value="OFFICE">Tasks (Office TL)</option>
                {lists
                  .filter((l) => l.type === "task")
                  .map((l) => {
                    const first = l.name.trim().split(/\s+/)[0]?.toUpperCase() || "LIST";
                    return (
                      <option key={l.id} value={l.id}>
                        Tasks ({first} TL)
                      </option>
                    );
                  })}
              </select>

              <select
                value={tab === "checklist" ? scope : "ALL"}
                onMouseDown={() => {
                  if (tab !== "checklist") {
                    setTab("checklist");
                    setScope("ALL");
                  }
                }}
                onChange={(e) => {
                  setTab("checklist");
                  setScope(e.target.value);
                }}
                className={
                  tab === "checklist"
                    ? "border-2 border-on-surface bg-on-surface text-surface px-4 py-1.5 font-label-sm text-label-sm uppercase focus:outline-none cursor-pointer"
                    : "border-2 border-on-surface px-4 py-1.5 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors focus:outline-none cursor-pointer"
                }
              >
                <option value="ALL">Checklist (All CL)</option>
                <option value="OFFICE">Checklist (Office CL)</option>
                {lists
                  .filter((l) => l.type === "checklist")
                  .map((l) => {
                    const first = l.name.trim().split(/\s+/)[0]?.toUpperCase() || "LIST";
                    return (
                      <option key={l.id} value={l.id}>
                        Checklist ({first} CL)
                      </option>
                    );
                  })}
              </select>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-surface border-2 border-on-surface p-3 flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">Doer</label>
              <select value={doerFilter} onChange={(e) => setDoerFilter(e.target.value)} className={inputCls}>
                <option value="">All Doers</option>
                {doerOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">From ({dateFilterLabel})</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">To ({dateFilterLabel})</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
            </div>
            {(doerFilter || fromDate || toDate || search || scope !== "ALL") && (
              <button
                onClick={clearFilters}
                className="border-2 border-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {error && (
            <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">{error}</p>
          )}

          {/* Table */}
          <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
            {tab === "tasks" ? (
              <table className="w-full text-left border-collapse min-w-[820px]">
                <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                  <tr>
                    <th className="py-3 px-4 border-r border-surface-variant">Task Description</th>
                    <th className="py-3 px-4 border-r border-surface-variant w-40">Doer</th>
                    <th className="py-3 px-4 border-r border-surface-variant w-36 text-center">Planned Date</th>
                    <th className="py-3 px-4 border-r border-surface-variant w-36 text-center">Actual Date</th>
                    <th className="py-3 px-4 border-r border-surface-variant w-28 text-center">Revisions</th>
                    <th className="py-3 px-4 w-32 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="font-body-md text-body-md text-on-surface">
                  {loading && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                        Loading...
                      </td>
                    </tr>
                  )}
                  {!loading && completedTasks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                        No completed tasks match the filters.
                      </td>
                    </tr>
                  )}
                  {completedTasks.map((t) => (
                    <tr key={t.id} className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors">
                      <td className="py-3 px-4 border-r border-surface-variant font-medium">{t.title}</td>
                      <td className="py-3 px-4 border-r border-surface-variant text-on-surface-variant">{t.doer?.name ?? "—"}</td>
                      <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-data-mono">{formatDMY(t.dueDate)}</td>
                      <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-data-mono">{taskCompletedOn(t) || "—"}</td>
                      <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-data-mono">
                        {t.revisionCount > 0 ? <span className="text-error font-bold">{t.revisionCount}×</span> : "0"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block border-2 border-on-surface bg-on-surface text-surface-container-lowest font-label-sm text-label-sm uppercase px-3 py-1">
                          Completed
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse min-w-[820px]">
                <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                  {checklistStatus === "Pending" ? (
                    <tr>
                      <th className="py-3 px-4 border-r border-surface-variant">Checklist Task</th>
                      <th className="py-3 px-4 border-r border-surface-variant w-40">Doer</th>
                      <th className="py-3 px-4 border-r border-surface-variant w-36 text-center">Due Date</th>
                      <th className="py-3 px-4 border-r border-surface-variant w-32 text-center">Frequency</th>
                      <th className="py-3 px-4 w-32 text-center">Action</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="py-3 px-4 border-r border-surface-variant">Checklist Task</th>
                      <th className="py-3 px-4 border-r border-surface-variant w-40">Doer</th>
                      <th className="py-3 px-4 border-r border-surface-variant w-36 text-center">Scheduled Date</th>
                      <th className="py-3 px-4 border-r border-surface-variant w-36 text-center">Completed On</th>
                      <th className="py-3 px-4 border-r border-surface-variant w-40">Completed By</th>
                      <th className="py-3 px-4 w-32 text-center">Action</th>
                    </tr>
                  )}
                </thead>
                <tbody className="font-body-md text-body-md text-on-surface">
                  {loading && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                        Loading...
                      </td>
                    </tr>
                  )}
                  {!loading && checklistRowCount === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                        No {checklistStatus.toLowerCase()} checklist items match the filters.
                      </td>
                    </tr>
                  )}
                  {checklistStatus === "Pending"
                    ? pendingChecklistTasks.map((t) => (
                        <tr key={t.id} className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors">
                          <td className="py-3 px-4 border-r border-surface-variant font-medium">{t.taskName}</td>
                          <td className="py-3 px-4 border-r border-surface-variant">
                            <select
                              value={t.assignedDoerId}
                              onChange={(e) => handleReassignChecklistTask(t.id, e.target.value)}
                              className="w-full border-2 border-on-surface bg-surface px-2 py-1 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
                            >
                              {doerOptions.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-data-mono">{formatDMY(dueDateFor(t))}</td>
                          <td className="py-3 px-4 border-r border-surface-variant text-center font-label-sm text-label-sm uppercase">
                            {t.frequency}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {currentUser?.role === "Admin" && (
                              <button
                                onClick={() => handleDeleteChecklistTask(t)}
                                className="border-2 border-error text-error px-2 py-1 font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors"
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    : completedChecklistInstances.map((c) => (
                        <tr key={c.id} className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors">
                          <td className="py-3 px-4 border-r border-surface-variant font-medium">{c.taskName}</td>
                          <td className="py-3 px-4 border-r border-surface-variant text-on-surface-variant">
                            {nameById.get(c.assignedDoerId) ?? "—"}
                          </td>
                          <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-data-mono">{formatDMY(c.date)}</td>
                          <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-data-mono">{checklistCompletedOn(c) || "—"}</td>
                          <td className="py-3 px-4 border-r border-surface-variant text-on-surface-variant">{nameById.get(c.completedBy) ?? c.completedBy ?? "—"}</td>
                          <td className="py-3 px-4 text-center">
                            {currentUser?.role === "Admin" && (
                              <button
                                onClick={() => handleDeleteChecklistTask({ id: c.templateId, taskName: c.taskName })}
                                className="border-2 border-error text-error px-2 py-1 font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors"
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

export default function AllTasksPage() {
  const { user } = useAuth();

  if (user && !canAccessAllTasks(user)) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="font-data-mono text-data-mono text-error uppercase border-2 border-error p-4">
            Access Denied. Admins Only.
          </p>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <AllTasksInner />
    </AuthGuard>
  );
}
