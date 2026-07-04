"use client";

import { useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import InitialsAvatar from "@/components/InitialsAvatar";
import AuthGuard from "@/components/AuthGuard";
import CreateTaskModal from "@/components/CreateTaskModal";
import ReviseTaskModal from "@/components/ReviseTaskModal";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Doer, Task, TaskPriority, TaskStatus } from "@/lib/types";

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  if (priority === "Urgent" || priority === "Critical") {
    return (
      <span className="inline-block bg-error text-on-error font-label-sm text-label-sm uppercase px-2 py-0.5">
        {priority}
      </span>
    );
  }
  if (priority === "Normal") {
    return (
      <span className="inline-block bg-on-surface text-surface-container-lowest font-label-sm text-label-sm uppercase px-2 py-0.5">
        Normal
      </span>
    );
  }
  return (
    <span className="inline-block border border-on-surface text-on-surface font-label-sm text-label-sm uppercase px-2 py-0.5">
      {priority}
    </span>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  if (status === "Completed") {
    return (
      <span className="inline-block border-2 border-on-surface bg-on-surface text-surface-container-lowest font-label-sm text-label-sm uppercase px-3 py-1">
        Completed
      </span>
    );
  }
  if (status === "Cancelled") {
    return (
      <span className="inline-block border-2 border-error text-error font-label-sm text-label-sm uppercase px-3 py-1">
        Cancelled
      </span>
    );
  }
  return (
    <span className="inline-block border-2 border-on-surface text-on-surface font-label-sm text-label-sm uppercase px-3 py-1">
      {status}
    </span>
  );
}

function TaskListInner() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [doers, setDoers] = useState<Doer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [taskToRevise, setTaskToRevise] = useState<Task | null>(null);
  const [search, setSearch] = useState("");
  const { user } = useAuth();
  const canCreateTasks =
    user?.role === "Admin" || user?.role === "Manager" || user?.role === "PC";

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [taskData, doerData] = await Promise.all([
        api.get<Task[]>("/tasks"),
        api.get<Doer[]>("/users"),
      ]);
      setTasks(taskData);
      setDoers(doerData);
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

  const filtered = tasks.filter((t) =>
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
          <div className="flex justify-between items-end border-b-2 border-on-surface pb-stack-md">
            <div>
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-xl md:text-headline-xl text-on-surface uppercase tracking-tighter">
                Active Task Directory
              </h2>
              <p className="font-data-mono text-data-mono text-on-surface-variant mt-2 uppercase">
                {tasks.length} entries &bull; System Live
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
                    Priority
                  </th>
                  <th className="py-3 px-4 w-32 border-r border-surface-variant text-center">
                    Due Date
                  </th>
                  <th className="py-3 px-4 w-40 border-r border-surface-variant text-center">Status</th>
                  <th className="py-3 px-4 w-40 text-center">Action</th>
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
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      No tasks found.
                    </td>
                  </tr>
                )}
                {filtered.map((task, i) => (
                  <tr
                    key={task.id}
                    className={`hover:bg-surface-container-low transition-colors group ${
                      i !== filtered.length - 1 ? "border-b border-surface-variant" : ""
                    }`}
                  >
                    <td className="py-3 px-4 border-r border-surface-variant group-hover:underline cursor-pointer">
                      {task.title}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant">
                      <div className="flex items-center gap-2">
                        <InitialsAvatar
                          name={task.doer?.name ?? "?"}
                          className="w-6 h-6 border border-on-surface"
                        />
                        <span className="font-label-sm text-label-sm uppercase truncate">
                          {task.doer?.name ?? "Unassigned"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center">
                      <PriorityBadge priority={task.priority} />
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-data-mono">
                      {task.dueDate}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center">
                      <StatusPill status={task.status} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {task.status !== "Completed" && task.status !== "Cancelled" && (
                          <button
                            onClick={() => handleMarkDone(task.id)}
                            className="px-3 py-1 bg-on-surface text-surface-container-lowest font-label-sm text-label-sm uppercase hover:bg-primary transition-colors"
                          >
                            Mark Done
                          </button>
                        )}
                        {task.status !== "Completed" && task.status !== "Cancelled" && (
                          <button
                            onClick={() => setTaskToRevise(task)}
                            className="px-3 py-1 border-2 border-on-surface text-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors"
                          >
                            Revise
                          </button>
                        )}
                      </div>
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
      <TaskListInner />
    </AuthGuard>
  );
}
