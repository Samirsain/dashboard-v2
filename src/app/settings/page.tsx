"use client";

import { useEffect, useMemo, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import InitialsAvatar from "@/components/InitialsAvatar";
import CreateDoerModal from "@/components/CreateDoerModal";
import ResetPasswordModal from "@/components/ResetPasswordModal";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Doer, List } from "@/lib/types";

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
  const [doerToReset, setDoerToReset] = useState<Doer | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

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

  // Every list a doer is a member of, e.g. "SAHIL SIR TASKLIST, SAHIL SIR CHECKLIST".
  const listsByDoer = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const l of lists) {
      for (const memberId of l.memberIds) {
        if (!map.has(memberId)) map.set(memberId, []);
        map.get(memberId)!.push(l.name);
      }
    }
    return map;
  }, [lists]);

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
          <button
            onClick={() => setShowAddDoer(true)}
            className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors"
          >
            + Add Doer
          </button>
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-lg">
          <div className="border-b-2 border-on-surface pb-stack-md flex justify-between items-end md:hidden">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface uppercase tracking-tighter">
              Doer Management
            </h2>
            <button
              onClick={() => setShowAddDoer(true)}
              className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase"
            >
              + Add
            </button>
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
                  <th className="py-3 px-4 border-r border-surface-variant w-36">Department</th>
                  <th className="py-3 px-4 border-r border-surface-variant w-28 text-center">Role</th>
                  <th className="py-3 px-4 border-r border-surface-variant w-28 text-center">Status</th>
                  <th className="py-3 px-4 border-r border-surface-variant w-56">Lists</th>
                  <th className="py-3 px-4 w-56 text-center">Action</th>
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
                    <td className="py-3 px-4 border-r border-surface-variant text-on-surface-variant">
                      {d.department || "—"}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center">
                      <span className="font-label-sm text-label-sm uppercase">{d.role}</span>
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center">
                      <StatusPill status={d.status} />
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-on-surface-variant">
                      {(listsByDoer.get(d.id) ?? []).length > 0
                        ? (listsByDoer.get(d.id) ?? []).join(", ")
                        : "—"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setDoerToReset(d)}
                          className="px-2 py-1 border-2 border-on-surface text-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors"
                        >
                          Reset Password
                        </button>
                        <button
                          onClick={() => handleDelete(d)}
                          className="px-2 py-1 border-2 border-error text-error font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
