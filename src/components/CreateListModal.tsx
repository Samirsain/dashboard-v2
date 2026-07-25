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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-y-auto border border-on-surface bg-surface">
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
              className="mt-1 min-h-[40px] w-full border border-on-surface bg-surface px-3 py-2 text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface"
            />
          </div>

          <div>
            <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ListType)}
              className="mt-1 min-h-[40px] w-full border border-on-surface bg-surface px-3 py-2 text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface"
            >
              <option value="task">Task List</option>
              <option value="checklist">Checklist</option>
            </select>
          </div>

          {error && (
            <p className="font-body-sm text-sm text-error border border-error px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-stack-sm">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-surface text-on-surface border-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-on-surface text-surface border-on-surface hover:opacity-90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating..." : "Create List"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
