"use client";

import { Fragment, useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import CreateWorkflowTemplateModal from "@/components/CreateWorkflowTemplateModal";
import StartWorkflowInstanceModal from "@/components/StartWorkflowInstanceModal";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { canManageWorkflow } from "@/lib/access";
import type {
  Doer,
  WorkflowFieldValue,
  WorkflowInstance,
  WorkflowInstanceStatus,
  WorkflowStepEvent,
  WorkflowStepStatus,
  WorkflowTemplate,
} from "@/lib/types";

/** GET /workflow/templates/:id/export — one What/Who/How/When block per step, one row per run. */
type WorkflowTemplateExport = {
  templateName: string;
  fieldLabels: string[];
  steps: Array<{ stepNo: number; what: string; doerName: string; how: string; tat: string }>;
  runs: Array<{
    startedAt: string;
    fieldValues: string[];
    steps: Array<{
      stepNo: number;
      planned: string;
      actual: string;
      status: WorkflowStepStatus | "Pending";
      delayMinutes: number | null;
    }>;
  }>;
};

/** "30m" -> "30 minutes", "2h" -> "2 hours", the symbolic ones as their plain-English name. */
function describeTat(tat: string): string {
  const t = tat.trim().toUpperCase();
  if (t === "WHENEVER_NEEDED") return "Whenever Needed";
  if (t === "SAME_DAY") return "Same Day";
  if (t === "NEXT_DAY") return "Next Day";
  const minutes = t.match(/^(\d+(?:\.\d+)?)M$/);
  if (minutes) return `${minutes[1]} minutes`;
  const hours = t.match(/^(\d+(?:\.\d+)?)H?$/);
  if (hours) return `${hours[1]} hours`;
  return tat;
}

function formatDelayMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes === 0) return "On time";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return minutes > 0 ? `+${label} late` : `-${label} early`;
}

/** Quotes a CSV cell only when it needs it, doubling any embedded quotes. */
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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

/** Fixed width (px) of each sticky identity column (Timestamp + each field). */
const IDENTITY_COL_WIDTH = 168;

/**
 * Premium live view of a template: a step pipeline strip up top (what/who/
 * how/tat per step, at a glance, once — not repeated as four table rows),
 * then a clean data table below with one row per run. The Timestamp + field
 * columns stay pinned on scroll so a wide chain of steps never loses its
 * "which run is this" anchor — built for someone managing many workflows
 * with many steps at once.
 */
