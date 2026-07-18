"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import InitialsAvatar from "@/components/InitialsAvatar";
import AuthGuard from "@/components/AuthGuard";
import CreateChecklistModal from "@/components/CreateChecklistModal";
import { api, ApiError } from "@/lib/api";
import { formatDMY } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import type { Doer, ChecklistInstance, ChecklistTemplate, List } from "@/lib/types";

function ChecklistStatusPill({ status }: { status: "Pending" | "Completed" }) {
  if (status === "Completed") {
    return (
      <span className="inline-block border-2 border-on-surface bg-on-surface text-surface-container-lowest font-label-sm text-label-sm uppercase px-3 py-1">
        Completed
      </span>
    );
  }
  return (
    <span className="inline-block border-2 border-on-surface text-on-surface font-label-sm text-label-sm uppercase px-3 py-1">
      {status}
    </span>
  );
}

function ChecklistInner() {
  const { user } = useAuth();
  const [instances, setInstances] = useState<ChecklistInstance[]>([]);
  const [doers, setDoers] = useState<Doer[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [templateListMap, setTemplateListMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // /checklist/today first: it auto-generates today's instances from the
      // active templates. Then fetch ALL instances so the page shows the full
      // checklist data (today's to-dos + past history), not just today.
      await api.get<ChecklistInstance[]>("/checklist/today").catch(() => []);
      const [checklistData, doerData, listData, templateData] = await Promise.all([
        api.get<ChecklistInstance[]>("/checklist/instances"),
        api.get<Doer[]>("/users"),
        api.get<List[]>("/lists?type=checklist").catch(() => [] as List[]),
        api.get<ChecklistTemplate[]>("/checklist/templates").catch(() => [] as ChecklistTemplate[]),
      ]);
      setLists(listData);
      setTemplateListMap(
        Object.fromEntries(templateData.map((t) => [t.id, t.listId]))
      );
      
      const enrichedInstances = checklistData.map((instance) => {
        const doer = doerData.find((d) => d.id === instance.assignedDoerId);
        return {
          ...instance,
          doer: doer ? { id: doer.id, name: doer.name, mobile: doer.mobile, email: doer.email, department: doer.department, role: doer.role } : null,
        };
      });

      // Open work first (today's to-dos on top), then completed history
      // newest-first — so the page reads as "do this now" + "what's done".
      enrichedInstances.sort((a, b) => {
        if (a.status !== b.status) return a.status === "Pending" ? -1 : 1;
        return b.date.localeCompare(a.date);
      });

      setInstances(enrichedInstances);
      setDoers(doerData.filter(d => d.role === "Doer" || d.role === "Admin"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load checklist.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadData();
    });
  }, []);

  async function handleComplete(id: string) {
    if (!user) return;
    try {
      await api.post(`/checklist/instances/${id}/complete`);
      setInstances((prev) =>
        prev.map((inst) =>
          inst.id === id ? { ...inst, status: "Completed", completedBy: user.name } : inst
        )
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to complete item.");
    }
  }

  const listFilter = useSearchParams().get("list") ?? "";
  const currentList = lists.find((l) => l.id === listFilter) ?? null;

  const filtered = instances
    .filter((t) => {
      const tListId = templateListMap[t.templateId] ?? "";
      // A named list (e.g. Sahil Sir Checklist) shows only its own items.
      // The main "Daily Checklist" (no list selected) shows only items that
      // don't belong to any named list — so list-specific items don't leak
      // into the general view.
      return listFilter ? tListId === listFilter : tListId === "";
    })
    .filter((t) =>
      `${t.taskName} ${t.doer?.name ?? ""}`.toLowerCase().includes(search.toLowerCase())
    );

  return (
    <>
      <MobileHeader />
      <SideNav active="checklist" />

      <div className="md:ml-64 flex-1 flex flex-col bg-background min-h-screen">
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
                placeholder="SEARCH CHECKLIST"
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
          {/* Mobile search (desktop header is hidden below md) */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SEARCH CHECKLIST..."
            className="md:hidden w-full border-2 border-on-surface bg-surface px-3 py-2 font-data-mono text-data-mono uppercase text-on-surface placeholder-on-surface-variant focus:outline-none"
          />
          <div className="flex flex-wrap justify-between items-end gap-3 border-b-2 border-on-surface pb-stack-md">
            <div>
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-xl md:text-headline-xl text-on-surface uppercase tracking-tighter">
                {currentList ? currentList.name : "Daily Checklist"}
              </h2>
              <p className="font-data-mono text-data-mono text-on-surface-variant mt-2 uppercase">
                {currentList ? `${filtered.length} in this list` : `${filtered.length} items`} &bull; System Live
              </p>
            </div>
            <div className="flex gap-stack-sm">
              <button
                onClick={loadData}
                className="px-4 py-2 border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors"
              >
                Refresh
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors"
              >
                + Create Checklist
              </button>
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
                  <th className="py-3 px-4 border-r border-surface-variant">Task Name</th>
                  <th className="py-3 px-4 w-40 border-r border-surface-variant">Assigned To</th>
                  <th className="py-3 px-4 w-40 border-r border-surface-variant text-center">Date</th>
                  <th className="py-3 px-4 w-40 border-r border-surface-variant text-center">Status</th>
                  <th className="py-3 px-4 w-40 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {loading && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      Loading...
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      No checklist items found.
                    </td>
                  </tr>
                )}
                {filtered.map((item, i) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-surface-container-low transition-colors group ${
                      i !== filtered.length - 1 ? "border-b border-surface-variant" : ""
                    }`}
                  >
                    <td className="py-3 px-4 border-r border-surface-variant">
                      {item.taskName}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant">
                      <div className="flex items-center gap-2">
                        <InitialsAvatar
                          name={item.doer?.name ?? "?"}
                          className="w-6 h-6 border border-on-surface"
                        />
                        <span className="font-label-sm text-label-sm uppercase truncate">
                          {item.doer?.name ?? "Unassigned"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center font-data-mono text-data-mono">
                      {formatDMY(item.date)}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center">
                      <ChecklistStatusPill status={item.status} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.status === "Pending" ? (
                        <button
                          onClick={() => handleComplete(item.id)}
                          className="px-3 py-1 bg-on-surface text-surface-container-lowest font-label-sm text-label-sm uppercase hover:bg-primary transition-colors"
                        >
                          Complete
                        </button>
                      ) : (
                        <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                          Done
                        </span>
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
        <CreateChecklistModal
          doers={doers}
          lists={lists}
          defaultListId={listFilter}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadData(); // refresh instances in case backend generated new ones
          }}
        />
      )}
    </>
  );
}

export default function ChecklistPage() {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <ChecklistInner />
      </Suspense>
    </AuthGuard>
  );
}
