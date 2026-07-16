"use client";

import { useEffect, useState, type FormEvent } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { FormConfig, FormResponses } from "@/lib/types";

// New submissions land in the Sheet at any time — re-check periodically so
// they show up without a manual refresh.
const POLL_MS = 20000;

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

function FormsInner() {
  const { user } = useAuth();
  const canManage =
    user?.role === "Admin" || user?.role === "Manager" || user?.role === "PC";
  const canDelete = user?.role === "Admin" || user?.role === "Manager";

  const [forms, setForms] = useState<FormConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [responses, setResponses] = useState<FormResponses | null>(null);
  const [loadingForms, setLoadingForms] = useState(true);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  async function loadForms() {
    setLoadingForms(true);
    try {
      const data = await api.get<FormConfig[]>("/forms");
      setForms(data);
      setSelectedId((prev) => prev || data[0]?.id || "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load forms.");
    } finally {
      setLoadingForms(false);
    }
  }

  async function loadResponses(id: string, opts: { silent?: boolean } = {}) {
    if (!id) return;
    if (!opts.silent) setLoadingResponses(true);
    setError(null);
    try {
      const data = await api.get<FormResponses>(`/forms/${id}/responses`);
      setResponses(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load responses.");
    } finally {
      if (!opts.silent) setLoadingResponses(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadForms();
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    queueMicrotask(() => {
      loadResponses(selectedId);
    });
    const interval = setInterval(() => loadResponses(selectedId, { silent: true }), POLL_MS);
    return () => clearInterval(interval);
  }, [selectedId]);

  async function handleDelete(form: FormConfig) {
    if (!confirm(`Remove "${form.name}" from the Form list? The Google Sheet itself is untouched.`))
      return;
    try {
      await api.delete(`/forms/${form.id}`);
      setForms((prev) => prev.filter((f) => f.id !== form.id));
      setSelectedId((prev) => (prev === form.id ? "" : prev));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to remove form.");
    }
  }

  const filteredRows =
    responses?.rows.filter((r) =>
      search
        ? Object.values(r.data).some((v) => v.toLowerCase().includes(search.toLowerCase()))
        : true
    ) ?? [];

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
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setResponses(null);
                }}
                className="border-2 border-on-surface bg-surface px-3 py-2 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
              >
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search responses..."
                className="flex-1 min-w-[180px] border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
              />

              <button
                onClick={() => loadResponses(selectedId)}
                className="px-3 py-2 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
              >
                Refresh
              </button>

              {canDelete && selectedId && (
                <button
                  onClick={() => {
                    const form = forms.find((f) => f.id === selectedId);
                    if (form) handleDelete(form);
                  }}
                  className="px-3 py-2 border-2 border-error text-error font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors"
                >
                  Remove Form
                </button>
              )}
            </div>
          )}

          {selectedId && (
            <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[720px]">
                <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                  <tr>
                    {(responses?.headers ?? []).map((h) => (
                      <th key={h} className="py-3 px-4 border-r border-surface-variant last:border-r-0 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-body-md text-body-md text-on-surface">
                  {loadingResponses && (
                    <tr>
                      <td
                        colSpan={Math.max(responses?.headers.length ?? 1, 1)}
                        className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant"
                      >
                        Loading...
                      </td>
                    </tr>
                  )}
                  {!loadingResponses && filteredRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={Math.max(responses?.headers.length ?? 1, 1)}
                        className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant"
                      >
                        No responses yet.
                      </td>
                    </tr>
                  )}
                  {filteredRows.map((r) => (
                    <tr
                      key={r.row}
                      className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors"
                    >
                      {(responses?.headers ?? []).map((h) => (
                        <td key={h} className="py-3 px-4 border-r border-surface-variant last:border-r-0 whitespace-nowrap">
                          {r.data[h] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {showAdd && (
        <AddFormModal
          onClose={() => setShowAdd(false)}
          onCreated={(form) => {
            setForms((prev) => [...prev, form]);
            setSelectedId(form.id);
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
