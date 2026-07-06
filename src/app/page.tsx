"use client";

import { useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import CreateListModal from "@/components/CreateListModal";
import type { DepartmentWiseTaskStat, FullDashboard, List, Task, TaskStatus } from "@/lib/types";

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

function DashboardInner() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const [dashboard, setDashboard] = useState<FullDashboard | null>(null);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [showCreateList, setShowCreateList] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [dash, tasks, listsData] = await Promise.all([
          api.get<FullDashboard>("/dashboard"),
          api.get<Task[]>("/tasks"),
          api.get<List[]>("/lists").catch(() => [] as List[]),
        ]);
        setDashboard(dash);
        setLists(listsData);
        setAllTasks(tasks);
        setRecentTasks(
          [...tasks]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 6)
        );
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
                          {l.type === "task" ? "Task List" : "Checklist"}
                        </span>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteList(l.id)}
                          className="border-2 border-error text-error px-2 py-1 font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors shrink-0"
                        >
                          Delete
                        </button>
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
              <div className="bg-surface-container-low border-b-2 border-on-surface p-stack-md flex justify-between items-center">
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  Task Directory
                </h3>
                <a
                  href="/task-list"
                  className="font-label-sm text-label-sm uppercase border-2 border-on-surface px-4 py-2 hover:bg-on-surface hover:text-on-primary transition-colors"
                >
                  View All
                </a>
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
                      <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface text-right">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="font-body-md text-body-md text-on-surface">
                    {!loading && recentTasks.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                          No tasks yet.
                        </td>
                      </tr>
                    )}
                    {recentTasks.map((t) => (
                      <tr
                        key={t.id}
                        className="border-b border-outline-variant last:border-b-0 hover:bg-surface-container-lowest transition-colors"
                      >
                        <td className="py-4 px-4 font-medium">{t.title}</td>
                        <td className="py-4 px-4 text-on-surface-variant">
                          {t.doer?.name ?? "Unassigned"}
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