function WorkflowSheetTable({ data }: { data: WorkflowTemplateExport }) {
  const identityCols = 1 + data.fieldLabels.length;

  return (
    <div className="flex flex-col gap-0">
      {/* Step pipeline: the What/Who/How/When of the chain, read left to right once. */}
      <div className="flex items-stretch overflow-x-auto border-2 border-on-surface bg-surface">
        {data.steps.map((s, i) => (
          <Fragment key={s.stepNo}>
            <div className="flex-shrink-0 w-52 p-3 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 flex items-center justify-center border-2 border-on-surface bg-on-surface text-surface font-label-sm text-[10px] shrink-0">
                  {s.stepNo}
                </span>
                <span className="font-label-sm text-label-sm uppercase text-on-surface-variant truncate">
                  {describeTat(s.tat)}
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface font-semibold leading-tight" title={s.what}>
                {s.what}
              </p>
              <p className="font-label-sm text-label-sm text-on-surface-variant truncate" title={`${s.doerName} · ${s.how}`}>
                {s.doerName} · {s.how}
              </p>
            </div>
            {i < data.steps.length - 1 && (
              <div className="flex items-center justify-center w-7 flex-shrink-0 text-on-surface-variant border-l-2 border-on-surface bg-surface-container-lowest">
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </div>
            )}
          </Fragment>
        ))}
      </div>

      {/* Run data: pinned Timestamp + fields on the left, steps scroll on the right. */}
      <div className="border-2 border-t-0 border-on-surface overflow-auto max-h-[65vh] bg-surface-container-lowest">
        <table className="border-collapse text-left w-full">
          <thead>
            <tr className="bg-surface-container">
              <th
                className="sticky top-0 left-0 z-30 bg-surface-container py-2 px-3 border-r-2 border-b-2 border-on-surface font-label-sm text-label-sm uppercase whitespace-nowrap"
                style={{ width: IDENTITY_COL_WIDTH }}
              >
                Timestamp
              </th>
              {data.fieldLabels.map((label, i) => (
                <th
                  key={label}
                  className="sticky top-0 z-20 bg-surface-container py-2 px-3 border-r-2 border-b-2 border-on-surface font-label-sm text-label-sm uppercase whitespace-nowrap"
                  style={{ left: (i + 1) * IDENTITY_COL_WIDTH, width: IDENTITY_COL_WIDTH }}
                >
                  {label}
                </th>
              ))}
              {data.steps.map((s) => (
                <th
                  key={s.stepNo}
                  colSpan={4}
                  className="sticky top-0 z-10 bg-surface-container py-2 px-3 border-r-2 border-b-2 border-on-surface font-label-sm text-label-sm uppercase text-center"
                >
                  Step {s.stepNo}
                </th>
              ))}
            </tr>
            <tr className="bg-surface-container">
              <th
                className="sticky top-9 left-0 z-30 bg-surface-container border-r-2 border-b-2 border-on-surface"
                style={{ width: IDENTITY_COL_WIDTH }}
              />
              {data.fieldLabels.map((label, i) => (
                <th
                  key={label}
                  className="sticky top-9 z-20 bg-surface-container border-r-2 border-b-2 border-on-surface"
                  style={{ left: (i + 1) * IDENTITY_COL_WIDTH, width: IDENTITY_COL_WIDTH }}
                />
              ))}
              {data.steps.map((s) =>
                ["Planned", "Actual", "Status", "Delay"].map((h) => (
                  <th
                    key={`${s.stepNo}-${h}`}
                    className="sticky top-9 z-10 bg-surface-container-low py-1.5 px-3 border-r border-b-2 border-on-surface font-label-sm text-[10px] uppercase text-on-surface-variant whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody className="font-body-md text-body-md text-on-surface">
            {data.runs.length === 0 ? (
              <tr>
                <td colSpan={identityCols + data.steps.length * 4} className="py-6 px-3 text-center text-on-surface-variant">
                  No runs yet.
                </td>
              </tr>
            ) : (
              data.runs.map((run, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-surface" : "bg-surface-container-lowest"}>
                  <td
                    className="sticky left-0 z-10 bg-inherit py-2 px-3 border-r-2 border-b border-on-surface font-label-sm text-label-sm whitespace-nowrap"
                    style={{ width: IDENTITY_COL_WIDTH }}
                  >
                    {formatTs(run.startedAt)}
                  </td>
                  {run.fieldValues.map((v, j) => (
                    <td
                      key={j}
                      className="sticky z-10 bg-inherit py-2 px-3 border-r-2 border-b border-on-surface font-semibold truncate"
                      style={{ left: (j + 1) * IDENTITY_COL_WIDTH, width: IDENTITY_COL_WIDTH }}
                      title={v}
                    >
                      {v || "—"}
                    </td>
                  ))}
                  {run.steps.map((s) => (
                    <Fragment key={s.stepNo}>
                      <td className="py-2 px-3 border-r border-b border-on-surface whitespace-nowrap text-xs text-on-surface-variant">
                        {s.planned ? formatTs(s.planned) : "—"}
                      </td>
                      <td className="py-2 px-3 border-r border-b border-on-surface whitespace-nowrap text-xs text-on-surface-variant">
                        {s.actual ? formatTs(s.actual) : "—"}
                      </td>
                      <td className="py-2 px-3 border-r border-b border-on-surface">
                        <StepStatusBadge status={s.status} />
                      </td>
                      <td
                        className={`py-2 px-3 border-r border-b border-on-surface whitespace-nowrap text-xs font-semibold ${
                          s.delayMinutes === null
                            ? "text-on-surface-variant"
                            : s.delayMinutes > 0
                            ? "text-error"
                            : "text-primary"
                        }`}
                      >
                        {formatDelayMinutes(s.delayMinutes)}
                      </td>
                    </Fragment>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One of the signed-in doer's own steps, as returned by /workflow/my-steps. */
type MyStep = {
  instanceId: string;
  instanceTitle: string;
  instanceDetails: string;
  /** Which workflow this actually is (the template name) — not just this run's title. */
  templateName: string;
  fieldValues: WorkflowFieldValue[];
  totalSteps: number;
  isMyTurn: boolean;
  doerName: string;
  step: WorkflowStepEvent;
};

/** One labelled WHAT / WHO / HOW / WHEN line on a doer's step card. */
function StepFact({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: "normal" | "error";
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <span className="w-14 shrink-0 font-label-sm text-label-sm uppercase text-on-surface-variant">
        {label}
      </span>
      <span
        className={`font-body-md text-body-md ${
          emphasis === "error" ? "text-error font-bold" : "text-on-surface"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * The Workflow page as a plain doer sees it: just their own steps and a button
 * to mark one done. No templates, no runs table, no starting a workflow —
 * those are management concerns and only add noise here.
 */
function MyWorkflowSteps() {
  const [rows, setRows] = useState<MyStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Which workflow box is expanded — collapsed by default; tick one to open it.
  const [openWorkflow, setOpenWorkflow] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setRows(await api.get<MyStep[]>("/workflow/my-steps"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load your workflow steps.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
    // Overdue is computed from the current time on every request, so a step
    // due "now" won't turn red on its own — someone has to ask again. Re-poll
    // periodically so it goes red on its own while the page is left open,
    // instead of only updating on a manual reload.
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  async function act(row: MyStep, action: "complete" | "reject") {
    if (
      action === "reject" &&
      !confirm(`Send "${row.step.what}" back to the previous person for rework?`)
    ) {
      return;
    }
    setBusyKey(`${row.instanceId}:${row.step.stepNo}`);
    try {
      await api.post(`/workflow/instances/${row.instanceId}/steps/${row.step.stepNo}/${action}`);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not update this step.");
    } finally {
      setBusyKey(null);
    }
  }

  const myTurn = rows.filter((r) => r.isMyTurn);
  const later = rows.filter((r) => !r.isMyTurn);
  const overdueCount = myTurn.filter((r) => r.step.status === "Overdue").length;

  // Grouped by workflow so the doer picks a workflow first, then sees its
  // steps — rather than every step from every workflow mixed in one list.
  const myTurnByWorkflow = new Map<string, MyStep[]>();
  for (const row of myTurn) {
    const key = row.templateName || "Workflow";
    myTurnByWorkflow.set(key, [...(myTurnByWorkflow.get(key) ?? []), row]);
  }

  return (
    <>
      <MobileHeader />
      <SideNav active="workflow" />

      <div className="md:ml-64 flex flex-col min-h-screen bg-background">
        <header className="flex w-full items-center border-b border-on-surface bg-surface p-3 z-30 md:h-16 md:py-0 md:px-container-padding md:sticky md:top-0">
          <h2 className="font-headline-md text-headline-md text-on-surface uppercase">My Workflow</h2>
        </header>

        <main className="flex-1 p-3 md:p-4 flex flex-col gap-2">
          {error && (
            <p className="font-label-sm text-sm text-error border border-error px-3 py-2">{error}</p>
          )}

          {loading && (
            <p className="font-data-mono text-data-mono text-on-surface-variant">Loading…</p>
          )}

          {!loading && myTurn.length === 0 && (
            <div className="border-2 border-on-surface bg-surface p-8 text-center">
              <p className="font-body-md text-body-md text-on-surface">
                Nothing is waiting on you right now.
              </p>
              <p className="mt-1 font-data-mono text-data-mono text-on-surface-variant text-xs">
                A step shows up here the moment it becomes your turn.
              </p>
            </div>
          )}

          {/* One-glance count so a long list doesn't need scrolling to know
              how much is pending and how much is already late. */}
          {!loading && myTurn.length > 0 && (
            <div
              className={`flex flex-wrap items-center gap-2 border-2 px-4 py-2.5 ${
                overdueCount > 0 ? "border-error bg-error/10" : "border-on-surface bg-surface"
              }`}
            >
              <span className="font-headline-md text-headline-md text-on-surface">
                {myTurn.length} {myTurn.length === 1 ? "task" : "tasks"} with you
              </span>
              {overdueCount > 0 && (
                <span className="border-2 border-error bg-error text-on-error px-2 py-0.5 font-label-sm text-label-sm uppercase">
                  {overdueCount} overdue
                </span>
              )}
            </div>
          )}

          {/* One box per workflow — tick its name to open it and see its steps. */}
          {Array.from(myTurnByWorkflow.entries()).map(([workflowName, workflowRows]) => {
            const open = openWorkflow === workflowName;
            const workflowOverdueCount = workflowRows.filter((r) => r.step.status === "Overdue").length;
            return (
              <div
                key={workflowName}
                className={`border-2 bg-surface ${
                  workflowOverdueCount > 0 ? "border-error" : "border-on-surface"
                }`}
              >
                <button
                  onClick={() => setOpenWorkflow((prev) => (prev === workflowName ? null : workflowName))}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-surface-container transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={open}
                      readOnly
                      className="shrink-0 pointer-events-none"
                    />
                    <span className="font-headline-md text-headline-md text-on-surface uppercase truncate">
                      {workflowName}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                      {workflowRows.length} {workflowRows.length === 1 ? "task" : "tasks"}
                    </span>
                    {workflowOverdueCount > 0 && (
                      <span className="border-2 border-error bg-error text-on-error px-1.5 py-0.5 font-label-sm text-[10px] uppercase">
                        {workflowOverdueCount} overdue
                      </span>
                    )}
                    <span className="material-symbols-outlined text-on-surface-variant">
                      {open ? "expand_less" : "expand_more"}
                    </span>
                  </span>
                </button>

                {open && (
                  <div className="border-t-2 border-on-surface p-2 flex flex-col gap-2 bg-surface-container-lowest">
                    {workflowRows.map((row) => {
                      const s = row.step;
                      const overdue = s.status === "Overdue";
                      const busy = busyKey === `${row.instanceId}:${s.stepNo}`;
                      return (
                        <div
                          key={s.id}
                          className={`border-2 bg-surface p-3 flex flex-col gap-2 ${
                            overdue ? "border-error" : "border-on-surface"
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-on-surface/20 pb-1.5">
                            <p className="font-data-mono text-data-mono text-on-surface-variant text-xs uppercase">
                              {row.instanceTitle} · Step {s.stepNo} of {row.totalSteps}
                            </p>
                            <StepStatusBadge status={s.status} />
                          </div>

                          {/* The four things a doer needs: what to do, who does it, how, and by when. */}
                          <div className="flex flex-col gap-1">
                            <StepFact label="What" value={s.what} />
                            <StepFact label="Who" value={row.doerName || "You"} />
                            <StepFact label="How" value={s.how || "—"} />
                            <StepFact
                              label="When"
                              value={
                                s.planned
                                  ? `${overdue ? "Was due " : "By "}${formatTs(s.planned)}`
                                  : "No deadline"
                              }
                              emphasis={overdue ? "error" : "normal"}
                            />
                          </div>

                          {/* The run's own data — what this step is actually about. */}
                          {row.fieldValues.length > 0 && (
                            <div className="border border-on-surface/20 bg-surface-container-lowest p-2 flex flex-col gap-0.5">
                              {row.fieldValues.map((f) => (
                                <div key={f.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                                  <span className="w-32 shrink-0 font-label-sm text-label-sm uppercase text-on-surface-variant">
                                    {f.label}
                                  </span>
                                  <span className="font-data-mono text-data-mono text-on-surface">
                                    {f.value || "—"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {row.instanceDetails && (
                            <p className="font-data-mono text-data-mono text-on-surface-variant text-xs whitespace-pre-wrap">
                              {row.instanceDetails}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-3 border-t border-on-surface/20 pt-2">
                            <button
                              onClick={() => act(row, "complete")}
                              disabled={busy}
                              className="inline-flex items-center justify-center min-h-[40px] px-5 font-label-sm text-label-sm uppercase tracking-wide border-2 border-on-surface bg-on-surface text-surface hover:opacity-90 transition-colors cursor-pointer disabled:opacity-40"
                            >
                              {busy ? "Saving…" : "Mark Done"}
                            </button>
                            {s.stepNo > 1 && (
                              <button
                                onClick={() => act(row, "reject")}
                                disabled={busy}
                                title="Work isn't right — send it back to the previous person"
                                className="font-label-sm text-label-sm uppercase text-on-surface-variant underline underline-offset-4 hover:text-error transition-colors cursor-pointer disabled:opacity-40"
                              >
                                Send Back
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {later.length > 0 && (
            <div className="border-2 border-on-surface bg-surface">
              <p className="border-b-2 border-on-surface bg-surface-container-low px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface-variant">
                Coming up for you ({later.length})
              </p>
              {later.map((row) => (
                <div
                  key={row.step.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant px-3 py-2 last:border-b-0"
                >
                  <span className="font-body-md text-body-md text-on-surface">{row.step.what}</span>
                  <span className="font-data-mono text-data-mono text-on-surface-variant text-xs uppercase">
                    {row.templateName ? `${row.templateName} · ` : ""}
                    {row.instanceTitle} · waiting on step {row.step.stepNo - 1}
                  </span>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

function WorkflowInner() {
  const { user } = useAuth();
  const isAdmin = canManageWorkflow(user);

  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [doers, setDoers] = useState<Doer[]>([]);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [statusFilter, setStatusFilter] = useState<WorkflowInstanceStatus>("Active");
  // At 100+ runs the plain list stops being scannable — narrow it down
  // instead of rendering everything at once.
  const [runSearch, setRunSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState("ALL");
  const RUN_PAGE_SIZE = 20;
  const [visibleRunCount, setVisibleRunCount] = useState(RUN_PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSteps, setSelectedSteps] = useState<WorkflowStepEvent[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<WorkflowInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [showStartInstance, setShowStartInstance] = useState(false);
  // Which template's step list is currently expanded — collapsed by default
  // so the section reads as a name list, not a wall of every chain at once.
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  // Template id currently being exported, so its button disables briefly.
  const [exportingId, setExportingId] = useState<string | null>(null);
  // Sheet data for each template, fetched the moment its box opens — this IS
  // the template's expanded view now, not an optional extra.
  const [sheetLoadingId, setSheetLoadingId] = useState<string | null>(null);
  const [sheetDataByTemplate, setSheetDataByTemplate] = useState<Record<string, WorkflowTemplateExport>>({});

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
      setDoers(doerData.filter((d) => d.role === "Doer" || d.role === "MD" || d.role === "PC"));
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

  const templateName = (id: string) => templates.find((t) => t.id === id)?.name ?? "—";

  const filteredInstances = instances.filter((inst) => {
    if (templateFilter !== "ALL" && inst.templateId !== templateFilter) return false;
    const q = runSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      inst.title.toLowerCase().includes(q) ||
      inst.details.toLowerCase().includes(q) ||
      inst.fieldValues.some((f) => f.value.toLowerCase().includes(q))
    );
  });
  const visibleInstances = filteredInstances.slice(0, visibleRunCount);

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
    if (!confirm("Delete this workflow template? Work already in progress is unaffected.")) return;
    try {
      await api.delete(`/workflow/templates/${id}`);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete template.");
    }
  }

  /**
   * Lays a template's runs out exactly like the original tracking sheet:
   * one What/Who/How/When header block per step, one row per run below —
   * that run's own field values, then every step's Planned/Actual/Status/
   * Delay in order. New runs just add rows underneath as they happen.
   */
  async function handleExportTemplate(templateId: string) {
    setExportingId(templateId);
    try {
      const data = await api.get<WorkflowTemplateExport>(`/workflow/templates/${templateId}/export`);

      const rows: string[][] = [];
      rows.push([]); // blank spacer row, matching the original sheet

      const stepBlock = (get: (s: WorkflowTemplateExport["steps"][number]) => string) => {
        const cells: string[] = [];
        for (const s of data.steps) {
          cells.push(get(s), "", "", ""); // value in the block's first column, 3 blanks after
        }
        return cells;
      };
      rows.push(["What", ...data.fieldLabels.map(() => ""), ...stepBlock((s) => s.what)]);
      rows.push(["Who", ...data.fieldLabels.map(() => ""), ...stepBlock((s) => s.doerName)]);
      rows.push(["How", ...data.fieldLabels.map(() => ""), ...stepBlock((s) => s.how)]);
      rows.push(["When", ...data.fieldLabels.map(() => ""), ...stepBlock((s) => describeTat(s.tat))]);

      const perStepHeaders = data.steps.flatMap(() => ["Planned", "Actual", "Status", "Time Delay"]);
      rows.push(["Timestamp", ...data.fieldLabels, ...perStepHeaders]);

      for (const run of data.runs) {
        const stepCells: string[] = [];
        for (const s of run.steps) {
          stepCells.push(
            s.planned ? formatTs(s.planned) : "—",
            s.actual ? formatTs(s.actual) : "—",
            s.status,
            formatDelayMinutes(s.delayMinutes)
          );
        }
        rows.push([formatTs(run.startedAt), ...run.fieldValues, ...stepCells]);
      }

      const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${data.templateName.replace(/[^a-z0-9]+/gi, "-")}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to export this workflow.");
    } finally {
      setExportingId(null);
    }
  }

  /** Same data as the export, shown live on-screen instead of downloaded. */
  async function loadSheet(templateId: string) {
    if (sheetDataByTemplate[templateId]) return;
    setSheetLoadingId(templateId);
    try {
      const data = await api.get<WorkflowTemplateExport>(`/workflow/templates/${templateId}/export`);
      setSheetDataByTemplate((prev) => ({ ...prev, [templateId]: data }));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to load this workflow's sheet.");
    } finally {
      setSheetLoadingId(null);
    }
  }

  async function handleDeleteInstance(inst: WorkflowInstance, e?: { stopPropagation: () => void }) {
    e?.stopPropagation(); // don't also trigger the row's openInstance click
    const warning =
      inst.status === "Active"
        ? " This work is still in progress — its full step history goes with it."
        : "";
    if (!confirm(`Permanently delete "${inst.title}"? This can't be undone.${warning}`)) return;
    try {
      await api.delete(`/workflow/instances/${inst.id}`);
      setInstances((prev) => prev.filter((i) => i.id !== inst.id));
      if (selectedId === inst.id) {
        setSelectedId(null);
        setSelectedSteps([]);
        setSelectedInstance(null);
      }
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete this work.");
    }
  }

  const doerName = (id: string) => doers.find((d) => d.id === id)?.name ?? id;

  return (
    <>
      <MobileHeader />
      <SideNav active="workflow" />

      <div className="md:ml-64 flex flex-col min-h-screen bg-background">
        <header className="flex flex-col gap-2 w-full border-b border-on-surface bg-surface p-3 z-30 md:flex-row md:items-center md:justify-between md:gap-4 md:h-16 md:py-0 md:px-container-padding md:sticky md:top-0">
          <h2 className="font-headline-md text-headline-md text-on-surface uppercase">Workflow</h2>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setShowCreateTemplate(true)}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-surface text-on-surface border-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                + New Template
              </button>
            )}
            <button
              onClick={() => setShowStartInstance(true)}
              disabled={templates.length === 0}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-on-surface text-surface border-on-surface hover:opacity-90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
            <p className="font-label-sm text-sm text-error border border-error px-3 py-2">
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
              <div className="border-2 border-on-surface divide-y-2 divide-on-surface">
                {templates.map((t) => {
                  const open = openTemplateId === t.id;
                  return (
                    <div key={t.id}>
                      <button
                        onClick={() => {
                          const next = open ? null : t.id;
                          setOpenTemplateId(next);
                          if (next && isAdmin) loadSheet(next);
                        }}
                        className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-surface-container transition-colors"
                      >
                        <span className="font-body-md text-body-md text-on-surface font-semibold uppercase">
                          {t.name}
                        </span>
                        <span className="flex items-center gap-3 shrink-0">
                          <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                            {t.steps.length} step{t.steps.length === 1 ? "" : "s"}
                          </span>
                          <span className="material-symbols-outlined text-on-surface-variant">
                            {open ? "expand_less" : "expand_more"}
                          </span>
                        </span>
                      </button>

                      {open && (
                        <div className="border-t-2 border-on-surface bg-surface-container-lowest p-stack-md flex flex-col gap-3">
                          {isAdmin ? (
                            sheetLoadingId === t.id ? (
                              <p className="font-data-mono text-data-mono text-on-surface-variant text-xs">Loading…</p>
                            ) : sheetDataByTemplate[t.id] ? (
                              <WorkflowSheetTable data={sheetDataByTemplate[t.id]!} />
                            ) : null
                          ) : (
                            <ol className="font-data-mono text-data-mono text-on-surface-variant text-xs flex flex-col gap-0.5">
                              {t.steps.map((s) => (
                                <li key={s.id}>
                                  {s.stepNo}. {s.what} — {doerName(s.doerId)} ({s.tat})
                                </li>
                              ))}
                            </ol>
                          )}
                          {isAdmin && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleExportTemplate(t.id)}
                                disabled={exportingId === t.id}
                                title="Download every run of this workflow as a spreadsheet — steps across the top, one row per run"
                                className="self-start border-2 border-on-surface text-on-surface px-2 py-0.5 font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors disabled:opacity-40"
                              >
                                {exportingId === t.id ? "Exporting…" : "Export"}
                              </button>
                              <button
                                onClick={() => handleDeleteTemplate(t.id)}
                                className="self-start border-2 border-error text-error px-2 py-0.5 font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Instances */}
          <div className="bg-surface border-2 border-on-surface flex flex-col">
            <div className="bg-surface-container-low border-b-2 border-on-surface p-stack-md flex flex-col gap-3">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  Ongoing Work
                  <span className="ml-2 font-data-mono text-data-mono text-on-surface-variant text-sm">
                    ({filteredInstances.length})
                  </span>
                </h3>
                <div className="flex gap-2">
                  {(["Active", "Complete"] as WorkflowInstanceStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setStatusFilter(s);
                        setVisibleRunCount(RUN_PAGE_SIZE);
                      }}
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

              {/* Search + template narrow the list down once there are many
                  templates each with many runs — scanning stops scaling fast. */}
              <div className="flex flex-wrap gap-2">
                <input
                  value={runSearch}
                  onChange={(e) => {
                    setRunSearch(e.target.value);
                    setVisibleRunCount(RUN_PAGE_SIZE);
                  }}
                  placeholder="Search title, details, or any field value..."
                  className="min-h-[38px] flex-1 min-w-[200px] border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-sm text-on-surface focus:outline-none"
                />
                <select
                  value={templateFilter}
                  onChange={(e) => {
                    setTemplateFilter(e.target.value);
                    setVisibleRunCount(RUN_PAGE_SIZE);
                  }}
                  className="min-h-[38px] border-2 border-on-surface bg-surface px-2 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
                >
                  <option value="ALL">All Templates</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface">
                    <th className="py-3 px-4">Title</th>
                    <th className="py-3 px-4">Template</th>
                    <th className="py-3 px-4">Started</th>
                    <th className="py-3 px-4 text-right">Status</th>
                    {isAdmin && <th className="py-3 px-4 w-20" />}
                  </tr>
                </thead>
                <tbody className="font-body-md text-body-md text-on-surface">
                  {!loading && filteredInstances.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 5 : 4} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                        {instances.length === 0
                          ? `No ${statusFilter.toLowerCase()} work.`
                          : "Nothing matches this search."}
                      </td>
                    </tr>
                  )}
                  {visibleInstances.map((inst) => (
                    <tr
                      key={inst.id}
                      onClick={() => openInstance(inst.id)}
                      className={`border-b border-outline-variant last:border-b-0 hover:bg-surface-container-lowest transition-colors cursor-pointer ${
                        selectedId === inst.id ? "bg-surface-container-lowest" : ""
                      }`}
                    >
                      <td className="py-4 px-4 font-medium">
                        <div className="flex items-center gap-2">
                          {inst.title}
                        </div>
                        {/* The title alone can repeat — e.g. two runs with the
                            same PO Number — so show whatever else the run
                            carries (Vendor, Qty, ...) to tell them apart. */}
                        {inst.fieldValues.length > 1 && (
                          <div className="font-data-mono text-data-mono text-on-surface-variant text-xs mt-0.5 truncate max-w-xs">
                            {inst.fieldValues
                              .slice(1)
                              .map((f) => `${f.label}: ${f.value || "—"}`)
                              .join(" · ")}
                          </div>
                        )}
                        {inst.details && (
                          <div className="font-data-mono text-data-mono text-on-surface-variant text-xs mt-0.5 truncate max-w-xs">
                            {inst.details}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 font-data-mono text-data-mono text-on-surface-variant text-xs uppercase">
                        {templateName(inst.templateId)}
                      </td>
                      <td className="py-4 px-4 font-data-mono text-data-mono text-on-surface-variant">
                        {formatTs(inst.startedAt)}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <StepStatusBadge status={inst.status === "Complete" ? "Complete" : "Active"} />
                      </td>
                      {isAdmin && (
                        <td className="py-4 px-4 text-right">
                          <button
                            onClick={(e) => handleDeleteInstance(inst, e)}
                            className="border-2 border-error text-error px-2 py-0.5 font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredInstances.length > visibleInstances.length && (
              <button
                onClick={() => setVisibleRunCount((prev) => prev + RUN_PAGE_SIZE)}
                className="border-t-2 border-on-surface px-4 py-3 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
              >
                Show {Math.min(RUN_PAGE_SIZE, filteredInstances.length - visibleInstances.length)} more
                ({filteredInstances.length - visibleInstances.length} left)
              </button>
            )}
          </div>

          {/* Selected instance detail */}
          {selectedId && (
            <div className="bg-surface border-2 border-on-surface p-stack-lg">
              <div className="border-b-2 border-on-surface pb-stack-md mb-stack-md">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-headline-md text-headline-md text-on-surface">Step Timeline</h3>
                  {isAdmin && selectedInstance && (
                    <button
                      onClick={() => handleDeleteInstance(selectedInstance)}
                      className="border-2 border-error text-error px-3 py-1 font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors shrink-0"
                    >
                      Delete This Work
                    </button>
                  )}
                </div>
                {(selectedInstance?.fieldValues?.length ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                    {selectedInstance!.fieldValues.map((f) => (
                      <span key={f.label} className="font-data-mono text-data-mono text-xs">
                        <span className="uppercase text-on-surface-variant">{f.label}: </span>
                        <span className="text-on-surface">{f.value || "—"}</span>
                      </span>
                    ))}
                  </div>
                )}
                {selectedInstance?.details && (
                  <p className="font-data-mono text-data-mono text-on-surface-variant text-sm mt-1 whitespace-pre-wrap">
                    {selectedInstance.details}
                  </p>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="bg-surface-container-low border-b-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">What</th>
                      <th className="py-2 px-3">Who</th>
                      <th className="py-2 px-3">How</th>
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
                          <td className="py-3 px-3 text-on-surface-variant">{s.how || "—"}</td>
                          <td className="py-3 px-3 font-data-mono text-data-mono text-on-surface-variant">
                            {s.planned ? formatTs(s.planned) : "—"}
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

/**
 * Two genuinely different screens behind one route: whoever manages workflows
 * gets the templates + runs + timeline view, everyone else gets just their own
 * steps. Splitting here (rather than hiding pieces inside one component) keeps
 * the doer's screen free of machinery they can't use anyway.
 */
function WorkflowRouter() {
  const { user } = useAuth();
  // Wait for the user before choosing, so a doer never flashes the admin view.
  if (!user) return null;
  return canManageWorkflow(user) ? <WorkflowInner /> : <MyWorkflowSteps />;
}

export default function WorkflowPage() {
  return (
    <AuthGuard>
      <WorkflowRouter />
    </AuthGuard>
  );
}
