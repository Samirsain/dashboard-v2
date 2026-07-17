"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Doer, FormConfig, FormResponses, FormResponseStatusMap, FormResponseStatusValue } from "@/lib/types";

// New submissions land in the Sheet at any time — re-check periodically so
// they show up without a manual refresh.
const POLL_MS = 20000;
// How many response rows per page in each form's table.
const PAGE_SIZE = 25;

type ResponseRow = FormResponses["rows"][number];

/** Builds and downloads a CSV of the given rows for one form, including their status. */
function exportResponsesToCsv(
  formName: string,
  headers: string[],
  rows: ResponseRow[],
  statuses: FormResponseStatusMap
) {
  const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const allHeaders = [...headers, "Status"];
  const lines = [
    allHeaders.map(escape).join(","),
    ...rows.map((r) =>
      [...headers.map((h) => r.data[h] ?? ""), statuses[r.row] || ""].map(escape).join(",")
    ),
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

/** Copies text to the clipboard, falling back to a hidden textarea on older browsers. */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}

function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  if (!link) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        await copyText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title={link}
      className="flex items-center gap-1.5 border-2 border-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
    >
      <span className="material-symbols-outlined text-base">content_copy</span>
      {copied ? "Copied!" : "Copy Form Link"}
    </button>
  );
}

