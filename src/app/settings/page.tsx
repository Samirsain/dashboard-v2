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
import type { Doer, List } from "@/lib/types";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDoer, setShowAddDoer] = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);
  const [doerToReset, setDoerToReset] = useState<Doer | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  // Which doer's "Lists" dropdown is currently open.
  const [openListsDoerId, setOpenListsDoerId] = useState<string | null>(null);
  // "doerId:listId" currently being saved, so its checkbox disables briefly.
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [doerData, listData] = await Promise.all([
        api.get<Doer[]>("/users"),
        api.get<List[]>("/lists").catch(() => [] as List[]),
      ]);
      setDoers(doerData);
      setLists(listData);
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

  // The full set of access rows shown for every doer: Office (implicit, no
  // list record) plus each named list, split into a Task-List (TL) and
  // Checklist (CL) side — mirroring the sidebar's OFFICE/SAHIL TL & CL.
  const buckets = useMemo<Bucket[]>(() => {
    const taskBuckets: Bucket[] = [
      { key: "office-task", label: "OFFICE TL", kind: "task", listId: "", isOffice: true },
    ];
    const checklistBuckets: Bucket[] = [
      { key: "office-checklist", label: "OFFICE CL", kind: "checklist", listId: "", isOffice: true },
    ];
    for (const l of lists) {
      const short = listGroupKey(l.name);
      if (l.type === "task") {
        taskBuckets.push({ key: `t-${l.id}`, label: `${short} TL`, kind: "task", listId: l.id, isOffice: false });
      } else {
        checklistBuckets.push({ key: `c-${l.id}`, label: `${short} CL`, kind: "checklist", listId: l.id, isOffice: false });
      }
    }
    return [...taskBuckets, ...checklistBuckets];
  }, [lists]);

  // Whether a doer currently has access to a bucket: Office is always yes;
  // a named list is yes if the doer is in its member set.
  function hasAccess(doerId: string, bucket: Bucket): boolean {
    if (bucket.isOffice) return true;
    const list = lists.find((l) => l.id === bucket.listId);
    return list ? list.memberIds.includes(doerId) : false;
  }

  // Grant/revoke a doer's access to a named list by rewriting its member set.
  async function toggleAccess(doerId: string, bucket: Bucket, shouldHaveAccess: boolean) {
    if (bucket.isOffice) return; // office is implicit — nothing to toggle
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

  async function toggleAttendanceManager(doer: Doer) {
    const next = !doer.isAttendanceManager;
    setDoers((prev) => prev.map((d) => (d.id === doer.id ? { ...d, isAttendanceManager: next } : d)));
    try {
      await api.patch<Doer>(`/users/${doer.id}`, { isAttendanceManager: next });
    } catch (err) {
      setDoers((prev) => prev.map((d) => (d.id === doer.id ? { ...d, isAttendanceManager: !next } : d)));
      alert(err instanceof ApiError ? err.message : "Failed to update Attendance Manager.");
    }
  }

  async function toggleAssistant(doer: Doer) {
    const next = !doer.isAssistant;
    setDoers((prev) => prev.map((d) => (d.id === doer.id ? { ...d, isAssistant: next } : d)));
    try {
      await api.patch<Doer>(`/users/${doer.id}`, { isAssistant: next });
    } catch (err) {
      setDoers((prev) => prev.map((d) => (d.id === doer.id ? { ...d, isAssistant: !next } : d)));
      alert(err instanceof ApiError ? err.message : "Failed to update Assistant.");
    }
  }

  async function handleRoleChange(doer: Doer, nextRole: Doer["role"]) {
    if (nextRole === doer.role) return;
    const prevRole = doer.role;
    setDoers((prev) => prev.map((d) => (d.id === doer.id ? { ...d, role: nextRole } : d)));
    try {
      await api.patch<Doer>(`/users/${doer.id}`, { role: nextRole });
    } catch (err) {
      setDoers((prev) => prev.map((d) => (d.id === doer.id ? { ...d, role: prevRole } : d)));
      alert(err instanceof ApiError ? err.message : "Failed to update role.");
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
    if (!confirm(`Permanently delete ${doer.name} (${doer.employeeCode || doer.id})? This can't be undone.`))
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
        <header className="hidden md:flex bg-surface w-full border-b-2 border-on-surface justify-between items-center h-16 px-container-padding sticky top-0 z-30">
          <div className="font-headline-md text-headline-md text-on-surface uppercase border-b-2 border-on-surface pb-1">
            Settings — Doer Management
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowCreateList(true)}
              className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors"
            >
              + Create List
            </button>
            <button
              onClick={() => setShowAddDoer(true)}
              className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors"
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
            <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">
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
                  <th className="py-3 px-4 border-r border-surface-variant w-36 text-center">Attendance Mgr</th>
                  <th className="py-3 px-4 border-r border-surface-variant w-32 text-center">Assistant</th>
                  <th className="py-3 px-4 w-64 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {loading && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      Loading...
                    </td>
                  </tr>
                )}
                {!loading && doers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
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
                      <select
                        value={d.role}
                        onChange={(e) => handleRoleChange(d, e.target.value as Doer["role"])}
                        title="Admin gets full access (Settings, Team Performance, All Tasks)"
                        className="border-2 border-on-surface bg-surface px-2 py-1 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
                      >
                        <option value="Doer">Doer</option>
                        <option value="Admin">Admin</option>
                      </select>
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
                                      className={`flex items-center gap-2 px-3 py-2 border-b border-surface-variant last:border-b-0 ${
                                        b.isOffice ? "opacity-70" : "hover:bg-surface-container cursor-pointer"
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={b.isOffice || busy}
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
                    <td className="py-3 px-4 border-r border-surface-variant text-center">
                      <input
                        type="checkbox"
                        checked={d.isAttendanceManager}
                        onChange={() => toggleAttendanceManager(d)}
                        title="Can mark attendance for every employee"
                      />
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center">
                      <input
                        type="checkbox"
                        checked={d.isAssistant}
                        onChange={() => toggleAssistant(d)}
                        title="Assistant admin: full admin access except deleting doers or tasks"
                      />
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
                        {/* Assistant admins can't delete doers. */}
                        {!currentUser?.isAssistant && (
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

  if (user && user.role !== "Admin") {
    return (
      <AuthGuard>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="font-data-mono text-data-mono text-error uppercase border-2 border-error p-4">
            Access Denied. Admins Only.
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
