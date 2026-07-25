"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { Doer } from "@/lib/types";

export default function ResetPasswordModal({
  doer,
  onClose,
  onReset,
}: {
  doer: Doer;
  onClose: () => void;
  onReset: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/users/${doer.id}/reset-password`, { newPassword });
      onReset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset password.");
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    "mt-1 min-h-[40px] w-full border border-on-surface bg-surface px-3 py-2 text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface font-data-mono";
  const label = "font-label-sm text-label-sm uppercase text-on-surface-variant";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-sm flex-col overflow-y-auto border border-on-surface bg-surface">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md">
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">
            Reset Password
          </h3>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-stack-md p-stack-lg">
          <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">
            {doer.name} &bull; {doer.employeeCode || doer.id}
          </p>

          <div>
            <label className={label}>New Password</label>
            <input
              required
              minLength={4}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New login password"
              className={field}
            />
            <p className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
              Existing passwords can&apos;t be viewed (they&apos;re securely hashed) — set a new
              one and share it with the doer directly.
            </p>
          </div>

          {error && (
            <p className="font-label-sm text-sm text-error border border-error px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-stack-sm justify-end pt-2">
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
              {submitting ? "Resetting..." : "Reset Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
