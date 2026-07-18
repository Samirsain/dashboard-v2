"use client";

import { useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import CreateWorkflowTemplateModal from "@/components/CreateWorkflowTemplateModal";
import StartWorkflowInstanceModal from "@/components/StartWorkflowInstanceModal";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type {
  Doer,
  WorkflowInstance,
  WorkflowInstanceStatus,
  WorkflowStepEvent,
  WorkflowStepStatus,
  WorkflowTemplate,
} from "@/lib/types";

function StepStatusBadge({ status }: { status: WorkflowStepStatus }) {
  const styles: Record<WorkflowStepStatus, string> = {
    Pending: "border-2 border-on-surface-variant text-on-surface-variant",
    Active: "border-2 border-on-surface bg-on-surface text-surface-container-lowest",
    Complete: "border-2 border-primary bg-primary-container text-on-primary",
    Blocked: "border-2 border-error text-error",
    Overdue: "border-2 border-error bg-error text-on-error",
  };
  return (
    <span className={`inline-block font-label-sm text-label-sm uppercase px-2 py-0.5 ${styles[status]}`}>
      {status}
    </span>
  );
}

function formatDelay(planned: string, actual: string): string {
  if (!planned || !actual) return "—";
  const diffMs = new Date(actual).getTime() - new Date(planned).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes === 0) return "On time";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return minutes > 0 ? `+${label} late` : `-${label} early`;
}

