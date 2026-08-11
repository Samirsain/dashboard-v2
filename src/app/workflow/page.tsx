"use client";

import { useEffect, useState } from "react";
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
function formatLateness(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h late`;
  }
  return hours > 0 ? `${hours}h ${mins}m late` : `${mins}m late`;
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

/**
 * Column widths (px). These are declared on a <colgroup> and the table is
 * `table-fixed`, so the browser actually honours them — which is what makes
 * the one pinned column's `left: 0` line up instead of drifting.
 */
const COL_IDENTITY = 170;
const COL_STARTED = 140;
const COL_FIELD = 140;
const COL_STEP = 172;
const COL_ACTION = 96;
/** At 100+ runs the plain list stops being scannable — page it instead. */
const RUN_PAGE_SIZE = 20;

/** How many attention rows to show before "show more". */
const ATTENTION_PAGE_SIZE = 15;

/** One headline number on the live board. */
function StatTile({ label, value, tone }: { label: string; value: number; tone: "plain" | "error" | "warn" }) {
  const styles =
    tone === "error"
      ? "border-error bg-error/10 text-error"
      : tone === "warn"
      ? "border-on-surface bg-surface-container text-on-surface"
      : "border-on-surface bg-surface text-on-surface";
  return (
    <div className={`flex-1 min-w-[130px] border-2 px-4 py-2.5 ${styles}`}>
      <p className="font-headline-lg text-headline-lg leading-none">{value}</p>
      <p className="mt-1 font-label-sm text-label-sm uppercase opacity-80">{label}</p>
    </div>
  );
}

/**
 * The manager's landing view: where work is piled up right now, across every
 * template, worst first.
 *
 * A per-template sheet answers "how is this workflow doing". It cannot answer
 * "what is late anywhere", which is the question actually asked each morning.
 *
 * Listing every outstanding step individually doesn't survive real volume: a
 * thousand runs waiting on the same person at the same step is a thousand rows
 * that all say the same thing. So the board shows the *pile* — one row per
 * (workflow, step, person) with an exact count — and opens up to the most
 * urgent few inside it. That keeps the screen the same size whether there are
 * ten runs or ten thousand.
 */
function WorkflowControlRoom({
  overview,
  onOpenRun,
}: {
  overview: WorkflowOverview;
  onOpenRun: (instanceId: string, templateId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [doerFilter, setDoerFilter] = useState<string | null>(null);
  const [openBucket, setOpenBucket] = useState<string | null>(null);
  const [visible, setVisible] = useState(ATTENTION_PAGE_SIZE);

  const q = search.trim().toLowerCase();
  const groups = overview.buckets.filter((b) => {
    if (doerFilter && b.doerId !== doerFilter) return false;
    if (!q) return true;
    return (
      b.what.toLowerCase().includes(q) ||
      b.templateName.toLowerCase().includes(q) ||
      b.doerName.toLowerCase().includes(q) ||
      b.runs.some((r) => r.runTitle.toLowerCase().includes(q))
    );
  });
  const shown = groups.slice(0, visible);
  const totalWaiting = overview.people.reduce((sum, p) => sum + p.total, 0);

  return (
    <div className="bg-surface border-2 border-on-surface p-stack-lg flex flex-col gap-stack-md">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-on-surface pb-stack-md">
        <h3 className="font-headline-md text-headline-md text-on-surface">Live Board</h3>
        <p className="font-data-mono text-data-mono text-on-surface-variant text-xs uppercase">
          Where work is stuck, right now
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatTile label="Running Work" value={overview.totals.activeRuns} tone="plain" />
        <StatTile label="Overdue Steps" value={overview.totals.overdueSteps} tone={overview.totals.overdueSteps > 0 ? "error" : "plain"} />
        <StatTile label="Due Today" value={overview.totals.dueTodaySteps} tone="warn" />
      </div>

      {/* Filter by person — chips rather than a dropdown so the load per
          person is visible without opening anything. Counts come from the
          server and cover every step, not just the ones listed below. */}
      {overview.people.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setDoerFilter(null);
              setVisible(ATTENTION_PAGE_SIZE);
            }}
            className={
              doerFilter === null
                ? "border-2 border-on-surface bg-on-surface text-surface px-3 py-1 font-label-sm text-label-sm uppercase"
                : "border-2 border-on-surface px-3 py-1 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
            }
          >
            Everyone ({totalWaiting})
          </button>
          {overview.people.map((p) => (
            <button
              key={p.doerId}
              onClick={() => {
                setDoerFilter((prev) => (prev === p.doerId ? null : p.doerId));
                setVisible(ATTENTION_PAGE_SIZE);
              }}
              className={`px-3 py-1 font-label-sm text-label-sm uppercase border-2 transition-colors ${
                doerFilter === p.doerId
                  ? "border-on-surface bg-on-surface text-surface"
                  : p.overdue > 0
                  ? "border-error text-error hover:bg-error/10"
                  : "border-on-surface text-on-surface hover:bg-surface-container"
              }`}
            >
              {p.doerName} ({p.total}
              {p.overdue > 0 ? ` · ${p.overdue} late` : ""})
            </button>
          ))}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setVisible(ATTENTION_PAGE_SIZE);
        }}
        placeholder="Filter the board by workflow, step or person..."
        className="min-h-[38px] w-full border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-sm text-on-surface focus:outline-none"
      />

      {shown.length === 0 ? (
        <p className="border-2 border-on-surface bg-surface-container-lowest px-4 py-8 text-center font-body-md text-body-md text-on-surface-variant">
          {overview.buckets.length === 0
            ? "Nothing is waiting on anyone. All caught up."
            : "Nothing matches this filter."}
        </p>
      ) : (
        <div className="border-2 border-on-surface divide-y-2 divide-on-surface">
          {shown.map((b) => {
            const open = openBucket === b.key;
            return (
              <div key={b.key} className={b.overdue > 0 ? "bg-error/5" : ""}>
                <button
                  onClick={() => setOpenBucket((prev) => (prev === b.key ? null : b.key))}
                  className="w-full text-left flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-surface-container-low transition-colors"
                >
                  <span className="flex-1 min-w-[220px]">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-body-md text-body-md text-on-surface font-semibold">
                        {b.what}
                      </span>
                      <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                        {b.templateName} · Step {b.stepNo}
                      </span>
                    </span>
                    <span className="block font-data-mono text-data-mono text-on-surface-variant text-xs mt-0.5">
                      {b.doerName}
                      {b.nextDue ? ` · next due ${formatTsShort(b.nextDue)}` : " · no deadline"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {b.overdue > 0 && (
                      <span className="border-2 border-error bg-error text-on-error px-2 py-0.5 font-label-sm text-label-sm uppercase">
                        {b.overdue} late
                      </span>
                    )}
                    <span className="border-2 border-on-surface px-2 py-0.5 font-label-sm text-label-sm uppercase text-on-surface">
                      {b.total} waiting
                    </span>
                    <span className="material-symbols-outlined text-on-surface-variant">
                      {open ? "expand_less" : "expand_more"}
                    </span>
                  </span>
                </button>

                {open && (
                  <div className="border-t-2 border-on-surface bg-surface-container-lowest divide-y divide-outline-variant">
                    {b.runs.map((r) => {
                      const late = r.lateMinutes !== null;
                      return (
                        <button
                          key={r.instanceId}
                          onClick={() => onOpenRun(r.instanceId, b.templateId)}
                          className="w-full text-left flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 hover:bg-surface-container-low transition-colors"
                        >
                          <span className="font-body-md text-body-md text-on-surface font-semibold">
                            {r.runTitle}
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span
                              className={`font-label-sm text-label-sm ${
                                late ? "text-error font-bold" : "text-on-surface-variant"
                              }`}
                            >
                              {late
                                ? formatLateness(r.lateMinutes!)
                                : r.planned
                                ? `by ${formatTsShort(r.planned)}`
                                : "no deadline"}
                            </span>
                            <StepStatusBadge status={r.status} />
                          </span>
                        </button>
                      );
                    })}
                    {b.total > b.runs.length && (
                      <p className="px-3 py-2 font-data-mono text-data-mono text-on-surface-variant text-xs">
                        Showing the {b.runs.length} most urgent of {b.total}. Open{" "}
                        <span className="uppercase">{b.templateName}</span> below to work through all of them.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {groups.length > shown.length && (
        <button
          onClick={() => setVisible((prev) => prev + ATTENTION_PAGE_SIZE)}
          className="border-2 border-on-surface px-4 py-2 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
        >
          Show {Math.min(ATTENTION_PAGE_SIZE, groups.length - shown.length)} more ({groups.length - shown.length} left)
        </button>
      )}
    </div>
  );
}

/**
 * The full home for one workflow's runs — search, Active/Complete tabs,
 * paging, opening a run's Step Timeline, and deleting a run, all inside the
 * same sheet layout the original tracking sheet used. Nothing about managing
 * a workflow's runs happens outside this box anymore.
 */
function WorkflowSheetTable({
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

  // The template's first field is what actually identifies a run, so it
  // takes the pinned column and the rest follow. With no fields defined at all
  // the run's own title stands in.
  const identityLabel = data.fieldLabels[0] ?? "Run";
  const extraLabels = data.fieldLabels.slice(1);
  const colCount = 1 + 1 + extraLabels.length + data.steps.length + 1;
  const tableWidth =
    COL_IDENTITY + COL_STARTED + extraLabels.length * COL_FIELD + data.steps.length * COL_STEP + COL_ACTION;

  return (
    <div className="flex flex-col gap-0">
      {/* Search + Active/Complete tabs — this run list is what "Ongoing Work" used to be. */}
      <div className="flex flex-wrap items-center gap-2 border-2 border-on-surface bg-surface-container-low p-2">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search title or any field value..."
          className="min-h-[36px] flex-1 min-w-[180px] border-2 border-on-surface bg-surface px-3 py-1 font-data-mono text-sm text-on-surface focus:outline-none"
        />
        <div className="flex gap-2">
          {(["Active", "Complete"] as WorkflowInstanceStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => onStatusFilterChange(s)}
              className={
                statusFilter === s
                  ? "border-2 border-on-surface bg-on-surface text-surface px-3 py-1 font-label-sm text-label-sm uppercase"
                  : "border-2 border-on-surface px-3 py-1 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
              }
            >
              {s} ({data.runs.filter((r) => r.status === s).length})
            </button>
          ))}
        </div>
      </div>

      {/*
        One table, one scroller. The step's What/Who/How/When lives in that
        step's own header cell, so the chain reads across the top exactly above
        the data it describes — the original sheet's shape, aligned by
        construction rather than by two scrollers that have to agree.
        border-separate (not collapse) is required: collapsed borders and
        position:sticky fight each other and the lines smear while scrolling.
      */}
      <div className="border-2 border-t-0 border-on-surface overflow-auto max-h-[65vh] bg-surface-container-lowest">
        <table className="table-fixed border-separate border-spacing-0 text-left" style={{ width: tableWidth }}>
          <colgroup>
            <col style={{ width: COL_IDENTITY }} />
            <col style={{ width: COL_STARTED }} />
            {/* Keyed by position, not label: two fields may legitimately share
                a label (nothing enforces uniqueness), and these columns are
                purely positional anyway. */}
            {extraLabels.map((label, i) => (
              <col key={i} style={{ width: COL_FIELD }} />
            ))}
            {data.steps.map((s) => (
              <col key={s.stepNo} style={{ width: COL_STEP }} />
            ))}
            <col style={{ width: COL_ACTION }} />
          </colgroup>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 bg-surface-container align-bottom py-2 px-3 border-r-2 border-b-2 border-on-surface font-label-sm text-label-sm uppercase truncate">
                {identityLabel}
              </th>
              <th className="sticky top-0 z-20 bg-surface-container align-bottom py-2 px-3 border-r border-b-2 border-on-surface font-label-sm text-label-sm uppercase truncate">
                Started
              </th>
              {extraLabels.map((label, i) => (
                <th
                  key={i}
                  className="sticky top-0 z-20 bg-surface-container align-bottom py-2 px-3 border-r border-b-2 border-on-surface font-label-sm text-label-sm uppercase truncate"
                  title={label}
                >
                  {label}
                </th>
              ))}
              {data.steps.map((s) => (
                <th
                  key={s.stepNo}
                  className="sticky top-0 z-20 bg-surface-container align-top py-2 px-3 border-r border-b-2 border-on-surface border-l-2 font-normal"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 flex items-center justify-center bg-on-surface text-surface font-label-sm text-[10px] shrink-0">
                      {s.stepNo}
                    </span>
                    <span className="font-label-sm text-[10px] uppercase text-on-surface-variant truncate">
                      {describeTat(s.tat)}
                    </span>
                  </div>
                  <div
                    className="mt-1 font-body-md text-body-md text-on-surface font-semibold leading-tight truncate"
                    title={s.what}
                  >
                    {s.what}
                  </div>
                  <div
                    className="font-label-sm text-label-sm text-on-surface-variant truncate"
                    title={`${s.doerName} · ${s.how}`}
                  >
                    {s.doerName} · {s.how}
                  </div>
                </th>
              ))}
              <th className="sticky top-0 z-20 bg-surface-container border-b-2 border-on-surface" />
            </tr>
          </thead>
          <tbody className="font-body-md text-body-md text-on-surface">
            {visibleRuns.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="py-6 px-3 text-center text-on-surface-variant">
                  {data.runs.length === 0 ? "No runs yet." : `No ${statusFilter.toLowerCase()} runs match this search.`}
                </td>
              </tr>
            ) : (
              visibleRuns.map((run, rowIndex) => {
                const selected = selectedId === run.id;
                // The pinned cell needs its own opaque background — a sticky
                // cell paints over scrolled content, so it can't rely on the
                // row's stripe showing through.
                //
                // Selection uses primary-*fixed* (a light tint), not
                // primary-container: the latter is near-black navy, and the
                // row's text stays on-surface, so it would paint dark on dark
                // and the row would go blank the moment it was picked.
                const rowBg = selected
                  ? "bg-primary-fixed"
                  : rowIndex % 2 === 0
                  ? "bg-surface"
                  : "bg-surface-container-lowest";
                const identity = run.fieldValues[0] || run.title;
                return (
                  <tr
                    key={run.id}
                    onClick={() => onRowClick(run.id)}
                    className={`group cursor-pointer ${rowBg} ${selected ? "" : "hover:bg-surface-container-low"}`}
                  >
                    <td
                      className={`sticky left-0 z-10 ${rowBg} ${
                        selected ? "" : "group-hover:bg-surface-container-low"
                      } py-2 px-3 border-r-2 border-b border-on-surface font-semibold truncate`}
                      title={identity}
                    >
                      {identity || "—"}
                    </td>
                    <td className="py-2 px-3 border-r border-b border-on-surface font-label-sm text-label-sm text-on-surface-variant truncate">
                      {formatTsShort(run.startedAt)}
                    </td>
                    {extraLabels.map((_label, j) => (
                      <td
                        key={j}
                        className="py-2 px-3 border-r border-b border-on-surface truncate"
                        title={run.fieldValues[j + 1] ?? ""}
                      >
                        {run.fieldValues[j + 1] || "—"}
                      </td>
                    ))}
                    {run.steps.map((s) => (
                      <td
                        key={s.stepNo}
                        className="py-2 px-3 border-r border-l-2 border-b border-on-surface align-top"
                        title={`Planned: ${s.planned ? formatTs(s.planned) : "—"}\nActual: ${
                          s.actual ? formatTs(s.actual) : "—"
                        }`}
                      >
                        <StepStatusBadge status={s.status} />
                        <div className="mt-1 font-label-sm text-[10px] text-on-surface-variant truncate">
                          {s.actual ? formatTsShort(s.actual) : s.planned ? `by ${formatTsShort(s.planned)}` : "—"}
                        </div>
                        {/* Only lateness is worth colouring — on-time is the
                            normal case and reads fine as plain text. */}
                        {s.delayMinutes !== null && (
                          <div
                            className={`font-label-sm text-[10px] font-semibold truncate ${
                              s.delayMinutes > 0 ? "text-error" : "text-on-surface-variant"
                            }`}
                          >
                            {formatDelayMinutes(s.delayMinutes)}
                          </div>
                        )}
                      </td>
                    ))}
                    <td className="py-2 px-2 border-b border-on-surface text-right align-top">
                      <button
                        onClick={(e) => onDeleteRow(run.id, run.title, run.status, e)}
                        title="Delete this work"
                        className="border-2 border-error text-error px-2 py-0.5 font-label-sm text-[10px] uppercase hover:bg-error hover:text-on-error transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {filteredRuns.length > visibleRuns.length && (
        <button
          onClick={onShowMore}
          className="border-2 border-t-0 border-on-surface px-4 py-2 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
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
    if (openTemplateId) await loadSheet(openTemplateId, { force: true });
    // Completing or bouncing a step changes who is holding what, so the board
    // above has to move with it rather than wait for the next poll.
    await loadData({ silent: true });
  }

  /** Jump from a Live Board row straight into that run's step timeline. */
  async function openRunFromBoard(instanceId: string, templateId: string) {
    setOpenTemplateId(templateId);
    setRunSearch("");
    setVisibleRunCount(RUN_PAGE_SIZE);
    loadSheet(templateId);
    await openInstance(instanceId);
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
    e?.stopPropagation(); // don't also trigger the row's openInstance click
    const warning =
      status === "Active"
        ? " This work is still in progress — its full step history goes with it."
        : "";
    if (!confirm(`Permanently delete "${title}"? This can't be undone.${warning}`)) return;
    try {
      await api.delete(`/workflow/instances/${id}`);
      await loadSheet(templateId, { force: true });
      await loadData({ silent: true });
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedSteps([]);
        setSelectedInstance(null);
      }
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

          {/* Everything in flight, across every workflow — the landing view. */}
          {isAdmin && overview && (
            <WorkflowControlRoom overview={overview} onOpenRun={openRunFromBoard} />
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
                        <WorkflowSheetTable
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
                          onRowClick={openInstance}
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

          {/* Selected instance detail */}
          {selectedId && (
            <div className="bg-surface border-2 border-on-surface p-stack-lg">
              <div className="border-b-2 border-on-surface pb-stack-md mb-stack-md">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-headline-md text-headline-md text-on-surface">Step Timeline</h3>
                  {isAdmin && selectedInstance && (
                    <button
                      onClick={() =>
                        handleDeleteInstance(
                          selectedInstance.templateId,
                          selectedInstance.id,
                          selectedInstance.title,
                          selectedInstance.status
                        )
                      }
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
            setOpenTemplateId(instance.templateId);
            setSheetStatusFilter("Active");
            setRunSearch("");
            setVisibleRunCount(RUN_PAGE_SIZE);
            loadSheet(instance.templateId, { force: true });
            loadData({ silent: true });
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
