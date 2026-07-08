"use client";

import { useEffect, useMemo, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Task } from "@/lib/types";

/** Completion timestamp proxy: updatedAt is stamped when a task is marked Completed. */
function completionDate(t: Task): string {
  return t.updatedAt ? t.updatedAt.slice(0, 10) : "—";
}

function AllTasksInner() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<Task[]>("/tasks");
        setTasks(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load tasks.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const completed = useMemo(() => {
    return tasks
      .filter((t) => t.status === "Completed")
      .filter((t) =>
        `${t.title} ${t.doer?.name ?? ""}`.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [tasks, search]);

  function exportCSV() {
    const headers = ["Task", "Doer", "Planned Date", "Actual Date", "Revisions", "Priority"];
    const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const rows = completed.map((t) =>
      [
        t.title,
        t.doer?.name ?? t.assignedDoerId,
        t.dueDate,
        completionDate(t),
        String(t.revisionCount),
        t.priority,
      ]
        .map(escape)
        .join(",")
    );
    const csv = [headers.map(escape).join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `all-completed-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <MobileHeader />
      <SideNav active="all-tasks" />

      <div className="md:ml-64 flex-1 flex flex-col bg-background min-h-screen">
        {/* TopNavBar */}
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
            disabled={completed.length === 0}
            className="px-4 py-1 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors disabled:opacity-50"
          >
            Export CSV
          </button>
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-lg">
          <div className="flex justify-between items-end border-b-2 border-on-surface pb-stack-md">
            <div>
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-xl md:text-headline-xl text-on-surface uppercase tracking-tighter">
                All Completed Tasks
              </h2>
              <p className="font-data-mono text-data-mono text-on-surface-variant mt-2 uppercase">
                {completed.length} completed &bull; Admin View
              </p>
            </div>
          </div>

          {error && (
            <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">
              {error}
            </p>
          )}

          <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
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
                {!loading && completed.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      No completed tasks yet.
                    </td>
                  </tr>
                )}
                {completed.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors"
                  >
                    <td className="py-3 px-4 border-r border-surface-variant font-medium">{t.title}</td>
                    <td className="py-3 px-4 border-r border-surface-variant text-on-surface-variant">
                      {t.doer?.name ?? "—"}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-data-mono">
                      {t.dueDate || "—"}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-data-mono">
                      {completionDate(t)}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-data-mono">
                      {t.revisionCount > 0 ? (
                        <span className="text-error font-bold">{t.revisionCount}×</span>
                      ) : (
                        "0"
                      )}
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
