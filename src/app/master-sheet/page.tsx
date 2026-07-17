"use client";

import { useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { formatDMY } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import type { MasterSheetRow } from "@/lib/types";

type Draft = Omit<MasterSheetRow, "id" | "createdAt">;

const EMPTY_DRAFT: Draft = {
  code: "",
  name: "",
  type: "",
  description: "",
  date: "",
  videos: "",
  pc: "",
  ps: "",
  access: "",
  link: "",
};

/** Split a multi-line / comma list of URLs into individual links. */
function splitLinks(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function LinkList({ raw }: { raw: string }) {
  const links = splitLinks(raw);
  if (links.length === 0) return <span className="text-on-surface-variant">—</span>;
  return (
    <div className="flex flex-col gap-1">
      {links.map((l, i) => (
        <a
          key={i}
          href={l.startsWith("http") ? l : `https://${l}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline break-all"
        >
          {links.length > 1 ? `Link ${i + 1}` : l}
        </a>
      ))}
    </div>
  );
}

function MasterSheetInner() {
  const { user } = useAuth();
  const canEdit = user?.role === "Admin";

  const [rows, setRows] = useState<MasterSheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which row is being edited, and its working copy.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  // A brand-new (not yet saved) row lives here until saved.
  const [adding, setAdding] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<MasterSheetRow[]>("/master-sheet");
      setRows(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load master sheet.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadData();
    });
  }, []);

  function startEdit(row: MasterSheetRow) {
    setAdding(false);
    setEditingId(row.id);
    setDraft({
      code: row.code,
      name: row.name,
      type: row.type,
      description: row.description,
      date: row.date,
      videos: row.videos,
      pc: row.pc,
      ps: row.ps,
      access: row.access,
      link: row.link,
    });
  }

  function startAdd() {
    setEditingId(null);
    setAdding(true);
    setDraft(EMPTY_DRAFT);
  }

  function cancel() {
    setEditingId(null);
    setAdding(false);
    setDraft(EMPTY_DRAFT);
  }

  async function saveDraft() {
    setSaving(true);
    try {
      if (adding) {
        const createdRow = await api.post<MasterSheetRow>("/master-sheet", draft);
        setRows((prev) => [...prev, createdRow]);
      } else if (editingId) {
        const updated = await api.patch<MasterSheetRow>(`/master-sheet/${editingId}`, draft);
        setRows((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
      }
      cancel();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to save row.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: MasterSheetRow) {
    if (!confirm(`Delete this master-sheet row${row.name ? ` (${row.name})` : ""}?`)) return;
    try {
      await api.delete(`/master-sheet/${row.id}`);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete row.");
    }
  }

  const cell = "py-3 px-3 border-r border-surface-variant align-top";
  const inputCls =
    "w-full border-2 border-on-surface bg-surface px-2 py-1 text-on-surface focus:outline-none text-sm";

  // The editable row of inputs, shared by "add new" and "edit existing".
  // A plain render function (not a component) so its state isn't reset each
  // render — the edit inputs stay focused/typed while you work.
  const renderEditRow = (isNew: boolean, key: string) => (
      <tr key={key} className="bg-surface-container-low border-b-2 border-on-surface">
        <td className={cell}>
          <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="TL / CL" className={`${inputCls} font-data-mono w-20`} />
        </td>
        <td className={cell}>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Office" className={inputCls} />
        </td>
        <td className={cell}>
          <input value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} placeholder="Task List" className={inputCls} />
        </td>
        <td className={cell}>
          <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="2-line description" rows={2} className={`${inputCls} min-w-[180px]`} />
        </td>
        <td className={cell}>
          <input value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} type="date" className={`${inputCls} font-data-mono`} />
        </td>
        <td className={cell}>
          <textarea value={draft.videos} onChange={(e) => setDraft({ ...draft, videos: e.target.value })} placeholder="One training video link per line" rows={2} className={`${inputCls} min-w-[160px]`} />
        </td>
        <td className={cell}>
          <input value={draft.pc} onChange={(e) => setDraft({ ...draft, pc: e.target.value })} placeholder="Process Coordinator" className={inputCls} />
        </td>
        <td className={cell}>
          <input value={draft.ps} onChange={(e) => setDraft({ ...draft, ps: e.target.value })} placeholder="Problem Solver" className={inputCls} />
        </td>
        <td className={cell}>
          <input value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })} placeholder="https://..." className={inputCls} />
        </td>

        <td className="py-3 px-3 text-center align-top">
          <div className="flex flex-col gap-1">
            <button onClick={saveDraft} disabled={saving} className="px-2 py-1 bg-on-surface text-surface-container-lowest font-label-sm text-label-sm uppercase hover:bg-primary transition-colors disabled:opacity-50">
              {saving ? "..." : isNew ? "Add" : "Save"}
            </button>
            <button onClick={cancel} className="px-2 py-1 border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors">
              Cancel
            </button>
          </div>
        </td>
      </tr>
  );

  return (
    <>
      <MobileHeader />
      <SideNav active="master-sheet" />

      <div className="md:ml-64 flex-1 flex flex-col bg-background min-h-screen">
        <header className="hidden md:flex bg-surface w-full border-b-2 border-on-surface justify-between items-center h-16 px-container-padding sticky top-0 z-30">
          <div className="font-headline-md text-headline-md text-on-surface uppercase border-b-2 border-on-surface pb-1">
            Master Sheet
          </div>
          {canEdit && (
            <button
              onClick={startAdd}
              disabled={adding}
              className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors disabled:opacity-50"
            >
              + Add Row
            </button>
          )}
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-md">
          <div className="flex justify-between items-end border-b-2 border-on-surface pb-stack-md md:hidden">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface uppercase tracking-tighter">
              Master Sheet
            </h2>
            {canEdit && (
              <button onClick={startAdd} disabled={adding} className="px-3 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase disabled:opacity-50">
                + Add
              </button>
            )}
          </div>

          <p className="font-data-mono text-data-mono text-on-surface-variant uppercase">
            {rows.length} {rows.length === 1 ? "entry" : "entries"}
            {!canEdit && " • Read Only"}
          </p>

          {error && (
            <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">{error}</p>
          )}

          <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                <tr>
                  <th className="py-3 px-3 border-r border-surface-variant w-20">Code</th>
                  <th className="py-3 px-3 border-r border-surface-variant w-32">Name</th>
                  <th className="py-3 px-3 border-r border-surface-variant w-28">Type</th>
                  <th className="py-3 px-3 border-r border-surface-variant">Description</th>
                  <th className="py-3 px-3 border-r border-surface-variant w-32">Date</th>
                  <th className="py-3 px-3 border-r border-surface-variant w-40">Training Video</th>
                  <th className="py-3 px-3 border-r border-surface-variant w-32">PC</th>
                  <th className="py-3 px-3 border-r border-surface-variant w-32">PS</th>
                  <th className="py-3 px-3 border-r border-surface-variant w-32">Link</th>
                  <th className="py-3 px-3 w-28 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {loading && (
                  <tr>
                    <td colSpan={10} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      Loading...
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && !adding && (
                  <tr>
                    <td colSpan={10} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      No entries yet.{canEdit ? ' Use "+ Add Row" to create one.' : ""}
                    </td>
                  </tr>
                )}

                {rows.map((row) =>
                  editingId === row.id ? (
                    renderEditRow(false, row.id)
                  ) : (
                    <tr key={row.id} className="border-b border-surface-variant hover:bg-surface-container-low transition-colors">
                      <td className={`${cell} font-data-mono font-bold`}>{row.code || "—"}</td>
                      <td className={`${cell} font-medium`}>{row.name || "—"}</td>
                      <td className={cell}>{row.type || "—"}</td>
                      <td className={`${cell} whitespace-pre-line`}>{row.description || "—"}</td>
                      <td className={`${cell} font-data-mono`}>{formatDMY(row.date)}</td>
                      <td className={cell}><LinkList raw={row.videos} /></td>
                      <td className={cell}>{row.pc || "—"}</td>
                      <td className={cell}>{row.ps || "—"}</td>
                      <td className={cell}><LinkList raw={row.link} /></td>
                      <td className="py-3 px-3 text-center align-top">
                        {canEdit ? (
                          <div className="flex flex-col gap-1">
                            <button onClick={() => startEdit(row)} className="px-2 py-1 border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors">
                              Edit
                            </button>
                            <button onClick={() => handleDelete(row)} className="px-2 py-1 border-2 border-error text-error font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors">
                              Delete
                            </button>
                          </div>
                        ) : (
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </td>
                    </tr>
                  )
                )}

                {adding && renderEditRow(true, "new-row")}
              </tbody>
            </table>
          </div>

          {canEdit && (
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">
              Codes: Office Task List = TL, Office Checklist = CL, Sahil Task List = TL2, Sahil
              Checklist = CL2. Put one training video link per line.
            </p>
          )}
        </main>
      </div>
    </>
  );
}

export default function MasterSheetPage() {
  return (
    <AuthGuard>
      <MasterSheetInner />
    </AuthGuard>
  );
}
