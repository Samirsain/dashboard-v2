"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Doer, List } from "@/lib/types";

export default function ManageListAccessModal({
  list,
  onClose,
  onSaved,
}: {
  list: List;
  onClose: () => void;
  onSaved: (updated: List) => void;
}) {
  const [doers, setDoers] = useState<Doer[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(list.memberIds));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<Doer[]>("/users")
      .then((all) => setDoers(all.filter((d) => d.role === "Doer")))
      .catch(() => setDoers([]));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const updated = await api.patch<List>(`/lists/${list.id}/members`, {
        memberIds: Array.from(selected),
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save access.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-surface-container-lowest border-2 border-on-surface">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md">
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface uppercase">
              Manage Access
            </h3>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">
              {list.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase"
          >
            Close
          </button>
        </div>

        <div className="p-stack-lg flex flex-col gap-stack-md">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Select which employees can access this list. Admins always can.
          </p>
          <div className="flex flex-col gap-1 max-h-72 overflow-y-auto border-2 border-on-surface">
            {doers.map((d) => (
              <label
                key={d.id}
                className="flex items-center gap-3 px-3 py-2 border-b border-on-surface-variant/30 cursor-pointer hover:bg-surface-container"
              >
                <input
                  type="checkbox"
                  checked={selected.has(d.id)}
                  onChange={() => toggle(d.id)}
                  className="w-4 h-4 accent-on-surface"
                />
                <span className="font-body-md text-body-md text-on-surface">{d.name}</span>
                <span className="ml-auto font-data-mono text-data-mono text-on-surface-variant text-[11px]">
                  {d.employeeCode}
                </span>
              </label>
            ))}
            {doers.length === 0 && (
              <p className="px-3 py-2 font-data-mono text-data-mono text-on-surface-variant">
                No employees found.
              </p>
            )}
          </div>

          {error && (
            <p className="font-body-sm text-body-sm text-error border-2 border-error px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-stack-sm">
            <button
              type="button"
              onClick={onClose}
              className="border-2 border-on-surface px-4 py-2 font-label-sm text-label-sm uppercase text-on-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="border-2 border-on-surface bg-on-surface px-4 py-2 font-label-sm text-label-sm uppercase text-surface disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Access"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
