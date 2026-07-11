"use client";

import { useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { useRouter } from "next/navigation";
import type { TicketPriority } from "@/lib/types";

function NewTicketInner() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [solutionOpt1, setSolutionOpt1] = useState("");
  const [solutionOpt2, setSolutionOpt2] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Title and Description are required.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.post("/tickets", {
        title: title.trim(),
        description: description.trim(),
        priority: "Normal", // Default priority so DB constraints don't fail if any
        solution_option1: solutionOpt1,
        solution_option2: solutionOpt2,
      });
      router.push("/help-ticket");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create ticket.");
      setLoading(false);
    }
  }

  return (
    <>
      <MobileHeader />
      <SideNav active="help-ticket" />

      <div className="md:ml-64 flex-1 flex flex-col min-h-screen bg-background">
        <header className="hidden md:flex bg-surface w-full border-b-2 border-on-surface justify-between items-center h-16 px-container-padding sticky top-0 z-30">
          <div className="font-headline-md text-headline-md text-on-surface uppercase border-b-2 border-on-surface pb-1">
            Create Help Ticket
          </div>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-on-surface-variant font-label-sm text-label-sm uppercase hover:text-on-surface transition-colors"
          >
            Cancel
          </button>
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-lg max-w-3xl">
          <div className="border-b-2 border-on-surface pb-stack-md flex justify-between items-end md:hidden">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface uppercase tracking-tighter">
              New Ticket
            </h2>
          </div>

          {error && (
            <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="font-label-md text-label-md uppercase text-on-surface">Ticket Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border-2 border-on-surface bg-surface p-3 font-body-lg text-body-lg text-on-surface focus:outline-none focus:border-primary transition-colors"
                placeholder="E.g., Printer not working"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-label-md text-label-md uppercase text-on-surface">Problem Description *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                className="border-2 border-on-surface bg-surface p-3 font-body-lg text-body-lg text-on-surface focus:outline-none focus:border-primary transition-colors resize-y"
                placeholder="Describe the issue in detail..."
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="font-label-md text-label-md uppercase text-on-surface">Solution Suggestion 1</label>
                <input
                  type="text"
                  value={solutionOpt1}
                  onChange={(e) => setSolutionOpt1(e.target.value)}
                  className="border-2 border-on-surface bg-surface p-3 font-body-lg text-body-lg text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="Optional suggestion..."
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-label-md text-label-md uppercase text-on-surface">Solution Suggestion 2</label>
                <input
                  type="text"
                  value={solutionOpt2}
                  onChange={(e) => setSolutionOpt2(e.target.value)}
                  className="border-2 border-on-surface bg-surface p-3 font-body-lg text-body-lg text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="Optional suggestion..."
                />
              </div>
            </div>

            <div className="pt-4 border-t-2 border-on-surface">
              <button
                type="submit"
                disabled={loading}
                className="w-full md:w-auto px-8 py-3 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-md text-label-md uppercase hover:bg-primary hover:border-primary transition-colors disabled:opacity-50"
              >
                {loading ? "Submitting..." : "Submit Ticket"}
              </button>
            </div>
          </form>
        </main>
      </div>
    </>
  );
}

export default function NewTicketPage() {
  return (
    <AuthGuard>
      <NewTicketInner />
    </AuthGuard>
  );
}
