"use client";

import { useEffect, useMemo, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import InitialsAvatar from "@/components/InitialsAvatar";
import CreateDoerModal from "@/components/CreateDoerModal";
import CreateListModal from "@/components/CreateListModal";
import ResetPasswordModal from "@/components/ResetPasswordModal";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { canDeleteDoer, canManageDoers } from "@/lib/access";
import type { Doer, List, Task } from "@/lib/types";

/** First word of a list's name, uppercased — "SAHIL SIR TASKLIST" -> "SAHIL". */
function listGroupKey(name: string): string {
  return name.trim().split(/\s+/)[0]?.toUpperCase() || "LIST";
}

/**
 * One access row in a doer's Lists dropdown. `isOffice` buckets are the
 * implicit default (no list record — everyone has them), so they're shown
 * checked and can't be toggled. Named buckets map to a real list whose
 * member set the admin grants/revokes.
 */
type Bucket = {
  key: string;
  label: string;
  kind: "task" | "checklist";
  listId: string;
  isOffice: boolean;
};

function StatusPill({ status }: { status: Doer["status"] }) {
  if (status === "Inactive") {
    return (
      <span className="inline-block border-2 border-error text-error font-label-sm text-label-sm uppercase px-2 py-0.5">
        Inactive
      </span>
    );
  }
  return (
    <span className="inline-block border-2 border-on-surface bg-on-surface text-surface-container-lowest font-label-sm text-label-sm uppercase px-2 py-0.5">
      Active
    </span>
  );
}

function SettingsInner() {
  const { user: currentUser } = useAuth();
  const [doers, setDoers] = useState<Doer[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDoer, setShowAddDoer] = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);
  const [doerToReset, setDoerToReset] = useState<Doer | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  // Role dropdown: picking a value only stages it here — nothing is sent
  // until Save is clicked, so a stray click on the dropdown can't silently
  // change someone's access. doerId -> the staged (unsaved) role.
  const [pendingRoles, setPendingRoles] = useState<Record<string, Doer["role"]>>({});
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  // Which doer's "Lists" dropdown is currently open.
  const [openListsDoerId, setOpenListsDoerId] = useState<string | null>(null);
  // "doerId:listId" currently being saved, so its checkbox disables briefly.
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [doerData, listData, taskData] = await Promise.all([
        api.get<Doer[]>("/users"),
        api.get<List[]>("/lists").catch(() => [] as List[]),
        // Only used to warn how much unfinished work a deletion would orphan.
        api.get<Task[]>("/tasks").catch(() => [] as Task[]),
      ]);
      setDoers(doerData);
      setLists(listData);
      setTasks(taskData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load doers.");
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

  // The full set of access rows shown for every doer.
  // OFFICE TL/CL always appear first. If a real list starting with "OFFICE"
  // exists, we link its ID so the checkbox can toggle membership. Otherwise
  // they show as read-only (isOffice fallback).
  const buckets = useMemo<Bucket[]>(() => {
    const officeTl = lists.find((l) => l.type === "task" && l.name.trim().toUpperCase().startsWith("OFFICE"));
    const officeCl = lists.find((l) => l.type === "checklist" && l.name.trim().toUpperCase().startsWith("OFFICE"));

    const taskBuckets: Bucket[] = [
      { key: "office-task", label: "OFFICE TL", kind: "task", listId: officeTl?.id ?? "", isOffice: !officeTl },
    ];
    const checklistBuckets: Bucket[] = [
      { key: "office-checklist", label: "OFFICE CL", kind: "checklist", listId: officeCl?.id ?? "", isOffice: !officeCl },
    ];

    for (const l of lists) {
      if (l.name.trim().toUpperCase().startsWith("OFFICE")) continue; // already in fixed slots above
      const short = listGroupKey(l.name);
      if (l.type === "task") {
        taskBuckets.push({ key: `t-${l.id}`, label: `${short} TL`, kind: "task", listId: l.id, isOffice: false });
      } else {
        checklistBuckets.push({ key: `c-${l.id}`, label: `${short} CL`, kind: "checklist", listId: l.id, isOffice: false });
      }
    }
    return [...taskBuckets, ...checklistBuckets];
  }, [lists]);

  // Whether a doer currently has access to a bucket.
  // Office buckets also have a real listId — check membership like any other list.
  function hasAccess(doerId: string, bucket: Bucket): boolean {
    const list = lists.find((l) => l.id === bucket.listId);
    if (!list) return bucket.isOffice; // fallback: office = yes if list not found
    return list.memberIds.includes(doerId);
  }

  // Grant/revoke a doer's access to a list by rewriting its member set.
  async function toggleAccess(doerId: string, bucket: Bucket, shouldHaveAccess: boolean) {
    const list = lists.find((l) => l.id === bucket.listId);
    if (!list) return;
    const memberIds = shouldHaveAccess
      ? Array.from(new Set([...list.memberIds, doerId]))
      : list.memberIds.filter((id) => id !== doerId);
    setSavingKey(`${doerId}:${bucket.listId}`);
    try {
      const updated = await api.patch<List>(`/lists/${list.id}/members`, { memberIds });
      setLists((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to update access.");
    } finally {
      setSavingKey(null);
    }
  }

  async function handleDeleteList(bucket: Bucket) {
    if (bucket.isOffice) return;
    if (!confirm(`Permanently delete the "${bucket.label}" list? This can't be undone.`)) return;
    try {
      await api.delete(`/lists/${bucket.listId}`);
      setLists((prev) => prev.filter((l) => l.id !== bucket.listId));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete list.");
    }
  }

  /** Unfinished tasks currently on this doer — what deleting them would orphan. */
  function openTaskCountFor(doerId: string): number {
    return tasks.filter(
      (t) => t.assignedDoerId === doerId && t.status !== "Completed" && t.status !== "Cancelled"
    ).length;
  }

  function handleRoleSelect(doerId: string, role: Doer["role"]) {
    setPendingRoles((prev) => ({ ...prev, [doerId]: role }));
  }

  async function handleRoleSave(doer: Doer) {
    const nextRole = pendingRoles[doer.id];
    if (!nextRole || nextRole === doer.role) return;
    setSavingRoleId(doer.id);
    try {
      const updated = await api.patch<Doer>(`/users/${doer.id}`, { role: nextRole });
      setDoers((prev) => prev.map((d) => (d.id === doer.id ? updated : d)));
      setPendingRoles((prev) => {
        const next = { ...prev };
        delete next[doer.id];
        return next;
      });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to update role.");
    } finally {
      setSavingRoleId(null);
    }
  }

  async function handleRename(doer: Doer) {
    const nextName = prompt(`Rename ${doer.name} to:`, doer.name)?.trim();
    if (!nextName || nextName === doer.name) return;
    const prevName = doer.name;
    setDoers((prev) => prev.map((d) => (d.id === doer.id ? { ...d, name: nextName } : d)));
    try {
      await api.patch<Doer>(`/users/${doer.id}`, { name: nextName });
    } catch (err) {
      setDoers((prev) => prev.map((d) => (d.id === doer.id ? { ...d, name: prevName } : d)));
      alert(err instanceof ApiError ? err.message : "Failed to rename.");
    }
  }

  async function handleDelete(doer: Doer) {
    if (doer.id === currentUser?.id) {
      alert("You can't delete your own account.");
      return;
    }
    // Their tasks survive the deletion — say so up front, with the count, so
    // nobody assumes the work went away with the account.
    const open = openTaskCountFor(doer.id);
    const warning =
      open > 0
        ? `\n\n${open} unfinished task${open === 1 ? "" : "s"} will be left unassigned. ` +
          `Find them under All Tasks → Unassigned and hand them to someone else.`
        : "";
    if (
      !confirm(
        `Permanently delete ${doer.name} (${doer.employeeCode || doer.id})? This can't be undone.${warning}`
      )
    )
      return;
    try {
      await api.delete(`/users/${doer.id}`);
      setDoers((prev) => prev.filter((d) => d.id !== doer.id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete doer.");
    }
  }

  return (
    <>
      <MobileHeader />
      <SideNav active="settings" />

      <div className="md:ml-64 flex-1 flex flex-col bg-background min-h-screen">
        <header className="flex flex-col gap-2 bg-surface w-full border-b border-on-surface p-3 z-30 md:flex-row md:items-center md:justify-between md:gap-4 md:h-16 md:py-0 md:px-container-padding md:sticky md:top-0">
          <div className="font-headline-md text-headline-md text-on-surface uppercase border-b-2 border-on-surface pb-1">
            Settings — Doer Management
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowCreateList(true)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-on-surface text-surface border-on-surface hover:opacity-90 transition-colors cursor-pointer"
            >
              + Create List
            </button>
            <button
              onClick={() => setShowAddDoer(true)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-on-surface text-surface border-on-surface hover:opacity-90 transition-colors cursor-pointer"
            >
              + Add Doer
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-lg">
          <div className="border-b-2 border-on-surface pb-stack-md flex justify-between items-end md:hidden">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface uppercase tracking-tighter">
              Doer Management
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreateList(true)}
                className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase"
              >
                + List
              </button>
              <button
                onClick={() => setShowAddDoer(true)}
                className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase"
              >
                + Doer
              </button>
            </div>
          </div>

          {resetNotice && (
            <p className="font-label-sm text-label-sm text-primary border-2 border-primary px-3 py-2">
              {resetNotice}
            </p>
          )}
          {error && (
            <p className="font-label-sm text-sm text-error border border-error px-3 py-2">
              {error}
            </p>
          )}

          <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                <tr>
                  <th className="py-3 px-4 border-r border-surface-variant">Name</th>
                  <th className="py-3 px-4 border-r border-surface-variant w-32">User ID</th>
                  <th className="py-3 px-4 border-r border-surface-variant w-28 text-center">Role</th>
                  <th className="py-3 px-4 border-r border-surface-variant w-56">Lists</th>
                  <th className="py-3 px-4 w-64 text-center">Action</th>
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
                {!loading && doers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      No doers found.
                    </td>
                  </tr>
                )}
                {doers.map((d) => (
                  <tr key={d.id} className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors">
                    <td className="py-3 px-4 border-r border-surface-variant">
                      <div className="flex items-center gap-2">
                        <InitialsAvatar name={d.name} className="w-6 h-6 border border-on-surface" />
                        <span className="font-medium">{d.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant font-data-mono text-data-mono">
                      {d.employeeCode || "—"}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center">
                      {(() => {
                        const pending = pendingRoles[d.id];
                        const isDirty = pending !== undefined && pending !== d.role;
                        const isSaving = savingRoleId === d.id;
                        return (
                          <div className="flex items-center justify-center gap-2">
                            <select
                              value={pending ?? d.role}
                              onChange={(e) => handleRoleSelect(d.id, e.target.value as Doer["role"])}
                              disabled={isSaving}
                              title="MD gets full access (Settings, Team Performance, All Tasks); PC gets everything except deleting a task, deleting a doer, Team Performance, and editing attendance"
                              className={`border-2 bg-surface px-2 py-1 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none disabled:opacity-50 ${
                                isDirty ? "border-amber-500" : "border-on-surface"
                              }`}
                            >
                              <option value="Doer">Doer</option>
                              <option value="PC">PC</option>
                              <option value="MD">MD</option>
                            </select>
                            {isDirty && (
                              <button
                                onClick={() => handleRoleSave(d)}
                                disabled={isSaving}
                                className="px-2 py-1 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors disabled:opacity-50"
                              >
                                {isSaving ? "Saving…" : "Save"}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant align-top">
                      {(() => {
                        const accessCount = buckets.filter((b) => hasAccess(d.id, b)).length;
                        return (
                          <div className="relative">
                            <button
                              onClick={() =>
                                setOpenListsDoerId((prev) => (prev === d.id ? null : d.id))
                              }
                              className="w-full flex items-center justify-between gap-2 border-2 border-on-surface px-2 py-1 font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
                            >
                              <span className="truncate">
                                {accessCount} list{accessCount === 1 ? "" : "s"}
                              </span>
                              <span className="material-symbols-outlined text-base">
                                {openListsDoerId === d.id ? "expand_less" : "expand_more"}
                              </span>
                            </button>

                            {openListsDoerId === d.id && (
                              <div className="absolute z-20 mt-1 left-0 w-64 max-h-64 overflow-y-auto bg-surface border-2 border-on-surface shadow-lg">
                                {buckets.map((b) => {
                                  const checked = hasAccess(d.id, b);
                                  const busy = savingKey === `${d.id}:${b.listId}`;
                                  return (
                                    <label
                                      key={b.key}
                                      className="flex items-center gap-2 px-3 py-2 border-b border-surface-variant last:border-b-0 hover:bg-surface-container cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={busy}
                                        onChange={(e) => toggleAccess(d.id, b, e.target.checked)}
                                      />
                                      <span className="font-label-sm text-label-sm uppercase text-on-surface">
                                        {b.label}
                                      </span>
                                      {b.isOffice && (
                                        <span className="ml-auto font-label-sm text-[10px] uppercase text-on-surface-variant">
                                          Default
                                        </span>
                                      )}
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleRename(d)}
                          className="px-2 py-1 border-2 border-on-surface text-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => setDoerToReset(d)}
                          className="px-2 py-1 border-2 border-on-surface text-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors"
                        >
                          Reset Password
                        </button>
                        {/* Deleting a doer is MD-only — a PC can add, rename
                            and reset passwords but never remove someone. */}
                        {canDeleteDoer(currentUser) && !currentUser?.isAssistant && (
                          <button
                            onClick={() => handleDelete(d)}
                            className="px-2 py-1 border-2 border-error text-error font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-b-2 border-on-surface pb-stack-md">
            <h2 className="font-headline-lg-mobile md:font-headline-md text-headline-lg-mobile md:text-headline-md text-on-surface uppercase tracking-tighter">
              Lists Overview
            </h2>
          </div>

          <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                <tr>
                  <th className="py-3 px-4 border-r border-surface-variant">List Name</th>
                  <th className="py-3 px-4 border-r border-surface-variant w-32 text-center">Type</th>
                  <th className="py-3 px-4 border-r border-surface-variant">Members</th>
                  <th className="py-3 px-4 w-32 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {!loading && buckets.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      No lists found.
                    </td>
                  </tr>
                )}
                {buckets.map((b) => {
                  const members = doers.filter((d) => hasAccess(d.id, b));
                  return (
                    <tr key={b.key} className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors">
                      <td className="py-3 px-4 border-r border-surface-variant font-medium">
                        {b.label}
                      </td>
                      <td className="py-3 px-4 border-r border-surface-variant text-center">
                        <span className="font-label-sm text-label-sm uppercase">
                          {b.kind === "task" ? "Task List" : "Checklist"}
                        </span>
                      </td>
                      <td className="py-3 px-4 border-r border-surface-variant">
                        {members.length === 0 ? (
                          <span className="font-data-mono text-data-mono text-on-surface-variant">
                            No one assigned
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {members.map((m) => (
                              <span
                                key={m.id}
                                className="inline-flex items-center gap-1.5 border border-on-surface px-2 py-1"
                              >
                                <InitialsAvatar name={m.name} className="w-5 h-5 border border-on-surface" />
                                <span className="font-label-sm text-label-sm uppercase">{m.name}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {b.isOffice ? (
                          <span className="font-label-sm text-[10px] uppercase text-on-surface-variant">
                            Default
                          </span>
                        ) : (
                          <button
                            onClick={() => handleDeleteList(b)}
                            className="px-2 py-1 border-2 border-error text-error font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {showAddDoer && (
        <CreateDoerModal
          onClose={() => setShowAddDoer(false)}
          onCreated={(doer) => {
            setDoers((prev) => [...prev, doer]);
            setShowAddDoer(false);
          }}
        />
      )}

      {showCreateList && (
        <CreateListModal
          onClose={() => setShowCreateList(false)}
          onCreated={(list) => {
            setLists((prev) => [...prev, list]);
            setShowCreateList(false);
          }}
        />
      )}

      {doerToReset && (
        <ResetPasswordModal
          doer={doerToReset}
          onClose={() => setDoerToReset(null)}
          onReset={() => {
            setResetNotice(`Password reset for ${doerToReset.name}.`);
            setDoerToReset(null);
            setTimeout(() => setResetNotice(null), 4000);
          }}
        />
      )}
    </>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();

  // Doer Management is MD-only — a PC gets everything else, but not this.
  if (user && !canManageDoers(user)) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="font-data-mono text-data-mono text-error uppercase border-2 border-error p-4">
            Access Denied. MD Only.
          </p>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <SettingsInner />
    </AuthGuard>
  );
}
