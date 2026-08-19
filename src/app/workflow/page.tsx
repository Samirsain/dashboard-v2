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
    id: string;
    title: string;
    status: WorkflowInstanceStatus;
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

/**
 * GET /workflow/overview — everything in flight, across every template,
 * grouped by (workflow, step, person). Counts are exact; `runs` holds only the
 * most urgent few of each group, so a workflow with a thousand backed-up runs
 * stays one row here instead of a thousand.
 */
type WorkflowOverview = {
  totals: { activeRuns: number; overdueSteps: number; dueTodaySteps: number };
  templates: Array<{ id: string; name: string; activeRuns: number; overdueSteps: number }>;
  people: Array<{ doerId: string; doerName: string; total: number; overdue: number }>;
  buckets: Array<{
    key: string;
    templateId: string;
    templateName: string;
    stepNo: number;
    what: string;
    how: string;
    doerId: string;
    doerName: string;
    total: number;
    overdue: number;
    nextDue: string;
    runs: Array<{
      instanceId: string;
      runTitle: string;
      planned: string;
      status: WorkflowStepStatus;
      lateMinutes: number | null;
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

/** "3h 20m late" — how far past its deadline a step is right now. */
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

function formatTs(ts: string): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/** Same instant as formatTs but without the year — fits inside a table cell. */
function formatTsShort(ts: string): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** At 100+ runs the plain list stops being scannable — page it instead. */
const RUN_PAGE_SIZE = 20;


/** Which step of a run is somebody's turn right now, if any. */
function currentStepOf(run: WorkflowTemplateExport["runs"][number]) {
  return run.steps.find((s) => s.status === "Active" || s.status === "Overdue") ?? null;
}

/** Display text + colour for a step's status, styled as spreadsheet text — not a badge. */
function statusText(status: WorkflowStepStatus | "Pending"): { text: string; className: string } {
  switch (status) {
    case "Complete":
      return { text: "Done", className: "text-[#188038] font-medium" };
    case "Overdue":
      return { text: "Delayed", className: "text-[#c5221f] font-semibold" };
    case "Blocked":
      return { text: "Blocked", className: "text-[#c5221f] italic" };
    case "Active":
      return { text: "In Progress", className: "text-[#b06000] font-medium" };
    case "Pending":
    default:
      return { text: "Not Started", className: "text-[#80868b] italic" };
  }
}

/** Delay text coloured the way a spreadsheet would: red if late, grey dash otherwise. */
function delayText(minutes: number | null): { text: string; className: string } {
  if (minutes === null || minutes === 0) return { text: "-", className: "text-[#80868b]" };
  return minutes > 0
    ? { text: formatDelayMinutes(minutes), className: "text-[#c5221f] font-medium" }
    : { text: formatDelayMinutes(minutes), className: "text-[#80868b]" };
}

/** Row height (px) the header's sticky offsets are computed from — see the note below. */
const SHEET_ROW_H = 26;
const SHEET_COL_IDENTITY = 170;
const SHEET_COL_STARTED = 118;
const SHEET_COL_FIELD = 130;
const SHEET_COL_PLANNED = 116;
const SHEET_COL_ACTUAL = 116;
const SHEET_COL_STATUS = 96;
const SHEET_COL_DELAY = 92;
const SHEET_COL_ACTION = 76;
const SHEET_STEP_W = SHEET_COL_PLANNED + SHEET_COL_ACTUAL + SHEET_COL_STATUS + SHEET_COL_DELAY;

/** A dense cell shared by every header row — fixed height so 5 stacked sticky rows line up exactly. */
function SheetTh({
  children,
  rowIndex,
  colSpan,
  divider = false,
  pinned = false,
  className = "",
}: {
  children?: React.ReactNode;
  rowIndex: number;
  colSpan?: number;
  divider?: boolean;
  pinned?: boolean;
  className?: string;
}) {
  return (
    <th
      colSpan={colSpan}
      className={`sticky z-20 bg-white overflow-hidden whitespace-nowrap border-[#e0e0e0] border-r border-b font-normal text-left text-[13px] px-1.5 ${
        divider ? "border-l-2 border-l-[#999999]" : ""
      } ${pinned ? "left-0 z-30" : ""} ${className}`}
      style={{ top: rowIndex * SHEET_ROW_H, height: SHEET_ROW_H }}
    >
      {children}
    </th>
  );
}

/**
 * The workflow's runs, rendered as an actual spreadsheet grid — the same
 * shape as the Google Sheet this feature replaced: five stacked header rows
 * (What / Who / How / When, merged per step, then the real leaf columns),
 * 1px hairline borders, a thick divider between step groups, dense 13px
 * Arial-ish text, and status shown as coloured text rather than a badge.
 * Real data throughout — nothing here is mocked, it's the same
 * `/workflow/templates/:id/export` payload the rest of the page uses.
 *
 * Exactly one column is pinned (the field that names the run) — matching
 * every other grid on this page and the one lesson learned the hard way
 * earlier: pinning more than one column only works if every sticky offset is
 * computed, never guessed. Group headers (What/Who/How/When, and each step's
 * merged cell) are sticky to the *top* only, never to the left, so there's no
 * multi-column sticky math anywhere in this component.
 */
function WorkflowRunList({
  data,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  visibleCount,
  onShowMore,
  selectedId,
  onRowClick,
  onDeleteRow,
}: {
  data: WorkflowTemplateExport;
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: WorkflowInstanceStatus;
  onStatusFilterChange: (v: WorkflowInstanceStatus) => void;
  visibleCount: number;
  onShowMore: () => void;
  selectedId: string | null;
  onRowClick: (id: string) => void;
  onDeleteRow: (id: string, title: string, status: WorkflowInstanceStatus, e: { stopPropagation: () => void }) => void;
}) {
  const q = search.trim().toLowerCase();
  const filteredRuns = data.runs.filter((run) => {
    if (run.status !== statusFilter) return false;
    if (!q) return true;
    return run.title.toLowerCase().includes(q) || run.fieldValues.some((v) => v.toLowerCase().includes(q));
  });
  const visibleRuns = filteredRuns.slice(0, visibleCount);
  const stepDefByNo = new Map(data.steps.map((s) => [s.stepNo, s]));
  const identityLabel = data.fieldLabels[0] ?? "Run";
  const extraLabels = data.fieldLabels.slice(1);

  const tableWidth =
    SHEET_COL_IDENTITY + SHEET_COL_STARTED + extraLabels.length * SHEET_COL_FIELD +
    data.steps.length * SHEET_STEP_W + SHEET_COL_ACTION;

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar: small, bordered, unstyled — this is the one place the app's
          usual controls show through the sheet. */}
      <div className="flex flex-wrap items-center gap-2 border-2 border-on-surface bg-surface-container-low p-2">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name or any detail..."
          className="h-8 flex-1 min-w-[180px] border border-on-surface bg-white px-2 text-[13px] text-on-surface focus:outline-none"
          style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
        />
        <div className="flex gap-1.5">
          {(["Active", "Complete"] as WorkflowInstanceStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => onStatusFilterChange(s)}
              className={`h-8 px-2.5 border font-label-sm text-[11px] uppercase transition-colors ${
                statusFilter === s
                  ? "border-on-surface bg-on-surface text-surface"
                  : "border-on-surface text-on-surface hover:bg-surface-container"
              }`}
            >
              {s} ({data.runs.filter((r) => r.status === s).length})
            </button>
          ))}
        </div>
        {data.steps.length > 3 && (
          <p className="w-full font-label-sm text-[10px] uppercase text-on-surface-variant">
            {data.steps.length} steps — scroll the sheet sideways to see them all →
          </p>
        )}
      </div>

      {visibleRuns.length === 0 ? (
        <p className="border-2 border-on-surface bg-surface-container-lowest px-4 py-8 text-center font-body-md text-body-md text-on-surface-variant">
          {data.runs.length === 0 ? "No work yet." : `No ${statusFilter.toLowerCase()} work matches this search.`}
        </p>
      ) : (
        // Google Sheets scrolls both ways once a grid outgrows the window —
        // this is meant to too, rather than hide columns to dodge it.
        <div
          className="border-2 border-on-surface overflow-auto max-h-[70vh] bg-white"
          style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
        >
          <table
            className="table-fixed border-separate border-spacing-0 text-[13px]"
            style={{ width: tableWidth }}
          >
            <colgroup>
              <col style={{ width: SHEET_COL_IDENTITY }} />
              <col style={{ width: SHEET_COL_STARTED }} />
              {extraLabels.map((l, i) => (
                <col key={i} style={{ width: SHEET_COL_FIELD }} />
              ))}
              {data.steps.map((s) => (
                <Fragment key={s.stepNo}>
                  <col style={{ width: SHEET_COL_PLANNED }} />
                  <col style={{ width: SHEET_COL_ACTUAL }} />
                  <col style={{ width: SHEET_COL_STATUS }} />
                  <col style={{ width: SHEET_COL_DELAY }} />
                </Fragment>
              ))}
              <col style={{ width: SHEET_COL_ACTION }} />
            </colgroup>
            <thead>
              {/* Rows 1-4: What / Who / How / When — merged once per step,
                  exactly like the sheet's own header. The pinned identity
                  column carries the row's own label instead, since it can't
                  be part of a wide merge and stay pinned at the same time. */}
              {(["What", "Who", "How", "When"] as const).map((rowLabel, rowIndex) => (
                <tr key={rowLabel}>
                  <SheetTh rowIndex={rowIndex} pinned className="font-medium text-on-surface-variant">
                    {rowLabel}
                  </SheetTh>
                  {/* The fields (PO Number, Vendor Name, ...) are the intake
                      for the first step — exactly like the original sheet,
                      where those columns sit under "Generate PO" itself
                      rather than a blank header of their own. */}
                  <SheetTh rowIndex={rowIndex} colSpan={1 + extraLabels.length}>
                    {data.steps[0] &&
                      (rowLabel === "What"
                        ? data.steps[0].what
                        : rowLabel === "Who"
                        ? data.steps[0].doerName
                        : rowLabel === "How"
                        ? data.steps[0].how
                        : describeTat(data.steps[0].tat))}
                  </SheetTh>
                  {data.steps.map((s) => (
                    <SheetTh key={s.stepNo} rowIndex={rowIndex} colSpan={4} divider>
                      {rowLabel === "What" && s.what}
                      {rowLabel === "Who" && s.doerName}
                      {rowLabel === "How" && s.how}
                      {rowLabel === "When" && describeTat(s.tat)}
                    </SheetTh>
                  ))}
                  <SheetTh rowIndex={rowIndex} />
                </tr>
              ))}
              {/* Row 5: the real leaf columns. */}
              <tr>
                <SheetTh rowIndex={4} pinned className="font-medium">
                  {identityLabel}
                </SheetTh>
                <SheetTh rowIndex={4} className="font-medium text-on-surface-variant">
                  Timestamp
                </SheetTh>
                {extraLabels.map((label, i) => (
                  <SheetTh key={i} rowIndex={4} className="font-medium text-on-surface-variant">
                    {label}
                  </SheetTh>
                ))}
                {data.steps.map((s) => (
                  <Fragment key={s.stepNo}>
                    <SheetTh rowIndex={4} divider className="font-medium text-on-surface-variant">
                      Planned
                    </SheetTh>
                    <SheetTh rowIndex={4} className="font-medium text-on-surface-variant">
                      Actual
                    </SheetTh>
                    <SheetTh rowIndex={4} className="font-medium text-on-surface-variant">
                      Status
                    </SheetTh>
                    <SheetTh rowIndex={4} className="font-medium text-on-surface-variant">
                      Delay
                    </SheetTh>
                  </Fragment>
                ))}
                <SheetTh rowIndex={4} />
              </tr>
            </thead>
            <tbody>
              {visibleRuns.map((run) => {
                const selected = selectedId === run.id;
                const identity = run.fieldValues[0] || run.title;
                const current = currentStepOf(run);
                const currentDef = current ? stepDefByNo.get(current.stepNo) : undefined;
                const lateCount = run.steps.filter(
                  (s) => s.status === "Overdue" || (s.delayMinutes !== null && s.delayMinutes > 0)
                ).length;
                const rowBg = selected ? "bg-[#d6e3ff]" : "bg-white";
                return (
                  <tr
                    key={run.id}
                    onClick={() => onRowClick(run.id)}
                    className={`group cursor-pointer ${rowBg} ${selected ? "" : "hover:bg-[#f8f9fa]"}`}
                  >
                    {/* Pinned column: has to answer "is this row fine?" on its
                        own, since it's the only thing that never scrolls away. */}
                    <td
                      className={`sticky left-0 z-10 ${rowBg} ${
                        selected ? "" : "group-hover:bg-[#f8f9fa]"
                      } border-[#e0e0e0] border-r border-b px-1.5 py-0.5 align-top overflow-hidden`}
                    >
                      <span className="flex items-center justify-between gap-1">
                        <span className="truncate font-medium" title={identity}>
                          {identity || "—"}
                        </span>
                        {lateCount > 0 && (
                          <span className="shrink-0 text-[10px] font-semibold text-[#c5221f]">
                            {lateCount} late
                          </span>
                        )}
                      </span>
                      <span
                        className={`block truncate text-[11px] ${
                          current?.status === "Overdue" ? "text-[#c5221f] font-medium" : "text-[#80868b]"
                        }`}
                      >
                        {current
                          ? `${currentDef?.doerName ?? "—"} · ${currentDef?.what ?? `Step ${current.stepNo}`}`
                          : run.status === "Complete"
                          ? "Finished"
                          : "Not started"}
                      </span>
                    </td>
                    <td className="border-[#e0e0e0] border-r border-b px-1.5 py-0.5 align-top text-[#80868b] whitespace-nowrap overflow-hidden">
                      {formatTsShort(run.startedAt)}
                    </td>
                    {extraLabels.map((_label, i) => (
                      <td
                        key={i}
                        className="border-[#e0e0e0] border-r border-b px-1.5 py-0.5 align-top truncate overflow-hidden"
                        title={run.fieldValues[i + 1] ?? ""}
                      >
                        {run.fieldValues[i + 1] || "—"}
                      </td>
                    ))}
                    {run.steps.map((s) => {
                      const st = statusText(s.status);
                      const dl = delayText(s.delayMinutes);
                      return (
                        <Fragment key={s.stepNo}>
                          <td className="border-[#e0e0e0] border-l-2 border-l-[#999999] border-r border-b px-1.5 py-0.5 align-top text-[#80868b] whitespace-nowrap overflow-hidden">
                            {s.planned ? formatTsShort(s.planned) : "—"}
                          </td>
                          <td className="border-[#e0e0e0] border-r border-b px-1.5 py-0.5 align-top text-[#80868b] whitespace-nowrap overflow-hidden">
                            {s.actual ? formatTsShort(s.actual) : "—"}
                          </td>
                          <td className={`border-[#e0e0e0] border-r border-b px-1.5 py-0.5 align-top whitespace-nowrap overflow-hidden ${st.className}`}>
                            {st.text}
                          </td>
                          <td className={`border-[#e0e0e0] border-r border-b px-1.5 py-0.5 align-top whitespace-nowrap overflow-hidden ${dl.className}`}>
                            {dl.text}
                          </td>
                        </Fragment>
                      );
                    })}
                    <td className="border-[#e0e0e0] border-b px-1 py-0.5 align-top text-right">
                      <button
                        onClick={(e) => onDeleteRow(run.id, run.title, run.status, e)}
                        title="Delete this work"
                        className="text-[10px] uppercase text-[#c5221f] hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filteredRuns.length > visibleRuns.length && (
        <button
          onClick={onShowMore}
          className="border-2 border-on-surface px-4 py-2 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
        >
          Show {Math.min(RUN_PAGE_SIZE, filteredRuns.length - visibleRuns.length)} more ({filteredRuns.length - visibleRuns.length} left)
        </button>
      )}
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
    let reason = "";
    if (action === "reject") {
      // A bounce with no explanation just moves the confusion to whoever
      // picks it back up — they need to know what to fix.
      const input = prompt(`Why is "${row.step.what}" being sent back? This will be shown to whoever reworks it.`);
      if (input === null) return; // cancelled
      reason = input.trim();
      if (!reason) {
        alert("Please say why this is being sent back.");
        return;
      }
    }
    setBusyKey(`${row.instanceId}:${row.step.stepNo}`);
    try {
      await api.post(
        `/workflow/instances/${row.instanceId}/steps/${row.step.stepNo}/${action}`,
        action === "reject" ? { reason } : undefined
      );
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

  // `openWorkflow` is null until the doer touches anything, and "" once they
  // deliberately close a box. That distinction matters: with a single workflow
  // the box opens on its own (there is nothing to choose between), but it must
  // still be closable — treating "closed" as null would just reopen it.
  const workflowNames = Array.from(myTurnByWorkflow.keys());
  const effectiveOpenWorkflow =
    openWorkflow === null ? (workflowNames.length === 1 ? workflowNames[0]! : null) : openWorkflow || null;
  const openWorkflowRows = effectiveOpenWorkflow ? myTurnByWorkflow.get(effectiveOpenWorkflow) ?? null : null;

  return (
    <>
      <MobileHeader />
      <SideNav active="workflow" />

      <div className="md:ml-16 flex flex-col min-h-screen bg-background">
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

          {/* A tick per workflow, wrapping in one row — a full-width bar each
              pushed the actual work off the first screen. Only shown when there
              is more than one, since with a single workflow there is nothing to
              choose between and it just opens. */}
          {!loading && workflowNames.length > 1 && (
            <div className="border-2 border-on-surface bg-surface p-2 flex flex-col gap-2">
              <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Pick which workflow to open
              </p>
              <div className="flex flex-wrap gap-2">
                {Array.from(myTurnByWorkflow.entries()).map(([workflowName, workflowRows]) => {
                  const open = effectiveOpenWorkflow === workflowName;
                  const workflowOverdueCount = workflowRows.filter((r) => r.step.status === "Overdue").length;
                  return (
                    <label
                      key={workflowName}
                      className={`flex items-center gap-2 border-2 px-3 py-2 cursor-pointer transition-colors ${
                        open
                          ? "border-on-surface bg-surface-container"
                          : workflowOverdueCount > 0
                          ? "border-error hover:bg-surface-container"
                          : "border-on-surface hover:bg-surface-container"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={open}
                        onChange={() => setOpenWorkflow(open ? "" : workflowName)}
                      />
                      <span className="font-label-sm text-label-sm uppercase text-on-surface">
                        {workflowName}
                      </span>
                      <span className="font-label-sm text-[10px] uppercase text-on-surface-variant">
                        {workflowRows.length}
                      </span>
                      {workflowOverdueCount > 0 && (
                        <span className="border-2 border-error bg-error text-on-error px-1.5 font-label-sm text-[10px] uppercase">
                          {workflowOverdueCount} late
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && myTurn.length > 0 && !effectiveOpenWorkflow && (
            <p className="font-data-mono text-data-mono text-on-surface-variant border-2 border-on-surface px-3 py-6 text-center uppercase">
              Tick a workflow above to see your work.
            </p>
          )}

          {/* The ticked workflow's tasks. */}
          {openWorkflowRows && (
            <div className="flex flex-col gap-2">
              {openWorkflowRows.map((row) => {
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

                  {/* Shows up only while this step is the rework — once it's
                      done again the reason has served its purpose. */}
                  {s.status === "Active" && s.rejectReason && (
                    <div className="border-2 border-error bg-error/5 p-2">
                      <p className="font-label-sm text-label-sm uppercase text-error">Sent back — why</p>
                      <p className="font-body-md text-body-md text-on-surface">{s.rejectReason}</p>
                    </div>
                  )}

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
  const [overview, setOverview] = useState<WorkflowOverview | null>(null);
  // Active/Complete tab + search + pagination for whichever template's sheet
  // is currently open — everything about a workflow's runs is managed right
  // inside that sheet now, so there's no separate global runs list anymore.
  const [sheetStatusFilter, setSheetStatusFilter] = useState<WorkflowInstanceStatus>("Active");
  const [runSearch, setRunSearch] = useState("");
  const [visibleRunCount, setVisibleRunCount] = useState(RUN_PAGE_SIZE);
  // Highlights the row last clicked — the sheet itself is the whole page now,
  // there's no separate detail panel to open, so this is purely a "which one
  // did I just look at" marker.
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  async function loadData(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const [templateData, doerData, overviewData] = await Promise.all([
        api.get<WorkflowTemplate[]>("/workflow/templates"),
        api.get<Doer[]>("/users"),
        api.get<WorkflowOverview>("/workflow/overview"),
      ]);
      setTemplates(templateData);
      setDoers(doerData.filter((d) => d.role === "Doer" || d.role === "MD" || d.role === "PC"));
      setOverview(overviewData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load workflow data.");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadData();
    });
  }, []);

  // Overdue is derived from the clock on every read, and doers are marking
  // steps done all day — without this the board silently goes stale and
  // whoever is watching it makes calls on yesterday's picture. Keyed on the
  // open template so the sheet on screen is refreshed too, not just the board;
  // changing templates only resets the timer, it doesn't refetch.
  useEffect(() => {
    const timer = setInterval(() => {
      loadData({ silent: true });
      if (openTemplateId) loadSheet(openTemplateId, { force: true });
    }, 60000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTemplateId]);

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
  async function loadSheet(templateId: string, opts?: { force?: boolean }) {
    if (!opts?.force && sheetDataByTemplate[templateId]) return;
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

  async function handleDeleteInstance(
    templateId: string,
    id: string,
    title: string,
    status: WorkflowInstanceStatus,
    e?: { stopPropagation: () => void }
  ) {
    e?.stopPropagation(); // don't also trigger the row's own click handler
    const warning =
      status === "Active"
        ? " This work is still in progress — its full step history goes with it."
        : "";
    if (!confirm(`Permanently delete "${title}"? This can't be undone.${warning}`)) return;
    try {
      await api.delete(`/workflow/instances/${id}`);
      await loadSheet(templateId, { force: true });
      await loadData({ silent: true });
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete this work.");
    }
  }

  const doerName = (id: string) => doers.find((d) => d.id === id)?.name ?? id;
  // Whichever workflow is ticked. Resolved from the list rather than held
  // separately so a deleted workflow can't leave a stale panel behind.
  const openTemplate = templates.find((t) => t.id === openTemplateId) ?? null;

  return (
    <>
      <MobileHeader />
      <SideNav active="workflow" />

      <div className="md:ml-16 flex flex-col min-h-screen bg-background">
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

          {/*
            Workflows as a wrapping row of tick-boxes rather than one full-width
            row each: the names are short, so a row apiece burns most of the
            screen before any actual work is on it. Ticking one opens its sheet
            underneath — and only one at a time, since each sheet is a wide
            table and stacking them would put the space straight back.
          */}
          <div className="bg-surface border-2 border-on-surface p-stack-lg flex flex-col gap-stack-md">
            <h3 className="font-headline-md text-headline-md text-on-surface border-b-2 border-on-surface pb-stack-md">
              Workflows
            </h3>
            {loading ? (
              <p className="font-data-mono text-data-mono text-on-surface-variant">Loading…</p>
            ) : templates.length === 0 ? (
              <p className="font-data-mono text-data-mono text-on-surface-variant">
                No workflows yet.
                {isAdmin ? ' Use "+ New Template" above.' : ""}
              </p>
            ) : (
              <>
                <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                  Pick which workflow to open
                </p>
                <div className="flex flex-wrap gap-3">
                  {templates.map((t) => {
                    const open = openTemplateId === t.id;
                    // Live load per workflow, so you can tell which one needs
                    // opening without opening every one of them to find out.
                    const stat = overview?.templates.find((x) => x.id === t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-2 border-2 px-3 py-2 cursor-pointer transition-colors ${
                          open
                            ? "border-on-surface bg-surface-container"
                            : stat && stat.overdueSteps > 0
                            ? "border-error hover:bg-surface-container"
                            : "border-on-surface hover:bg-surface-container"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={open}
                          onChange={() => {
                            const next = open ? null : t.id;
                            setOpenTemplateId(next);
                            setRunSearch("");
                            setSheetStatusFilter("Active");
                            setVisibleRunCount(RUN_PAGE_SIZE);
                            if (next && isAdmin) loadSheet(next);
                          }}
                        />
                        <span className="font-label-sm text-label-sm uppercase text-on-surface">
                          {t.name}
                        </span>
                        {stat && stat.overdueSteps > 0 && (
                          <span className="border-2 border-error bg-error text-on-error px-1.5 font-label-sm text-[10px] uppercase">
                            {stat.overdueSteps} late
                          </span>
                        )}
                        {stat && stat.activeRuns > 0 && (
                          <span className="font-label-sm text-[10px] uppercase text-on-surface-variant">
                            {stat.activeRuns} running
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>

                {!openTemplate && (
                  <p className="font-data-mono text-data-mono text-on-surface-variant border-2 border-on-surface px-3 py-6 text-center uppercase">
                    Tick a workflow above to see its work.
                  </p>
                )}

                {openTemplate && (
                  <div className="flex flex-col gap-3">
                    {isAdmin ? (
                      /* Data first, spinner only when there is none yet —
                         otherwise the minute-by-minute refresh would rip
                         the table off screen while it reloads. */
                      sheetDataByTemplate[openTemplate.id] ? (
                        <WorkflowRunList
                          data={sheetDataByTemplate[openTemplate.id]!}
                          search={runSearch}
                          onSearchChange={(v) => {
                            setRunSearch(v);
                            setVisibleRunCount(RUN_PAGE_SIZE);
                          }}
                          statusFilter={sheetStatusFilter}
                          onStatusFilterChange={(v) => {
                            setSheetStatusFilter(v);
                            setVisibleRunCount(RUN_PAGE_SIZE);
                          }}
                          visibleCount={visibleRunCount}
                          onShowMore={() => setVisibleRunCount((prev) => prev + RUN_PAGE_SIZE)}
                          selectedId={selectedId}
                          onRowClick={setSelectedId}
                          onDeleteRow={(id, title, status, e) =>
                            handleDeleteInstance(openTemplate.id, id, title, status, e)
                          }
                        />
                      ) : sheetLoadingId === openTemplate.id ? (
                        <p className="font-data-mono text-data-mono text-on-surface-variant text-xs">Loading…</p>
                      ) : null
                    ) : (
                      <ol className="font-data-mono text-data-mono text-on-surface-variant text-xs flex flex-col gap-0.5">
                        {openTemplate.steps.map((s) => (
                          <li key={s.id}>
                            {s.stepNo}. {s.what} — {doerName(s.doerId)} ({s.tat})
                          </li>
                        ))}
                      </ol>
                    )}
                    {isAdmin && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleExportTemplate(openTemplate.id)}
                          disabled={exportingId === openTemplate.id}
                          title="Download every run of this workflow as a spreadsheet — steps across the top, one row per run"
                          className="self-start border-2 border-on-surface text-on-surface px-2 py-0.5 font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors disabled:opacity-40"
                        >
                          {exportingId === openTemplate.id ? "Exporting…" : "Export"}
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(openTemplate.id)}
                          className="self-start border-2 border-error text-error px-2 py-0.5 font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

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
            setOpenTemplateId(instance.templateId);
            setSheetStatusFilter("Active");
            setRunSearch("");
            setVisibleRunCount(RUN_PAGE_SIZE);
            loadSheet(instance.templateId, { force: true });
            loadData({ silent: true });
            setSelectedId(instance.id);
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
