"use client";

import { useEffect, useMemo, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { ChecklistInstance, ChecklistTemplate, Doer, List, Task } from "@/lib/types";

type Tab = "tasks" | "checklist";

/** First word of a list's name, uppercased — how the sidebar groups OFFICE/SAHIL TL+CL together. */
function listGroupKey(name: string): string {
  return name.trim().split(/\s+/)[0]?.toUpperCase() || "LIST";
}

const ALL_SCOPE = "ALL";
const OFFICE_SCOPE = "OFFICE";

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
  // Which list "group" to show: ALL, OFFICE (no named list), or a named
  // group like SAHIL — same grouping the sidebar uses for OFFICE/SAHIL TL+CL.
  const [scope, setScope] = useState<string>(ALL_SCOPE);

  useEffect(() => {
    async function load() {
      try {
        const [taskData, userData, listData, templateData, checklistData] = await Promise.all([
          api.get<Task[]>("/tasks"),
          api.get<Doer[]>("/users"),
          api.get<List[]>("/lists").catch(() => [] as List[]),
          api.get<ChecklistTemplate[]>("/checklist/templates").catch(() => [] as ChecklistTemplate[]),
          api
            .get<ChecklistInstance[]>("/checklist/instances?status=Completed")
            .catch(() => [] as ChecklistInstance[]),
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

  // Named-list groups available in the scope dropdown, e.g. { SAHIL: [...] }.
  const scopeGroups = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; listIds: Set<string> }>();
    for (const l of lists) {
      const key = listGroupKey(l.name);
      if (!groups.has(key)) groups.set(key, { key, label: key, listIds: new Set() });
      groups.get(key)!.listIds.add(l.id);
    }
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [lists]);

  const scopeOptions = useMemo(
    () => [
      { key: ALL_SCOPE, label: "All Lists" },
      { key: OFFICE_SCOPE, label: "Office" },
      ...scopeGroups.filter((g) => g.key !== OFFICE_SCOPE).map((g) => ({ key: g.key, label: g.label })),
    ],
    [scopeGroups]
  );

  function inScope(listId: string): boolean {
    if (scope === ALL_SCOPE) return true;
    if (scope === OFFICE_SCOPE) return !listId;
    const group = scopeGroups.find((g) => g.key === scope);
    return group ? group.listIds.has(listId) : true;
  }

  // People who can be assigned work — shown in the doer filter dropdown.
  const doerOptions = useMemo(
    () => users.filter((u) => u.role === "Doer" || u.role === "PC"),
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
  }, [tasks, doerFilter, fromDate, toDate, search, scope, scopeGroups]);

  const completedChecklist = useMemo(() => {
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
  }, [checklist, doerFilter, fromDate, toDate, search, nameById, templateListMap, scope, scopeGroups]);

  const rows = tab === "tasks" ? completedTasks.length : completedChecklist.length;

  function clearFilters() {
    setSearch("");
    setDoerFilter("");
    setFromDate("");
    setToDate("");
    setScope(ALL_SCOPE);
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
    } else {
      headers = ["Checklist Task", "Doer", "Scheduled Date", "Completed On", "Completed By"];
      dataRows = completedChecklist.map((c) => [
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
          <div className="flex justify-between items-end border-b-2 border-on-surface pb-stack-md">
            <div>
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-xl md:text-headline-xl text-on-surface uppercase tracking-tighter">
                All Completed
              </h2>
              <p className="font-data-mono text-data-mono text-on-surface-variant mt-2 uppercase">
                {rows} {tab === "tasks" ? "tasks" : "checklist items"} &bull; Admin View
              </p>
            </div>
          </div>

          {/* Tabs + List scope */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-2">
              {(["tasks", "checklist"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={
                    tab === t
                      ? "border-2 border-on-surface bg-on-surface text-surface px-4 py-1.5 font-label-sm text-label-sm uppercase"
                      : "border-2 border-on-surface px-4 py-1.5 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
                  }
                >
                  {t === "tasks" ? "Tasks" : "Checklist"}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">List:</span>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="border-2 border-on-surface bg-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
              >
                {scopeOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
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
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">From (completed)</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">To (completed)</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputCls} />
            </div>
            {(doerFilter || fromDate || toDate || search || scope !== ALL_SCOPE) && (
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
                      <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-data-mono">{t.dueDate || "—"}</td>
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
                  <tr>
                    <th className="py-3 px-4 border-r border-surface-variant">Checklist Task</th>
                    <th className="py-3 px-4 border-r border-surface-variant w-40">Doer</th>
                    <th className="py-3 px-4 border-r border-surface-variant w-36 text-center">Scheduled Date</th>
                    <th className="py-3 px-4 border-r border-surface-variant w-36 text-center">Completed On</th>
                    <th className="py-3 px-4 w-40">Completed By</th>
                  </tr>
                </thead>
                <tbody className="font-body-md text-body-md text-on-surface">
                  {loading && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                        Loading...
                      </td>
                    </tr>
                  )}
                  {!loading && completedChecklist.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                        No completed checklist items match the filters.
                      </td>
                    </tr>
                  )}
                  {completedChecklist.map((c) => (
                    <tr key={c.id} className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors">
                      <td className="py-3 px-4 border-r border-surface-variant font-medium">{c.taskName}</td>
                      <td className="py-3 px-4 border-r border-surface-variant text-on-surface-variant">
                        {nameById.get(c.assignedDoerId) ?? "—"}
                      </td>
                      <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-data-mono">{c.date || "—"}</td>
                      <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-data-mono">{checklistCompletedOn(c) || "—"}</td>
                      <td className="py-3 px-4 text-on-surface-variant">{nameById.get(c.completedBy) ?? c.completedBy ?? "—"}</td>
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

  if (user && user.role !== "Admin") {
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
