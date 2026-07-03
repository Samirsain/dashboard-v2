"use client";

import { useState, type FormEvent } from "react";
import { useAuth, ApiError } from "@/lib/auth-context";

export default function LoginPage() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm bg-surface-container-lowest border-2 border-on-surface p-8">
        <div className="mb-stack-lg text-center">
          <h1 className="font-headline-md text-headline-md font-bold uppercase tracking-tighter text-on-surface">
            ThirtyMilestones
          </h1>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">
            Enterprise RE MIS
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-stack-md">
          <div>
            <label
              htmlFor="identifier"
              className="font-label-sm text-label-sm uppercase text-on-surface-variant"
            >
              Employee Code or Email
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="EM01"
              className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 font-data-mono text-data-mono text-on-surface focus:outline-none focus:ring-0"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="font-label-sm text-label-sm uppercase text-on-surface-variant"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full border-2 border-on-surface bg-surface px-3 py-2 font-data-mono text-data-mono text-on-surface focus:outline-none focus:ring-0"
            />
          </div>

          {error && (
            <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full bg-on-surface text-surface-container-lowest font-label-sm text-label-sm uppercase py-3 border-2 border-on-surface hover:bg-surface hover:text-on-surface transition-colors disabled:opacity-50"
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
