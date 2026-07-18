"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import InitialsAvatar from "@/components/InitialsAvatar";
import AuthGuard from "@/components/AuthGuard";
import CreateTaskModal from "@/components/CreateTaskModal";
import ReviseTaskModal from "@/components/ReviseTaskModal";
import { api, ApiError } from "@/lib/api";
import { formatDMY } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { canAccessAllTasks } from "@/lib/access";
import type { Doer, List, Task } from "@/lib/types";

function isUrgentPriority(priority: Task["priority"]): boolean {
  return priority === "Urgent" || priority === "Critical";
}

function TaskListInner() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [doers, setDoers] = useState<Doer[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [taskToRevise, setTaskToRevise] = useState<Task | null>(null);
  const [search, setSearch] = useState("");
  const [doerFilter, setDoerFilter] = useState("");
  const { user } = useAuth();
  const canCreateTasks = canAccessAllTasks(user);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [taskData, doerData, listData] = await Promise.all([
        api.get<Task[]>("/tasks"),
        api.get<Doer[]>("/users"),
        api.get<List[]>("/lists?type=task").catch(() => [] as List[]),
      ]);
      setTasks(taskData);
      setDoers(doerData.filter(d => d.role === "Doer" || d.role === "Admin"));
      setLists(listData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Deferred so the initial fetch's setState calls don't happen
    // synchronously within the effect body.
    queueMicrotask(() => {
      loadData();
    });
  }, []);

  const listFilter = useSearchParams().get("list") ?? "";
  const currentList = lists.find((l) => l.id === listFilter) ?? null;

  // Completed tasks never show here, for anyone — they move to the admin
  // "All Tasks" report and stay off the active list.
  const filtered = tasks
    .filter((t) => (listFilter ? t.listId === listFilter : true))
    .filter((t) => t.status !== "Completed")
    .filter((t) => (doerFilter ? t.assignedDoerId === doerFilter : true))
    .filter((t) =>
      `${t.title} ${t.doer?.name ?? ""}`.toLowerCase().includes(search.toLowerCase())
    );

  async function handleMarkDone(id: string) {
    try {
      await api.patch(`/tasks/${id}`, { status: "Completed" });
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: "Completed" } : t))
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to update task.");
    }
  }

  // Reassign a pending task to a different doer — e.g. the original doer
  // got pulled onto something else and someone else needs to finish it.
  async function handleReassign(id: string, assignedDoerId: string) {
    try {
      const updated = await api.patch<Task>(`/tasks/${id}`, { assignedDoerId });
      const doer = doers.find((d) => d.id === assignedDoerId) ?? null;
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...updated, doer } : t)));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to reassign task.");
    }
  }

  return (
    <>
      <MobileHeader />
      <SideNav active="task-list" />

      <div className="md:ml-64 flex-1 flex flex-col bg-background">
        {/* TopNavBar */}
        <header className="hidden md:flex bg-surface w-full border-b-2 border-on-surface justify-between items-center h-16 px-container-padding sticky top-0 z-30">
          <div className="flex items-center gap-gutter">
            <div className="flex items-center gap-2 border-b-2 border-on-surface pb-1">
              <span className="material-symbols-outlined text-on-surface-variant">
                search
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent border-none focus:ring-0 p-0 font-data-mono text-data-mono uppercase text-on-surface placeholder-on-surface-variant w-48"
                placeholder="QUERY DATABASE"
                type="text"
              />
            </div>
          </div>

          <div className="flex items-center gap-stack-md">
            <select
              value={doerFilter}
              onChange={(e) => setDoerFilter(e.target.value)}
              className="bg-transparent border-2 border-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
            >
              <option value="">All Doers</option>
              {doers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <div className="font-data-mono text-data-mono text-on-surface px-3 py-1 border-2 border-on-surface uppercase">
              {new Date().toISOString().split("T")[0]}
            </div>
            <div className="font-label-sm text-label-sm text-primary hidden md:block">
              Operational Status: Active
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-lg">
          {/* Mobile search + doer filter (desktop header is hidden below md) */}
          <div className="md:hidden flex flex-col gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="SEARCH TASKS..."
              className="w-full border-2 border-on-surface bg-surface px-3 py-2 font-data-mono text-data-mono uppercase text-on-surface placeholder-on-surface-variant focus:outline-none"
            />
            <select
              value={doerFilter}
              onChange={(e) => setDoerFilter(e.target.value)}
              className="w-full border-2 border-on-surface bg-surface px-3 py-2 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
            >
              <option value="">All Doers</option>
              {doers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap justify-between items-end gap-3 border-b-2 border-on-surface pb-stack-md">
            <div>
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-xl md:text-headline-xl text-on-surface uppercase tracking-tighter">
                {currentList ? currentList.name : "Active Task Directory"}
              </h2>
              <p className="font-data-mono text-data-mono text-on-surface-variant mt-2 uppercase">
                {currentList
                  ? `${filtered.length} in this list`
                  : `${tasks.length} entries`}{" "}
                &bull; System Live
              </p>
            </div>
            <div className="flex gap-stack-sm">
              <button
                onClick={loadData}
                className="px-4 py-2 border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors"
              >
                Refresh
              </button>
              {canCreateTasks && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors"
                >
                  + Create Task
                </button>
              )}
            </div>
          </div>

          {error && (
            <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">
              {error}
            </p>
          )}

          <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                <tr>
                  <th className="py-3 px-4 border-r border-surface-variant">
                    Task Description
                  </th>
                  <th className="py-3 px-4 w-40 border-r border-surface-variant">Doer</th>
                  <th className="py-3 px-4 w-32 border-r border-surface-variant text-center">
                    Due Date
                  </th>
                  <th className="py-3 px-4 w-40 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {loading && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      Loading...
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      No tasks found.
                    </td>
                  </tr>
                )}
                {filtered.map((task, i) => (
                  <tr
                    key={task.id}
                    className={`transition-colors group ${
                      isUrgentPriority(task.priority)
                        ? "bg-yellow-100 hover:bg-yellow-200"
                        : "hover:bg-surface-container-low"
                    } ${i !== filtered.length - 1 ? "border-b border-surface-variant" : ""}`}
                  >
                    <td className="py-3 px-4 border-r border-surface-variant group-hover:underline cursor-pointer">
                      {task.title}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant">
                      {canCreateTasks ? (
                        <select
                          value={task.assignedDoerId}
                          onChange={(e) => handleReassign(task.id, e.target.value)}
                          className="w-full border-2 border-on-surface bg-surface px-2 py-1 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
                        >
                          {doers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex items-center gap-2">
                          <InitialsAvatar
                            name={task.doer?.name ?? "?"}
                            className="w-6 h-6 border border-on-surface"
                          />
                          <span className="font-label-sm text-label-sm uppercase truncate">
                            {task.doer?.name ?? "Unassigned"}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-data-mono">
                      {formatDMY(task.dueDate)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {task.status !== "Cancelled" && (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleMarkDone(task.id)}
                            className="px-3 py-1 bg-on-surface text-surface-container-lowest font-label-sm text-label-sm uppercase hover:bg-primary transition-colors"
                          >
                            Done
                          </button>
                          <button
                            onClick={() => setTaskToRevise(task)}
                            className="px-3 py-1 border-2 border-on-surface text-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors"
                          >
                            Revise
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {showCreate && (
        <CreateTaskModal
          doers={doers}
          lists={lists}
          defaultListId={listFilter}
          onClose={() => setShowCreate(false)}
          onCreated={(task) => {
            const doer = doers.find((d) => d.id === task.assignedDoerId) ?? null;
            setTasks((prev) => [{ ...task, doer }, ...prev]);
            setShowCreate(false);
          }}
        />
      )}

      {taskToRevise && (
        <ReviseTaskModal
          task={taskToRevise}
          onClose={() => setTaskToRevise(null)}
          onRevised={() => {
            setTaskToRevise(null);
            loadData(); // refresh tasks to show new revision info and due date
          }}
        />
      )}
    </>
  );
}

export default function TaskListPage() {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <TaskListInner />
      </Suspense>
    </AuthGuard>
  );
}
