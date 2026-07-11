"use client";

import { useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { Ticket } from "@/lib/types";

const PREDEFINED_SOLUTIONS: string[] = []; // Not used anymore

function StatusBadge({ status }: { status: Ticket["status"] }) {
  const colors = {
    Pending: "bg-warning text-on-warning",
    "Waiting for Employee": "bg-primary text-on-primary",
    Reopened: "bg-error text-on-error",
    Completed: "bg-success text-on-success",
  };
  return (
    <span className={`inline-block font-label-sm text-label-sm uppercase px-2 py-0.5 border-2 border-on-surface ${colors[status] || "bg-surface-variant text-on-surface-variant"}`}>
      {status}
    </span>
  );
}

function TicketDetailsInner() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Admin solution form state
  const [solutionType, setSolutionType] = useState<"opt1" | "opt2" | "custom">("custom");
  const [customSol, setCustomSol] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<Ticket>(`/tickets/${id}`);
        setTicket(data);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load ticket details.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleAdminSubmitSolution() {
    let finalSolution = customSol;
    if (solutionType === "opt1") finalSolution = ticket?.solution_option1 || "";
    if (solutionType === "opt2") finalSolution = ticket?.solution_option2 || "";
    
    if (!finalSolution.trim()) {
      alert("Please provide a solution.");
      return;
    }
    setSubmitting(true);
    try {
      const updated = await api.patch<Ticket>(`/tickets/${id}/solution`, {
        solution: finalSolution,
        solutionType: solutionType === "custom" ? "custom" : "suggestion",
      });
      setTicket(updated);
      alert("Solution submitted successfully!");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to submit solution.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEmployeeStatus(newStatus: "Completed" | "Reopened") {
    setSubmitting(true);
    try {
      const updated = await api.patch<Ticket>(`/tickets/${id}/status`, {
        status: newStatus,
      });
      setTicket(updated);
      if (newStatus === "Completed") {
        router.push("/help-ticket"); // redirect to list on complete
      }
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to update ticket.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <MobileHeader />
      <SideNav active="help-ticket" />

      <div className="md:ml-64 flex-1 flex flex-col min-h-screen bg-background">
        <header className="hidden md:flex bg-surface w-full border-b-2 border-on-surface justify-between items-center h-16 px-container-padding sticky top-0 z-30">
          <div className="font-headline-md text-headline-md text-on-surface uppercase border-b-2 border-on-surface pb-1">
            Ticket Details
          </div>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-on-surface-variant font-label-sm text-label-sm uppercase hover:text-on-surface transition-colors"
          >
            Back
          </button>
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-lg max-w-4xl">
          <div className="border-b-2 border-on-surface pb-stack-md flex justify-between items-end md:hidden">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface uppercase tracking-tighter">
              Ticket Details
            </h2>
          </div>

          {loading ? (
            <div className="font-data-mono text-data-mono text-on-surface-variant">Loading...</div>
          ) : error || !ticket ? (
            <div className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">
              {error || "Ticket not found."}
            </div>
          ) : (
            <>
              {/* Info Section */}
              <div className="border-2 border-on-surface bg-surface p-6 flex flex-col gap-6">
                <div className="flex justify-between items-start border-b-2 border-surface-variant pb-4">
                  <div>
                    <h3 className="font-headline-lg text-headline-lg text-on-surface">{ticket.title}</h3>
                    <p className="font-data-mono text-data-mono text-on-surface-variant mt-1">
                      {ticket.id} • Created {new Date(ticket.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                  <StatusBadge status={ticket.status} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-body-md text-body-md">
                  <div>
                    <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">Employee</p>
                    <p className="font-medium text-on-surface">{ticket.employee_name}</p>
                  </div>
                  {ticket.solution_option1 && (
                    <div className="col-span-2">
                      <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">Suggestion 1</p>
                      <p className="text-on-surface">{ticket.solution_option1}</p>
                    </div>
                  )}
                  {ticket.solution_option2 && (
                    <div className="col-span-2">
                      <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">Suggestion 2</p>
                      <p className="text-on-surface">{ticket.solution_option2}</p>
                    </div>
                  )}
                </div>

                <div>
                  <p className="font-label-sm text-label-sm uppercase text-on-surface-variant mb-2">Problem Description</p>
                  <div className="bg-surface-container-lowest p-4 border border-surface-variant text-on-surface whitespace-pre-wrap font-body-lg text-body-lg">
                    {ticket.description}
                  </div>
                </div>
              </div>

              {/* Solution Section */}
              {ticket.solution && (
                <div className="border-2 border-primary bg-primary/5 p-6 flex flex-col gap-4">
                  <h4 className="font-headline-md text-headline-md text-primary uppercase">Admin Solution</h4>
                  <div className="bg-surface p-4 border border-primary/20 text-on-surface whitespace-pre-wrap font-body-lg text-body-lg">
                    {ticket.solution}
                  </div>
                  
                  {/* Employee Action Buttons */}
                  {!isAdmin && ticket.status === "Waiting for Employee" && (
                    <div className="flex gap-4 mt-2">
                      <button
                        onClick={() => handleEmployeeStatus("Completed")}
                        disabled={submitting}
                        className="px-6 py-2 bg-success text-surface-container-lowest font-label-md text-label-md uppercase hover:bg-success/90 transition-colors disabled:opacity-50"
                      >
                        ✅ Mark as Done
                      </button>
                      <button
                        onClick={() => handleEmployeeStatus("Reopened")}
                        disabled={submitting}
                        className="px-6 py-2 bg-error text-surface-container-lowest font-label-md text-label-md uppercase hover:bg-error/90 transition-colors disabled:opacity-50"
                      >
                        ❌ Still Facing Issue
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Admin Input Form */}
              {isAdmin && (ticket.status === "Pending" || ticket.status === "Reopened") && (
                <div className="border-2 border-on-surface bg-surface p-6 flex flex-col gap-6">
                  <h4 className="font-headline-md text-headline-md text-on-surface uppercase">Provide Solution</h4>
                  
                  <div className="flex flex-col gap-4 border-b-2 border-surface-variant pb-4">
                    {ticket.solution_option1 && (
                      <label className="flex items-center gap-3 cursor-pointer font-body-lg text-body-lg text-on-surface">
                        <input
                          type="radio"
                          checked={solutionType === "opt1"}
                          onChange={() => setSolutionType("opt1")}
                          className="accent-primary w-5 h-5"
                        />
                        {ticket.solution_option1}
                      </label>
                    )}
                    {ticket.solution_option2 && (
                      <label className="flex items-center gap-3 cursor-pointer font-body-lg text-body-lg text-on-surface">
                        <input
                          type="radio"
                          checked={solutionType === "opt2"}
                          onChange={() => setSolutionType("opt2")}
                          className="accent-primary w-5 h-5"
                        />
                        {ticket.solution_option2}
                      </label>
                    )}
                    <label className="flex items-center gap-3 cursor-pointer font-body-lg text-body-lg text-on-surface font-bold">
                      <input
                        type="radio"
                        checked={solutionType === "custom"}
                        onChange={() => setSolutionType("custom")}
                        className="accent-primary w-5 h-5"
                      />
                      Custom Solution
                    </label>
                  </div>

                  {solutionType === "custom" && (
                    <textarea
                      value={customSol}
                      onChange={(e) => setCustomSol(e.target.value)}
                      rows={5}
                      className="border-2 border-on-surface bg-surface p-3 font-body-lg text-body-lg text-on-surface focus:outline-none focus:border-primary resize-y"
                      placeholder="Type your custom solution here..."
                    />
                  )}

                  <div>
                    <button
                      onClick={handleAdminSubmitSolution}
                      disabled={submitting}
                      className="px-8 py-3 bg-on-surface text-surface-container-lowest font-label-md text-label-md uppercase hover:bg-primary transition-colors disabled:opacity-50"
                    >
                      {submitting ? "Submitting..." : "Submit Solution"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}

export default function TicketDetailsPage() {
  return (
    <AuthGuard>
      <TicketDetailsInner />
    </AuthGuard>
  );
}