const STATUS_LABELS: Record<FormResponseStatusValue, string> = {
  "": "— Not set",
  Working: "Working",
  Complete: "Complete",
};

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
  const [formLink, setFormLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serviceEmail, setServiceEmail] = useState("");

  useEffect(() => {
    api
      .get<{ email: string }>("/forms/service-account")
      .then((r) => setServiceEmail(r.email))
      .catch(() => setServiceEmail(""));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const form = await api.post<FormConfig>("/forms", { name, spreadsheetId, sheetName, formLink });
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
            <label className={label}>Google Form Link (optional)</label>
            <input
              value={formLink}
              onChange={(e) => setFormLink(e.target.value)}
              placeholder="https://docs.google.com/forms/d/e/.../viewform"
              className={`${field} font-data-mono text-data-mono`}
            />
            <p className="mt-1 font-data-mono text-xs text-on-surface-variant">
              The shareable form URL, so it can be copied from here later. Not the response Sheet
              link below.
            </p>
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
            <label className={label}>Sheet / Tab Name (optional)</label>
            <input
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              placeholder="Leave blank to use the form's main tab"
              className={`${field} font-data-mono text-data-mono`}
            />
            <p className="mt-1 font-data-mono text-xs text-on-surface-variant">
              Blank = the spreadsheet&apos;s first tab (where the form writes). Only set this if
              responses are on a different tab.
            </p>
          </div>

          <div className="border border-on-surface-variant px-3 py-2 flex flex-col gap-1">
            <p className="font-data-mono text-xs text-on-surface-variant uppercase">
              ℹ️ First share this Google Sheet (Editor access) with the service account below,
              or responses won&apos;t load:
            </p>
            {serviceEmail ? (
              <code className="font-data-mono text-xs text-on-surface break-all select-all">
                {serviceEmail}
              </code>
            ) : (
              <span className="font-data-mono text-xs text-on-surface-variant">
                (service account email unavailable)
              </span>
            )}
          </div>

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
  canEditStatus,
  onDelete,
}: {
  form: FormConfig;
  search: string;
  canDelete: boolean;
  canEditStatus: boolean;
  onDelete: (form: FormConfig) => void;
}) {
  const [responses, setResponses] = useState<FormResponses | null>(null);
  const [statuses, setStatuses] = useState<FormResponseStatusMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "Working" / "Complete" enquiry-status filter, so staff can see which
  // enquiries are in progress vs done.
  const [statusFilter, setStatusFilter] = useState<"" | FormResponseStatusValue | "unset">("");
  const [page, setPage] = useState(0);

  async function load(opts: { silent?: boolean } = {}) {
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const [data, statusMap] = await Promise.all([
        api.get<FormResponses>(`/forms/${form.id}/responses`),
        api.get<FormResponseStatusMap>(`/forms/${form.id}/statuses`).catch(() => ({})),
      ]);
      setResponses(data);
      setStatuses(statusMap);
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

  async function handleStatusChange(row: number, status: FormResponseStatusValue) {
    setStatuses((prev) => ({ ...prev, [row]: status }));
    try {
      await api.patch(`/forms/${form.id}/statuses/${row}`, { status });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to update status.");
      load({ silent: true }); // roll back to the server's actual state
    }
  }

  const headers = responses?.headers ?? [];

  const filteredRows = useMemo(() => {
    let rows = responses?.rows ?? [];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => Object.values(r.data).some((v) => v.toLowerCase().includes(q)));
    }
    if (statusFilter) {
      rows = rows.filter((r) => {
        const s = statuses[r.row] ?? "";
        return statusFilter === "unset" ? !s : s === statusFilter;
      });
    }
    return rows;
  }, [responses, search, statusFilter, statuses]);

  // Keep the page in range as filters shrink the result set.
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = filteredRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

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
          <CopyLinkButton link={form.formLink} />
          <button
            onClick={() => exportResponsesToCsv(form.name, headers, filteredRows, statuses)}
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

      {/* Status filter — which enquiries are still in progress */}
      {headers.length > 0 && (
        <div className="border-b border-surface-variant p-stack-md flex flex-wrap items-center gap-2">
          <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as typeof statusFilter);
              setPage(0);
            }}
            className="border-2 border-on-surface bg-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
          >
            <option value="">All</option>
            <option value="unset">Not set</option>
            <option value="Working">Working</option>
            <option value="Complete">Complete</option>
          </select>
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
              <th className="py-3 px-4 whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody className="font-body-md text-body-md text-on-surface">
            {loading && (
              <tr>
                <td
                  colSpan={Math.max(headers.length, 1) + 1}
                  className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant"
                >
                  Loading...
                </td>
              </tr>
            )}
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td
                  colSpan={Math.max(headers.length, 1) + 1}
                  className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant"
                >
                  No responses yet.
                </td>
              </tr>
            )}
            {pagedRows.map((r) => {
              const status = statuses[r.row] ?? "";
              return (
                <tr
                  key={r.row}
                  className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors"
                >
                  {headers.map((h) => (
                    <td key={h} className="py-3 px-4 border-r border-surface-variant last:border-r-0 whitespace-nowrap">
                      {r.data[h] || "—"}
                    </td>
                  ))}
                  <td className="py-3 px-4 whitespace-nowrap">
                    {canEditStatus ? (
                      <select
                        value={status}
                        onChange={(e) =>
                          handleStatusChange(r.row, e.target.value as FormResponseStatusValue)
                        }
                        className={`border-2 px-2 py-1 font-label-sm text-label-sm uppercase focus:outline-none ${
                          status === "Complete"
                            ? "border-on-surface bg-on-surface text-surface"
                            : status === "Working"
                              ? "border-primary text-primary bg-surface"
                              : "border-on-surface-variant text-on-surface-variant bg-surface"
                        }`}
                      >
                        {(Object.keys(STATUS_LABELS) as FormResponseStatusValue[]).map((v) => (
                          <option key={v} value={v}>
                            {STATUS_LABELS[v]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                        {STATUS_LABELS[status]}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
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

  const canManageAccess = user?.role === "Admin" || user?.role === "Manager";

  const [forms, setForms] = useState<FormConfig[]>([]);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [loadingForms, setLoadingForms] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  // Access control: which doers can see which form's responses.
  const [doers, setDoers] = useState<Doer[]>([]);
  const [openAccessId, setOpenAccessId] = useState<string | null>(null);
  const [savingAccessKey, setSavingAccessKey] = useState<string | null>(null);

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
    if (canManageAccess) {
      api
        .get<Doer[]>("/users")
        .then((all) => setDoers(all.filter((d) => d.role === "Doer" || d.role === "PC")))
        .catch(() => setDoers([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleFormAccess(form: FormConfig, doerId: string, shouldHaveAccess: boolean) {
    const memberIds = shouldHaveAccess
      ? Array.from(new Set([...form.memberIds, doerId]))
      : form.memberIds.filter((id) => id !== doerId);
    setSavingAccessKey(`${form.id}:${doerId}`);
    try {
      const updated = await api.patch<FormConfig>(`/forms/${form.id}/members`, { memberIds });
      setForms((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to update access.");
    } finally {
      setSavingAccessKey(null);
    }
  }

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

          {canManageAccess && forms.length > 0 && (
            <div className="flex flex-col gap-stack-sm">
              <h3 className="font-headline-md text-headline-md text-on-surface">Form Access</h3>
              <p className="font-data-mono text-xs text-on-surface-variant uppercase">
                Which doers can see each form&apos;s responses. Admin/Manager/PC always see everything.
              </p>
            </div>
          )}

          {canManageAccess && forms.length > 0 && (
            <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                  <tr>
                    <th className="py-3 px-4 border-r border-surface-variant">Form</th>
                    <th className="py-3 px-4 w-56">Access</th>
                  </tr>
                </thead>
                <tbody className="font-body-md text-body-md text-on-surface">
                  {forms.map((f) => (
                    <tr key={f.id} className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors">
                      <td className="py-3 px-4 border-r border-surface-variant font-medium">{f.name}</td>
                      <td className="py-3 px-4 align-top">
                        <div className="relative">
                          <button
                            onClick={() => setOpenAccessId((prev) => (prev === f.id ? null : f.id))}
                            className="w-full flex items-center justify-between gap-2 border-2 border-on-surface px-2 py-1 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
                          >
                            <span className="truncate">
                              {f.memberIds.length === 0
                                ? "Admin/Manager/PC only"
                                : `${f.memberIds.length} doer${f.memberIds.length === 1 ? "" : "s"}`}
                            </span>
                            <span className="material-symbols-outlined text-base">
                              {openAccessId === f.id ? "expand_less" : "expand_more"}
                            </span>
                          </button>

                          {openAccessId === f.id && (
                            <div className="absolute z-20 mt-1 left-0 w-64 max-h-64 overflow-y-auto bg-surface border-2 border-on-surface shadow-lg">
                              {doers.length === 0 && (
                                <p className="px-3 py-2 font-data-mono text-xs text-on-surface-variant uppercase">
                                  No doers to grant access to.
                                </p>
                              )}
                              {doers.map((d) => {
                                const checked = f.memberIds.includes(d.id);
                                const busy = savingAccessKey === `${f.id}:${d.id}`;
                                return (
                                  <label
                                    key={d.id}
                                    className="flex items-center gap-2 px-3 py-2 border-b border-surface-variant last:border-b-0 hover:bg-surface-container cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={busy}
                                      onChange={(e) => toggleFormAccess(f, d.id, e.target.checked)}
                                    />
                                    <span className="font-label-sm text-label-sm uppercase text-on-surface">
                                      {d.name}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              canEditStatus={canManage}
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
