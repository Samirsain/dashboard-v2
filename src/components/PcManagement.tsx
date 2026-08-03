"use client";

import InitialsAvatar from "@/components/InitialsAvatar";
import { hasListAccess, type Bucket } from "@/lib/listBuckets";
import type { Doer, List } from "@/lib/types";

/**
 * PC Management — the MD's view of their deputies.
 *
 * Sheet access is the whole point of this screen, so unlike the Doer table
 * (where it hides behind a dropdown) every sheet is laid out as a visible
 * tickbox per PC. What you see is exactly what that PC can reach.
 */
export default function PcManagement({
  pcs,
  lists,
  buckets,
  loading,
  savingKey,
  onToggleAccess,
  onRename,
  onResetPassword,
  onDemote,
  onDelete,
  onReassignWork,
  demotingId,
}: {
  pcs: Doer[];
  lists: List[];
  buckets: Bucket[];
  loading: boolean;
  /** "doerId:listId" currently in flight, so that one tickbox disables. */
  savingKey: string | null;
  onToggleAccess: (doerId: string, bucket: Bucket, next: boolean) => void;
  onRename: (pc: Doer) => void;
  onResetPassword: (pc: Doer) => void;
  onDemote: (pc: Doer) => void;
  onDelete: (pc: Doer) => void;
  onReassignWork: (pc: Doer) => void;
  demotingId: string | null;
}) {
  if (loading) {
    return (
      <div className="border-2 border-on-surface p-8 text-center font-data-mono text-data-mono text-on-surface-variant">
        Loading…
      </div>
    );
  }

  if (pcs.length === 0) {
    return (
      <div className="border-2 border-on-surface p-8 text-center">
        <p className="font-data-mono text-data-mono text-on-surface-variant">
          No PCs yet.
        </p>
        <p className="mt-2 font-label-sm text-label-sm text-on-surface-variant">
          Use &quot;+ Add PC&quot; to create one, or switch an existing person to PC from Doer Management.
        </p>
      </div>
    );
  }

  const taskBuckets = buckets.filter((b) => b.kind === "task");
  const checklistBuckets = buckets.filter((b) => b.kind === "checklist");

  return (
    <div className="flex flex-col gap-4">
      {pcs.map((pc) => (
        <section key={pc.id} className="border-2 border-on-surface bg-surface-container-lowest">
          {/* Who */}
          <header className="flex flex-col gap-3 border-b-2 border-on-surface p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <InitialsAvatar name={pc.name} className="w-8 h-8 border border-on-surface shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-on-surface truncate">{pc.name}</p>
                <p className="font-data-mono text-data-mono text-on-surface-variant">
                  {pc.employeeCode || pc.id}
                  {pc.status === "Inactive" && (
                    <span className="ml-2 border border-error px-1.5 py-0.5 font-label-sm text-[10px] uppercase text-error">
                      Inactive
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onRename(pc)}
                className="inline-flex items-center justify-center min-h-[36px] px-3 text-[11px] font-label-sm uppercase tracking-wide border border-on-surface bg-surface text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                Rename
              </button>
              <button
                onClick={() => onResetPassword(pc)}
                className="inline-flex items-center justify-center min-h-[36px] px-3 text-[11px] font-label-sm uppercase tracking-wide border border-on-surface bg-surface text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                Reset Password
              </button>
              <button
                onClick={() => onReassignWork(pc)}
                title="Move every open task and active checklist to someone else — e.g. while they're on leave."
                className="inline-flex items-center justify-center min-h-[36px] px-3 text-[11px] font-label-sm uppercase tracking-wide border border-on-surface bg-surface text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
              >
                Reassign All Work
              </button>
              <button
                onClick={() => onDemote(pc)}
                disabled={demotingId === pc.id}
                title="Drops them back to a plain Doer — they keep their account and their own tasks."
                className="inline-flex items-center justify-center min-h-[36px] px-3 text-[11px] font-label-sm uppercase tracking-wide border border-on-surface bg-surface text-on-surface hover:bg-surface-container transition-colors cursor-pointer disabled:opacity-40"
              >
                {demotingId === pc.id ? "Removing…" : "Remove PC"}
              </button>
              <button
                onClick={() => onDelete(pc)}
                className="inline-flex items-center justify-center min-h-[36px] px-3 text-[11px] font-label-sm uppercase tracking-wide border border-error bg-surface text-error hover:bg-error hover:text-white transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </header>

          {/* Sheet access */}
          <div className="p-3">
            <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">
              Sheet Access
            </p>
            <p className="mt-1 font-label-sm text-[11px] text-on-surface-variant">
              Unticking a sheet hides its tasks and checklists from this PC everywhere in the app.
            </p>

            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {[
                { title: "Task Lists", items: taskBuckets },
                { title: "Checklists", items: checklistBuckets },
              ].map(({ title, items }) => (
                <div key={title} className="border border-on-surface/30">
                  <p className="border-b border-on-surface/30 px-3 py-1.5 font-label-sm text-[11px] uppercase text-on-surface-variant">
                    {title}
                  </p>
                  {items.length === 0 ? (
                    <p className="px-3 py-2 font-data-mono text-xs text-on-surface-variant">None</p>
                  ) : (
                    items.map((b) => {
                      const checked = hasListAccess(lists, pc.id, b);
                      const busy = savingKey === `${pc.id}:${b.listId}`;
                      return (
                        <label
                          key={b.key}
                          className="flex items-center gap-2 border-b border-on-surface/15 px-3 py-2 last:border-b-0 hover:bg-surface-container cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={busy || b.isOffice}
                            onChange={(e) => onToggleAccess(pc.id, b, e.target.checked)}
                          />
                          <span className="font-label-sm text-label-sm uppercase text-on-surface">
                            {b.label}
                          </span>
                          {b.isOffice && (
                            <span
                              title="This bucket has no list record yet, so it can't be toggled."
                              className="ml-auto font-label-sm text-[10px] uppercase text-on-surface-variant"
                            >
                              Default
                            </span>
                          )}
                          {busy && (
                            <span className="ml-auto font-label-sm text-[10px] uppercase text-on-surface-variant">
                              Saving…
                            </span>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
