"use client";

import { useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import { api, ApiError } from "@/lib/api";
import type { Doer, FullDashboard, UserWiseTaskStat } from "@/lib/types";

function score(stat: UserWiseTaskStat): number {
  if (stat.total === 0) return 0;
  return Math.round((stat.completed / stat.total) * 100);
}

function PerformanceInner() {
  const [dashboard, setDashboard] = useState<FullDashboard | null>(null);
  const [doers, setDoers] = useState<Doer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [dash, doerData] = await Promise.all([
          api.get<FullDashboard>("/dashboard"),
          api.get<Doer[]>("/users"),
        ]);
        setDashboard(dash);
        setDoers(doerData);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load performance data.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const departmentByDoerId = new Map(doers.map((d) => [d.id, d.department || "-"]));
  const leaderboard = [...(dashboard?.breakdowns.userWiseTasks ?? [])].sort(
    (a, b) => score(b) - score(a)
  );
  const summary = dashboard?.summary;
  const overallPct =
    summary && summary.totalTasks > 0
      ? Math.round((summary.completed / summary.totalTasks) * 100)
      : 0;

  const metrics = [
    { label: "Overall Score", value: `${overallPct}%`, color: "text-primary-container" },
    { label: "Tasks Done", value: String(summary?.completed ?? 0), color: "text-on-surface" },
    {
      label: "Late Items",
      value: String(summary?.overdue ?? 0),
      color: "text-on-surface",
      icon: "schedule",
    },
  ];

  return (
    <>
      <MobileHeader />
      <SideNav active="dashboard" />

      <main className="flex-1 md:ml-64 p-4 md:p-container-padding flex flex-col gap-6 md:gap-stack-lg max-w-[1440px] mx-auto w-full">
        {/* Page Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-on-surface pb-4">
          <div>
            <h2 className="font-headline-xl text-headline-xl text-on-surface">
              Performance Scorecard
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-2 max-w-2xl">
              Enterprise resource utilization and individual contributor metrics for
              current operational cycle.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-primary-container text-on-primary font-label-sm text-label-sm uppercase">
              Status: Active
            </span>
          </div>
        </header>

        {error && (
          <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">
            {error}
          </p>
        )}

        {/* Key Metrics Bento Grid */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-gutter">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="bg-surface-container-lowest swiss-border flex flex-col justify-between p-6 h-40"
            >
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase flex items-center gap-2">
                {m.label}
                {m.icon && (
                  <span className="material-symbols-outlined text-[16px] text-[#000000]">
                    {m.icon}
                  </span>
                )}
              </div>
              <div
                className={`font-headline-xl text-headline-xl data-mono tracking-tighter ${m.color}`}
              >
                {m.value}
              </div>
            </div>
          ))}

          {/* Red Flags = critical-priority tasks */}
          <div className="bg-surface-container-lowest swiss-border flex flex-col justify-between p-6 h-40 relative overflow-hidden group hover:bg-[#F5F5F5] transition-colors cursor-pointer">
            <div className="font-label-sm text-label-sm text-error uppercase flex items-center gap-2">
              Red Flags
              <span className="material-symbols-outlined text-[16px]" data-weight="fill">
                warning
              </span>
            </div>
            <div className="font-headline-xl text-headline-xl text-error data-mono tracking-tighter relative z-10">
              {summary?.critical ?? 0}
            </div>
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, #ba1a1a 0, #ba1a1a 2px, transparent 2px, transparent 10px)",
              }}
            />
          </div>
        </section>

        {/* Leaderboard Section */}
        <section className="mt-4">
          <div className="flex items-center justify-between border-b-2 border-on-surface pb-2 mb-4">
            <h3 className="font-headline-md text-headline-md text-on-surface uppercase">
              Contributor Leaderboard
            </h3>
          </div>

          <div className="w-full overflow-x-auto bg-surface-container-lowest swiss-border">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F5F5F5] swiss-border-b">
                  <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface-variant w-16">
                    Rank
                  </th>
                  <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface-variant">
                    Doer
                  </th>
                  <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface-variant hidden md:table-cell">
                    Department
                  </th>
                  <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface-variant text-right">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {!loading && leaderboard.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                      No task data yet.
                    </td>
                  </tr>
                )}
                {leaderboard.map((row, i) => {
                  const rank = String(i + 1).padStart(2, "0");
                  const top = i === 0;
                  const s = score(row);
                  return (
                    <tr
                      key={row.doerId}
                      className="swiss-divider last:border-b-0 hover:bg-[#F5F5F5] transition-colors group"
                    >
                      <td
                        className={`py-4 px-4 font-headline-md text-headline-md data-mono ${
                          top ? "font-black" : "font-bold text-on-surface-variant"
                        }`}
                      >
                        {rank}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 flex items-center justify-center font-headline-md text-headline-md uppercase ${
                              top
                                ? "bg-[#000000] text-white"
                                : "bg-surface-variant text-on-surface"
                            }`}
                          >
                            {row.doerName.charAt(0)}
                          </div>
                          <div className="font-headline-md text-headline-md text-base">
                            {row.doerName}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 hidden md:table-cell font-label-sm text-label-sm text-on-surface-variant">
                        {departmentByDoerId.get(row.doerId) ?? "-"}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {top ? (
                          <span className="font-headline-md text-headline-md font-bold data-mono bg-primary-container text-on-primary px-2 py-1">
                            {s}%
                          </span>
                        ) : (
                          <span className="font-headline-md text-headline-md font-bold data-mono">
                            {s}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}

export default function PerformancePage() {
  return (
    <AuthGuard>
      <PerformanceInner />
    </AuthGuard>
  );
}