function formatTs(ts: string): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function WorkflowInner() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";

  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [doers, setDoers] = useState<Doer[]>([]);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [statusFilter, setStatusFilter] = useState<WorkflowInstanceStatus>("Active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSteps, setSelectedSteps] = useState<WorkflowStepEvent[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<WorkflowInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [showStartInstance, setShowStartInstance] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [templateData, doerData, instanceData] = await Promise.all([
        api.get<WorkflowTemplate[]>("/workflow/templates"),
        api.get<Doer[]>("/users"),
        api.get<WorkflowInstance[]>(`/workflow/instances?status=${statusFilter}`),
      ]);
      setTemplates(templateData);
      setDoers(doerData.filter((d) => d.role === "Doer" || d.role === "Admin"));
      setInstances(instanceData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load workflow data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadData();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function openInstance(id: string) {
    setSelectedId(id);
    try {
      const detail = await api.get<{ instance: WorkflowInstance; steps: WorkflowStepEvent[] }>(
        `/workflow/instances/${id}`
      );
      setSelectedSteps(detail.steps);
      setSelectedInstance(detail.instance);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to load workflow instance.");
    }
  }

  async function refreshSelected() {
    if (selectedId) await openInstance(selectedId);
    await loadData();
  }

  async function handleComplete(stepNo: number) {
    if (!selectedId) return;
    try {
      await api.post(`/workflow/instances/${selectedId}/steps/${stepNo}/complete`);
      await refreshSelected();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to complete step.");
    }
  }

  async function handleReject(stepNo: number) {
    if (!selectedId) return;
    if (!confirm(`Reject step ${stepNo}? This sends the work back to step ${stepNo - 1} for rework.`)) return;
    try {
      await api.post(`/workflow/instances/${selectedId}/steps/${stepNo}/reject`);
      await refreshSelected();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to reject step.");
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm("Delete this workflow template? Existing runs are unaffected.")) return;
    try {
      await api.delete(`/workflow/templates/${id}`);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete template.");
    }
  }

  const doerName = (id: string) => doers.find((d) => d.id === id)?.name ?? id;

  return (
    <>
      <MobileHeader />
      <SideNav active="workflow" />

      <div className="md:ml-64 flex flex-col min-h-screen bg-background">
        <header className="hidden md:flex justify-between items-center h-16 w-full px-container-padding sticky top-0 z-30 border-b-2 border-on-surface bg-surface">
          <h2 className="font-headline-md text-headline-md text-on-surface uppercase">Workflow</h2>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                onClick={() => setShowCreateTemplate(true)}
                className="border-2 border-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
              >
                + New Template
              </button>
            )}
            <button
              onClick={() => setShowStartInstance(true)}
              disabled={templates.length === 0}
              className="border-2 border-on-surface bg-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-surface hover:bg-primary transition-colors disabled:opacity-50"
            >
              + Start Workflow
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-container-padding flex flex-col gap-stack-lg">
          {/* Mobile actions (desktop header is hidden below md) */}
          <div className="md:hidden flex flex-wrap gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowCreateTemplate(true)}
                className="flex-1 border-2 border-on-surface px-3 py-2 font-label-sm text-label-sm uppercase text-on-surface"
              >
                + New Template
              </button>
            )}
            <button
              onClick={() => setShowStartInstance(true)}
              disabled={templates.length === 0}
              className="flex-1 border-2 border-on-surface bg-on-surface px-3 py-2 font-label-sm text-label-sm uppercase text-surface disabled:opacity-50"
            >
              + Start Workflow
            </button>
          </div>

          {error && (
            <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">
              {error}
            </p>
          )}

          {/* Templates */}
          <div className="bg-surface border-2 border-on-surface p-stack-lg">
            <h3 className="font-headline-md text-headline-md text-on-surface border-b-2 border-on-surface pb-stack-md mb-stack-md">
              Templates
            </h3>
            {templates.length === 0 ? (
              <p className="font-data-mono text-data-mono text-on-surface-variant">
                No workflow templates yet.
                {isAdmin ? ' Use "+ New Template" above.' : ""}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((t) => (
                  <div key={t.id} className="border-2 border-on-surface p-stack-md">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-body-md text-body-md text-on-surface">{t.name}</span>
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteTemplate(t.id)}
                          className="border-2 border-error text-error px-2 py-0.5 font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <ol className="font-data-mono text-data-mono text-on-surface-variant text-xs flex flex-col gap-0.5">
                      {t.steps.map((s) => (
                        <li key={s.id}>
                          {s.stepNo}. {s.what} — {doerName(s.doerId)} ({s.tat})
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Instances */}
          <div className="bg-surface border-2 border-on-surface flex flex-col">
            <div className="bg-surface-container-low border-b-2 border-on-surface p-stack-md flex justify-between items-center">
              <h3 className="font-headline-md text-headline-md text-on-surface">Runs</h3>
              <div className="flex gap-2">
                {(["Active", "Complete"] as WorkflowInstanceStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={
                      statusFilter === s
                        ? "border-2 border-on-surface bg-on-surface text-surface px-3 py-1 font-label-sm text-label-sm uppercase"
                        : "border-2 border-on-surface px-3 py-1 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface">
                    <th className="py-3 px-4">Title</th>
                    <th className="py-3 px-4">Started</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="font-body-md text-body-md text-on-surface">
                  {!loading && instances.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                        No {statusFilter.toLowerCase()} runs.
                      </td>
                    </tr>
                  )}
                  {instances.map((inst) => (
                    <tr
                      key={inst.id}
                      onClick={() => openInstance(inst.id)}
                      className={`border-b border-outline-variant last:border-b-0 hover:bg-surface-container-lowest transition-colors cursor-pointer ${
                        selectedId === inst.id ? "bg-surface-container-lowest" : ""
                      }`}
                    >
                      <td className="py-4 px-4 font-medium">
                        {inst.title}
                        {inst.details && (
                          <div className="font-data-mono text-data-mono text-on-surface-variant text-xs mt-0.5 truncate max-w-xs">
                            {inst.details}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 font-data-mono text-data-mono text-on-surface-variant">
                        {formatTs(inst.startedAt)}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <StepStatusBadge status={inst.status === "Complete" ? "Complete" : "Active"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected instance detail */}
          {selectedId && (
            <div className="bg-surface border-2 border-on-surface p-stack-lg">
              <div className="border-b-2 border-on-surface pb-stack-md mb-stack-md">
                <h3 className="font-headline-md text-headline-md text-on-surface">Step Timeline</h3>
                {selectedInstance?.details && (
                  <p className="font-data-mono text-data-mono text-on-surface-variant text-sm mt-1 whitespace-pre-wrap">
                    {selectedInstance.details}
                  </p>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-surface-container-low border-b-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">What</th>
                      <th className="py-2 px-3">Who</th>
                      <th className="py-2 px-3">Planned</th>
                      <th className="py-2 px-3">Actual</th>
                      <th className="py-2 px-3">Delay</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-md text-body-md text-on-surface">
                    {selectedSteps.map((s) => {
                      const canAct =
                        (s.status === "Active" || s.status === "Overdue") &&
                        (s.doerId === user?.id || isAdmin);
                      return (
                        <tr key={s.id} className="border-b border-outline-variant last:border-b-0">
                          <td className="py-3 px-3 font-data-mono text-data-mono">{s.stepNo}</td>
                          <td className="py-3 px-3">{s.what}</td>
                          <td className="py-3 px-3 text-on-surface-variant">{doerName(s.doerId)}</td>
                          <td className="py-3 px-3 font-data-mono text-data-mono text-on-surface-variant">
                            {s.tat.toUpperCase() === "WHENEVER_NEEDED" ? "—" : formatTs(s.planned)}
                          </td>
                          <td className="py-3 px-3 font-data-mono text-data-mono text-on-surface-variant">
                            {formatTs(s.actual)}
                          </td>
                          <td className="py-3 px-3 font-data-mono text-data-mono text-on-surface-variant">
                            {formatDelay(s.planned, s.actual)}
                          </td>
                          <td className="py-3 px-3">
                            <StepStatusBadge status={s.status} />
                            {s.reworkCount > 0 && (
                              <span className="ml-2 font-label-sm text-label-sm text-on-surface-variant">
                                (rework x{s.reworkCount})
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {canAct && (
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => handleComplete(s.stepNo)}
                                  className="border-2 border-on-surface bg-on-surface text-surface px-2 py-1 font-label-sm text-label-sm uppercase hover:bg-primary transition-colors"
                                >
                                  Done
                                </button>
                                {s.stepNo > 1 && (
                                  <button
                                    onClick={() => handleReject(s.stepNo)}
                                    className="border-2 border-error text-error px-2 py-1 font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors"
                                  >
                                    Reject
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {showCreateTemplate && (
        <CreateWorkflowTemplateModal
          doers={doers}
          onClose={() => setShowCreateTemplate(false)}
          onCreated={(t) => {
            setTemplates((prev) => [...prev, t]);
            setShowCreateTemplate(false);
          }}
        />
      )}

      {showStartInstance && (
        <StartWorkflowInstanceModal
          templates={templates}
          onClose={() => setShowStartInstance(false)}
          onStarted={({ instance }) => {
            setShowStartInstance(false);
            setStatusFilter("Active");
            loadData();
            openInstance(instance.id);
          }}
        />
      )}
    </>
  );
}

export default function WorkflowPage() {
  return (
    <AuthGuard>
      <WorkflowInner />
    </AuthGuard>
  );
}
