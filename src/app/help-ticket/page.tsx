"use client";

import { useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Ticket, TicketDashboardStats } from "@/lib/types";
import Link from "next/link";

function StatusBadge({ status }: { status: Ticket["status"] }) {
  const colors = {
    Pending: "bg-yellow-400 text-black",
    "Waiting for Employee": "bg-primary text-on-primary",
    Reopened: "bg-error text-on-error",
    Completed: "bg-green-600 text-white",
  };
  return (
    <span className={`inline-block font-label-sm text-label-sm uppercase px-2 py-0.5 border-2 border-on-surface ${colors[status] || "bg-surface-variant text-on-surface-variant"}`}>
      {status}
    </span>
  );
}

function HelpTicketInner() {
  const { user } = useAuth();
  const isAdmin = user?.role === "MD" || user?.role === "PC";
  
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter for history (completed) vs active tickets
  const [viewMode, setViewMode] = useState<"active" | "history">("active");

  useEffect(() => {
    let cancelled = false;

    async function load(opts?: { silent?: boolean }) {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const t = await api.get<Ticket[]>("/tickets");
        if (cancelled) return;
        setTickets(t);
        if (isAdmin) {
          const s = await api.get<TicketDashboardStats>("/tickets/stats");
          if (!cancelled) setStats(s);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load tickets.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    // New tickets, replies, and status changes come from other people — poll
    // rather than making everyone hit refresh to see them.
    const timer = setInterval(() => load({ silent: true }), 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isAdmin]);

  const filteredTickets = tickets.filter(t => 
    viewMode === "active" ? t.status !== "Completed" : t.status === "Completed"
  );

  return (
    <>
      <MobileHeader />
      {/* We pass a generic active state since help-ticket isn't strictly defined yet */}
      <SideNav active="help-ticket" />

      <div className="md:ml-64 flex-1 flex flex-col min-h-screen bg-background">
        <header className="flex flex-col gap-2 bg-surface w-full border-b border-on-surface p-3 z-30 md:flex-row md:items-center md:justify-between md:gap-4 md:h-16 md:py-0 md:px-container-padding md:sticky md:top-0">
          <div className="font-headline-md text-headline-md text-on-surface uppercase border-b-2 border-on-surface pb-1">
            Help Ticket System
          </div>
          <Link
            href="/help-ticket/new"
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-on-surface text-surface border-on-surface hover:opacity-90 transition-colors cursor-pointer"
          >
            + Create Ticket
          </Link>
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-lg">
          <div className="border-b-2 border-on-surface pb-stack-md flex justify-between items-end md:hidden">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface uppercase tracking-tighter">
              Help Tickets
            </h2>
            <Link
              href="/help-ticket/new"
              className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase"
            >
              + Ticket
            </Link>
          </div>

          {error && (
            <p className="font-label-sm text-sm text-error border border-error px-3 py-2">
              {error}
            </p>
          )}

          {isAdmin && stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-surface border-2 border-on-surface p-4">
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Total</p>
                <p className="font-headline-lg text-headline-lg mt-1">{stats.total}</p>
              </div>
              <div className="bg-yellow-400/20 border-2 border-yellow-400 p-4">
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Pending</p>
                <p className="font-headline-lg text-headline-lg mt-1">{stats.pending}</p>
              </div>
              <div className="bg-primary/20 border-2 border-primary p-4">
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Waiting</p>
                <p className="font-headline-lg text-headline-lg mt-1">{stats.waiting}</p>
              </div>
              <div className="bg-error/20 border-2 border-error p-4">
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Reopened</p>
                <p className="font-headline-lg text-headline-lg mt-1">{stats.reopened}</p>
              </div>
              <div className="bg-green-600/20 border-2 border-green-600 p-4">
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase">Completed Today</p>
                <p className="font-headline-lg text-headline-lg mt-1">{stats.completedToday}</p>
              </div>
            </div>
          )}

          <div className="flex gap-4 border-b-2 border-on-surface">
            <button
              onClick={() => setViewMode("active")}
              className={`pb-2 px-2 font-label-md text-label-md uppercase border-b-4 transition-colors ${
                viewMode === "active" ? "border-primary text-primary" : "border-transparent text-on-surface-variant"
              }`}
            >
              Active Tickets
            </button>
            <button
              onClick={() => setViewMode("history")}
              className={`pb-2 px-2 font-label-md text-label-md uppercase border-b-4 transition-colors ${
                viewMode === "history" ? "border-primary text-primary" : "border-transparent text-on-surface-variant"
              }`}
            >
              History
            </button>
          </div>

          <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                <tr>
                  <th className="py-3 px-4 border-r border-surface-variant w-32">Ticket ID</th>
                  <th className="py-3 px-4 border-r border-surface-variant">Title</th>
                  {isAdmin && <th className="py-3 px-4 border-r border-surface-variant w-40">Employee</th>}
                  <th className="py-3 px-4 border-r border-surface-variant w-40">Created</th>
                  <th className="py-3 px-4 border-r border-surface-variant w-40 text-center">Status</th>
                  <th className="py-3 px-4 w-32 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {loading && (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      Loading...
                    </td>
                  </tr>
                )}
                {!loading && filteredTickets.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      No {viewMode} tickets found.
                    </td>
                  </tr>
                )}
                {filteredTickets.map((t) => (
                  <tr key={t.id} className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors">
                    <td className="py-3 px-4 border-r border-surface-variant font-data-mono text-data-mono">
                      {t.id}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant font-medium">
                      {t.title}
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4 border-r border-surface-variant text-on-surface-variant">
                        {t.employee_name}
                      </td>
                    )}
                    <td className="py-3 px-4 border-r border-surface-variant font-data-mono text-data-mono text-[12px]">
                      {t.created_at ? new Date(t.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : "—"}
                    </td>
                    <td className="py-3 px-4 border-r border-surface-variant text-center">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Link
                        href={`/help-ticket/${t.id}`}
                        className="px-3 py-1.5 border-2 border-on-surface text-on-surface font-label-sm text-label-sm uppercase hover:bg-on-surface hover:text-surface transition-colors"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </>
  );
}

export default function HelpTicketPage() {
  return (
    <AuthGuard>
      <HelpTicketInner />
    </AuthGuard>
  );
}
