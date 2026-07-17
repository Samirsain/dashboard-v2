"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { Doer } from "@/lib/types";

/** "EM07" -> "EM@07" — the existing employee-code / password convention. */
function passwordFromCode(code: string): string {
  const m = code.trim().match(/^([A-Za-z]+)(\d+)$/);
  return m ? `${m[1]}@${m[2]}` : "";
}

export default function CreateDoerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (doer: Doer) => void;
}) {
  const [name, setName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("Doer");
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Auto-fill the password from the employee code (EM07 -> EM@07) until the
  // admin edits it by hand.
  const effectivePassword = passwordTouched ? password : passwordFromCode(employeeCode);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const doer = await api.post<Doer>("/users", {
        name,
        employeeCode,
        mobile,
        email,
        department,
        role,
        status: "Active",
        password: effectivePassword,
      });
      onCreated(doer);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add doer.");
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    "mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 text-on-surface focus:outline-none";
  const label = "font-label-sm text-label-sm uppercase text-on-surface-variant";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-surface-container-lowest border-2 border-on-surface max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md sticky top-0 bg-surface-container-lowest">
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">Add Doer</h3>
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
            <label className={label}>Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </div>

          <div className="grid grid-cols-2 gap-stack-md">
            <div>
              <label className={label}>Employee Code</label>
              <input
                required
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                placeholder="e.g. EM07"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={field}>
                <option value="Doer">Doer</option>
                <option value="Admin">Admin</option>
              </select>
            </div>

            <div>
              <label className={label}>Mobile</label>
              <input required value={mobile} onChange={(e) => setMobile(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label}>Department</label>
              <input
                required
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className={field}
              />
            </div>
          </div>

          <div>
            <label className={label}>Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </div>

          <div>
            <label className={label}>Password (login)</label>
            <input
              required
              value={effectivePassword}
              onChange={(e) => {
                setPasswordTouched(true);
                setPassword(e.target.value);
              }}
              className={`${field} font-data-mono`}
            />
            <p className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
              Auto-filled from code (e.g. EM07 → EM@07). Edit if you want a different password.
            </p>
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
              {submitting ? "Adding..." : "Add Doer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
