"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { FormConfig, FormResponses } from "@/lib/types";

// New submissions land in the Sheet at any time — re-check periodically so
// they show up without a manual refresh.
const POLL_MS = 20000;
// How many response rows per page in each form's table.
const PAGE_SIZE = 25;

type ResponseRow = FormResponses["rows"][number];

/** Builds and downloads a CSV of the given rows for one form. */
function exportResponsesToCsv(formName: string, headers: string[], rows: ResponseRow[]) {
  const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) => headers.map((h) => escape(r.data[h] ?? "")).join(",")),
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = formName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  a.download = `${safeName}-responses-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Counts of each distinct value in one column, most frequent first (top N). */
function countByField(rows: ResponseRow[], field: string, topN = 8): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const raw = (r.data[field] ?? "").trim();
    const key = raw === "" ? "(blank)" : raw;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

/** Simple horizontal bar chart in the app's Swiss style — no chart library. */
function BarChart({ data }: { data: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  if (data.length === 0) {
    return (
      <p className="font-data-mono text-data-mono text-on-surface-variant px-4 py-3">No data.</p>
    );
  }
  return (
    <div className="flex flex-col gap-2 p-stack-md">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate font-label-sm text-label-sm uppercase text-on-surface" title={d.label}>
            {d.label}
          </span>
          <div className="flex-1 h-5 bg-surface-container border border-on-surface">
            <div
              className="h-full bg-on-surface"
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right font-data-mono text-data-mono text-on-surface">
            {d.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function AddFormModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (form: FormConfig) => void;
}) {
  const [name, setName] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const form = await api.post<FormConfig>("/forms", { name, spreadsheetId, sheetName });
      onCreated(form);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add form.");
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    "mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none";
  const label = "font-label-sm text-label-sm uppercase text-on-surface-variant";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-surface-container-lowest border-2 border-on-surface">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md">
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">Add Form</h3>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-stack-md p-stack-lg">
          <div>
            <label className={label}>Form Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Site Visit Feedback"
              className={field}
            />
          </div>

          <div>
            <label className={label}>Spreadsheet ID</label>
            <input
              required
              value={spreadsheetId}
              onChange={(e) => setSpreadsheetId(e.target.value)}
              placeholder="From the Google Sheet's URL"
              className={`${field} font-data-mono text-data-mono`}
            />
          </div>

          <div>
            <label className={label}>Sheet / Tab Name</label>
            <input
              required
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              placeholder="e.g. Form Responses 1"
              className={`${field} font-data-mono text-data-mono`}
            />
          </div>

          <p className="font-data-mono text-xs text-on-surface-variant border border-on-surface-variant px-3 py-2 uppercase">
            ℹ️ Share this Google Sheet with the app&apos;s service account (Editor access) first —
            the same one already used for Master Sheet — or responses won&apos;t load.
          </p>

          {error && (
            <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-stack-sm justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Add Form"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Self-contained: fetches + polls one form's responses and renders its table. */
function FormResponsesSection({
  form,
  search,
  canDelete,
  onDelete,
}: {
  form: FormConfig;
  search: string;
  canDelete: boolean;
  onDelete: (form: FormConfig) => void;
}) {
  const [responses, setResponses] = useState<FormResponses | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-column filter: pick a column, then only rows whose cell contains the
  // value stay. Empty field = no column filter (global search still applies).
  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [page, setPage] = useState(0);
  // Analytics: a bar chart of value counts for one chosen column.
  const [showChart, setShowChart] = useState(false);
  const [chartField, setChartField] = useState("");

  async function load(opts: { silent?: boolean } = {}) {
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const data = await api.get<FormResponses>(`/forms/${form.id}/responses`);
      setResponses(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load responses.");
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
    const interval = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id]);

  const headers = responses?.headers ?? [];

  const filteredRows = useMemo(() => {
    let rows = responses?.rows ?? [];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => Object.values(r.data).some((v) => v.toLowerCase().includes(q)));
    }
    if (filterField && filterValue) {
      const q = filterValue.toLowerCase();
      rows = rows.filter((r) => (r.data[filterField] ?? "").toLowerCase().includes(q));
    }
    return rows;
  }, [responses, search, filterField, filterValue]);

  // Keep the page in range as filters shrink the result set.
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = filteredRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const chartData = chartField ? countByField(filteredRows, chartField) : [];

  return (
    <div className="w-full bg-surface-container-lowest border-2 border-on-surface flex flex-col">
      <div className="bg-surface-container-low border-b-2 border-on-surface p-stack-md flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-baseline gap-3">
          <h3 className="font-headline-md text-headline-md text-on-surface">{form.name}</h3>
          <span className="font-data-mono text-data-mono text-on-surface-variant">
            {filteredRows.length} response{filteredRows.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowChart((v) => !v)}
            className="px-3 py-1.5 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
          >
            {showChart ? "Hide Chart" : "Chart"}
          </button>
          <button
            onClick={() => exportResponsesToCsv(form.name, headers, filteredRows)}
            disabled={filteredRows.length === 0}
            className="px-3 py-1.5 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onClick={() => load()}
            className="px-3 py-1.5 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
          >
            Refresh
          </button>
          {canDelete && (
            <button
              onClick={() => onDelete(form)}
              className="px-3 py-1.5 border-2 border-error text-error font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Column filter */}
      {headers.length > 0 && (
        <div className="border-b border-surface-variant p-stack-md flex flex-wrap items-center gap-2">
          <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Filter</span>
          <select
            value={filterField}
            onChange={(e) => {
              setFilterField(e.target.value);
              setPage(0);
            }}
            className="border-2 border-on-surface bg-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
          >
            <option value="">Any column</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          <input
            value={filterValue}
            onChange={(e) => {
              setFilterValue(e.target.value);
              setPage(0);
            }}
            disabled={!filterField}
            placeholder="Value contains..."
            className="flex-1 min-w-[160px] border-2 border-on-surface bg-surface px-3 py-1.5 text-on-surface focus:outline-none disabled:opacity-50"
          />
          {(filterField || filterValue) && (
            <button
              onClick={() => {
                setFilterField("");
                setFilterValue("");
                setPage(0);
              }}
              className="px-3 py-1.5 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Analytics chart */}
      {showChart && headers.length > 0 && (
        <div className="border-b-2 border-on-surface bg-surface">
          <div className="p-stack-md flex flex-wrap items-center gap-2 border-b border-surface-variant">
            <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
              Count by column
            </span>
            <select
              value={chartField}
              onChange={(e) => setChartField(e.target.value)}
              className="border-2 border-on-surface bg-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
            >
              <option value="">Select a column</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          {chartField ? (
            <BarChart data={chartData} />
          ) : (
            <p className="font-data-mono text-data-mono text-on-surface-variant px-4 py-3">
              Pick a column to see a breakdown of its answers.
            </p>
          )}
        </div>
      )}

      {error && <p className="font-label-sm text-label-sm text-error px-4 py-2">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[720px]">
          <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
            <tr>
              {headers.map((h) => (
                <th key={h} className="py-3 px-4 border-r border-surface-variant last:border-r-0 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-body-md text-body-md text-on-surface">
            {loading && (
              <tr>
                <td
                  colSpan={Math.max(headers.length, 1)}
                  className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant"
                >
                  Loading...
                </td>
              </tr>
            )}
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td
                  colSpan={Math.max(headers.length, 1)}
                  className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant"
                >
                  No responses yet.
                </td>
              </tr>
            )}
            {pagedRows.map((r) => (
              <tr
                key={r.row}
                className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors"
              >
                {headers.map((h) => (
                  <td key={h} className="py-3 px-4 border-r border-surface-variant last:border-r-0 whitespace-nowrap">
                    {r.data[h] || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredRows.length > PAGE_SIZE && (
        <div className="border-t-2 border-on-surface p-stack-md flex flex-wrap items-center justify-between gap-3">
          <span className="font-data-mono text-data-mono text-on-surface-variant">
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filteredRows.length)} of{" "}
            {filteredRows.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="px-3 py-1.5 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
            >
              Prev
            </button>
            <span className="font-data-mono text-data-mono text-on-surface">
              {safePage + 1} / {pageCount}
            </span>
            <button
              onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              disabled={safePage >= pageCount - 1}
              className="px-3 py-1.5 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FormsInner() {
  const { user } = useAuth();
  const canManage =
    user?.role === "Admin" || user?.role === "Manager" || user?.role === "PC";
  const canDelete = user?.role === "Admin" || user?.role === "Manager";

  const [forms, setForms] = useState<FormConfig[]>([]);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [loadingForms, setLoadingForms] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  async function loadForms() {
    setLoadingForms(true);
    try {
      const data = await api.get<FormConfig[]>("/forms");
      setForms(data);
      // First load: nothing picked yet — default to the first form so the
      // page isn't empty.
      setCheckedIds((prev) => (prev.length > 0 ? prev : data[0] ? [data[0].id] : []));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load forms.");
    } finally {
      setLoadingForms(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadForms();
    });
  }, []);

  function toggleChecked(id: string) {
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleDelete(form: FormConfig) {
    if (!confirm(`Remove "${form.name}" from the Form list? The Google Sheet itself is untouched.`))
      return;
    try {
      await api.delete(`/forms/${form.id}`);
      setForms((prev) => prev.filter((f) => f.id !== form.id));
      setCheckedIds((prev) => prev.filter((id) => id !== form.id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to remove form.");
    }
  }

  const checkedForms = forms.filter((f) => checkedIds.includes(f.id));

  return (
    <>
      <MobileHeader />
      <SideNav active="forms" />

      <div className="md:ml-64 flex-1 flex flex-col bg-background min-h-screen">
        <header className="hidden md:flex bg-surface w-full border-b-2 border-on-surface justify-between items-center h-16 px-container-padding sticky top-0 z-30">
          <div className="font-headline-md text-headline-md text-on-surface uppercase border-b-2 border-on-surface pb-1">
            Form Responses
          </div>
          {canManage && (
            <button
              onClick={() => setShowAdd(true)}
              className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors"
            >
              + Add Form
            </button>
          )}
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-lg">
          <div className="border-b-2 border-on-surface pb-stack-md flex justify-between items-end md:hidden">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface uppercase tracking-tighter">
              Form Responses
            </h2>
            {canManage && (
              <button
                onClick={() => setShowAdd(true)}
                className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase"
              >
                + Form
              </button>
            )}
          </div>

          {error && (
            <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">
              {error}
            </p>
          )}

          {!loadingForms && forms.length === 0 && (
            <p className="font-data-mono text-data-mono text-on-surface-variant border-2 border-on-surface px-3 py-6 text-center uppercase">
              No forms registered yet.{canManage ? " Add one to see its responses here." : ""}
            </p>
          )}

          {forms.length > 0 && (
            <div className="w-full bg-surface border-2 border-on-surface p-stack-md flex flex-col gap-stack-md">
              <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Pick which forms to show
              </p>
              <div className="flex flex-wrap gap-3">
                {forms.map((f) => (
                  <label
                    key={f.id}
                    className="flex items-center gap-2 border-2 border-on-surface px-3 py-2 cursor-pointer hover:bg-surface-container transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checkedIds.includes(f.id)}
                      onChange={() => toggleChecked(f.id)}
                    />
                    <span className="font-label-sm text-label-sm uppercase text-on-surface">
                      {f.name}
                    </span>
                  </label>
                ))}
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search responses across the selected forms..."
                className="w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
              />
            </div>
          )}

          {checkedForms.length === 0 && forms.length > 0 && (
            <p className="font-data-mono text-data-mono text-on-surface-variant border-2 border-on-surface px-3 py-6 text-center uppercase">
              Check a form above to see its responses.
            </p>
          )}

          {checkedForms.map((f) => (
            <FormResponsesSection
              key={f.id}
              form={f}
              search={search}
              canDelete={canDelete}
              onDelete={handleDelete}
            />
          ))}
        </main>
      </div>

      {showAdd && (
        <AddFormModal
          onClose={() => setShowAdd(false)}
          onCreated={(form) => {
            setForms((prev) => [...prev, form]);
            setCheckedIds((prev) => [...prev, form.id]);
            setShowAdd(false);
          }}
        />
      )}
    </>
  );
}

export default function FormsPage() {
  return (
    <AuthGuard>
      <FormsInner />
    </AuthGuard>
  );
}
