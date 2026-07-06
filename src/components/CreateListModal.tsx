"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { List, ListType } from "@/lib/types";

export default function CreateListModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (list: List) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ListType>("task");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const list = await api.post<List>("/lists", { name, type });
      onCreated(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create list.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-surface-container-lowest border-2 border-on-surface">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md">
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">
            Create List
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-stack-md p-stack-lg">
          <div>
            <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
              List Name
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sahil Sir, Sales Team"
              className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
            />
          </div>

          <div>
            <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ListType)}
              className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none"
            >
              <option value="task">Task List</option>
              <option value="checklist">Checklist</option>
            </select>
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
              type="submit"
              disabled={submitting}
              className="border-2 border-on-surface bg-on-surface px-4 py-2 font-label-sm text-label-sm uppercase text-surface disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create List"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
