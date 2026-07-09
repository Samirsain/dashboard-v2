"use client";

import { useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import CreateListModal from "@/components/CreateListModal";
import ManageListAccessModal from "@/components/ManageListAccessModal";
import CreateDoerModal from "@/components/CreateDoerModal";
import type { ChecklistInstance, DepartmentWiseTaskStat, FullDashboard, List, Task, TaskStatus } from "@/lib/types";

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

function completionPct(stat: DepartmentWiseTaskStat): number {
  if (stat.total === 0) return 0;
  return Math.round((stat.completed / stat.total) * 100);
}

/** First word of a list's name, uppercased — how the sidebar groups OFFICE/SAHIL TL+CL together. */
function listGroupKey(name: string): string {
  return name.trim().split(/\s+/)[0]?.toUpperCase() || "LIST";
}

const ALL_SCOPE = "ALL";
const OFFICE_SCOPE = "OFFICE";

function DashboardInner() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const [dashboard, setDashboard] = useState<FullDashboard | null>(null);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [checklistToday, setChecklistToday] = useState<ChecklistInstance[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [showCreateList, setShowCreateList] = useState(false);
  const [showAddDoer, setShowAddDoer] = useState(false);
  const [manageAccessList, setManageAccessList] = useState<List | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which list "group" the Task Directory card is scoped to — ALL, OFFICE
  // (no named list), or a named group like SAHIL, same grouping the sidebar
  // uses (OFFICE TL+CL, SAHIL TL+CL).
  const [directoryScope, setDirectoryScope] = useState<string>(ALL_SCOPE);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [dash, tasks, listsData, checklist] = await Promise.all([
          api.get<FullDashboard>("/dashboard"),
          api.get<Task[]>("/tasks"),
          api.get<List[]>("/lists").catch(() => [] as List[]),
          api.get<ChecklistInstance[]>("/checklist/today").catch(() => [] as ChecklistInstance[]),
        ]);
        setDashboard(dash);
        setLists(listsData);
        setAllTasks(tasks);
        setChecklistToday(checklist);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleDeleteList(id: string) {
    if (!confirm("Delete this list? Tasks/checklists in it will stay, just un-filed.")) return;
    try {
      await api.delete(`/lists/${id}`);
      setLists((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete list.");
    }
  }

  // Named-list groups available in the scope dropdown, e.g. { SAHIL: [...] }.
  const scopeGroups = lists.reduce((groups, l) => {
    const key = listGroupKey(l.name);
    const existing = groups.find((g) => g.key === key);
    if (existing) existing.listIds.add(l.id);
    else groups.push({ key, label: key, listIds: new Set([l.id]) });
    return groups;
  }, [] as { key: string; label: string; listIds: Set<string> }[]);
  scopeGroups.sort((a, b) => a.label.localeCompare(b.label));

  const scopeOptions = [
    { key: ALL_SCOPE, label: "All Lists" },
    { key: OFFICE_SCOPE, label: "Office" },
    ...scopeGroups.filter((g) => g.key !== OFFICE_SCOPE).map((g) => ({ key: g.key, label: g.label })),
  ];

  function inDirectoryScope(listId: string): boolean {
    if (directoryScope === ALL_SCOPE) return true;
    if (directoryScope === OFFICE_SCOPE) return !listId;
    const group = scopeGroups.find((g) => g.key === directoryScope);
    return group ? group.listIds.has(listId) : true;
  }

  function listLabelFor(listId: string): string {
    if (!listId) return "Office";
    const list = lists.find((l) => l.id === listId);
    return list ? listGroupKey(list.name) : "Office";
  }

  // Role-based "Task Directory":
  //  - Admin/Manager: today's PENDING tasks (what's due right now, across
  //    every list, filterable by list).
  //  - Everyone else (PC + doers): all their still-open (Pending) tasks plus
  //    today's open checklist — a completed item drops off the view.
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  const isPrivileged = user?.role === "Admin" || user?.role === "Manager";

  type DirRow = { id: string; description: string; doerName: string; status: TaskStatus; listLabel: string };
  const directoryRows: DirRow[] = isPrivileged
    ? allTasks
        .filter((t) => t.status !== "Completed" && t.status !== "Cancelled" && t.dueDate === today)
        .filter((t) => inDirectoryScope(t.listId))
        .map((t) => ({
          id: t.id,
          description: t.title,
          doerName: t.doer?.name ?? "Unassigned",
          status: t.status,
          listLabel: listLabelFor(t.listId),
        }))
    : [
        ...allTasks
          .filter((t) => t.status !== "Completed" && t.status !== "Cancelled")
          .filter((t) => inDirectoryScope(t.listId))
          .map((t) => ({
            id: t.id,
            description: t.title,
            doerName: t.doer?.name ?? user?.name ?? "",
            status: t.status,
            listLabel: listLabelFor(t.listId),
          })),
        ...checklistToday
          .filter((c) => c.status !== "Completed")
          .map((c) => ({
            id: c.id,
            description: c.taskName,
            doerName: c.doer?.name ?? user?.name ?? "",
            status: "Pending" as TaskStatus,
            listLabel: "Office",
          })),
      ];

  const directoryTitle = isPrivileged ? "Today's Pending Tasks" : "Pending Tasks";

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

          <div className="flex items-center gap-4">
            {isAdmin && (
              <>
                <button
                  onClick={() => setShowAddDoer(true)}
                  className="border-2 border-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
                >
                  + Add Doer
                </button>
                <button
                  onClick={() => setShowCreateList(true)}
                  className="border-2 border-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
                >
                  + Create List
                </button>
                <button
                  onClick={() => exportTasksToCsv(allTasks)}
                  disabled={allTasks.length === 0}
                  className="border-2 border-on-surface bg-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-surface hover:bg-primary transition-colors disabled:opacity-50"
                >
                  Export Report (CSV)
                </button>
              </>
            )}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary-container rounded-full" />
              <span className="font-label-sm text-label-sm uppercase text-on-surface">
                Operational Status: Active
              </span>
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

            {/* Lists */}
            <div className="col-span-12 bg-surface border-2 border-on-surface p-stack-lg flex flex-col">
              <div className="border-b-2 border-on-surface pb-stack-md mb-stack-md flex justify-between items-end">
                <h3 className="font-headline-md text-headline-md text-on-surface">Lists</h3>
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                  {lists.length} total
                </span>
              </div>
              {lists.length === 0 ? (
                <p className="font-data-mono text-data-mono text-on-surface-variant">
                  No lists yet. {isAdmin ? 'Use "+ Create List" above to add one.' : ""}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {lists.map((l) => (
                    <div
                      key={l.id}
                      className="border-2 border-on-surface p-stack-md flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-body-md text-body-md text-on-surface truncate">{l.name}</div>
                        <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                          {l.type === "task" ? "Task List" : "Checklist"} &bull; {l.memberIds.length} member{l.memberIds.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => setManageAccessList(l)}
                            className="border-2 border-on-surface px-2 py-1 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
                          >
                            Access
                          </button>
                          <button
                            onClick={() => handleDeleteList(l.id)}
                            className="border-2 border-error text-error px-2 py-1 font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Department Performance */}
            <div className="col-span-12 lg:col-span-5 bg-surface border-2 border-on-surface p-stack-lg flex flex-col">
              <div className="border-b-2 border-on-surface pb-stack-md mb-stack-md flex justify-between items-end">
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  Department Performance
                </h3>
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                  By Completion %
                </span>
              </div>
              <div className="flex flex-col gap-6 flex-1 justify-center">
                {(dashboard?.breakdowns.departmentWiseTasks ?? []).length === 0 && (
                  <p className="font-data-mono text-data-mono text-on-surface-variant text-center">
                    No department data yet.
                  </p>
                )}
                {dashboard?.breakdowns.departmentWiseTasks.map((d) => (
                  <div key={d.department} className="flex items-center gap-4">
                    <span className="font-data-mono text-data-mono w-20 truncate">
                      {d.department}
                    </span>
                    <div className="flex-1 h-4 bg-surface-container border-2 border-on-surface relative">
                      <div
                        className="absolute top-0 left-0 h-full bg-on-surface"
                        style={{ width: `${completionPct(d)}%` }}
                      />
                    </div>
                    <span className="font-data-mono text-data-mono w-10 text-right">
                      {completionPct(d)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Task Directory Table */}
            <div className="col-span-12 lg:col-span-7 bg-surface border-2 border-on-surface flex flex-col">
              <div className="bg-surface-container-low border-b-2 border-on-surface p-stack-md flex flex-wrap justify-between items-center gap-3">
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  {directoryTitle}
                </h3>
                <div className="flex items-center gap-3">
                  <select
                    value={directoryScope}
                    onChange={(e) => setDirectoryScope(e.target.value)}
                    className="border-2 border-on-surface bg-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
                  >
                    {scopeOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
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
                        Status
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
                          <StatusBadge status={t.status} />
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

      {showCreateList && (
        <CreateListModal
          onClose={() => setShowCreateList(false)}
          onCreated={(list) => {
            setLists((prev) => [...prev, list]);
            setShowCreateList(false);
          }}
        />
      )}

      {showAddDoer && (
        <CreateDoerModal
          onClose={() => setShowAddDoer(false)}
          onCreated={() => setShowAddDoer(false)}
        />
      )}

      {manageAccessList && (
        <ManageListAccessModal
          list={manageAccessList}
          onClose={() => setManageAccessList(null)}
          onSaved={(updated) => {
            setLists((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
            setManageAccessList(null);
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
