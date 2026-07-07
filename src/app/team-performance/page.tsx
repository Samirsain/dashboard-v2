"use client";

import { useEffect, useState, useMemo } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import InitialsAvatar from "@/components/InitialsAvatar";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Task, Doer } from "@/lib/types";

// Helper to calculate delay in days
function getDelayDays(dueDateStr: string, completedDateStr?: string): number {
  const due = new Date(dueDateStr);
  const compare = completedDateStr ? new Date(completedDateStr) : new Date();
  due.setUTCHours(0,0,0,0);
  compare.setUTCHours(0,0,0,0);
  const diffTime = compare.getTime() - due.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

function getTodayIso() {
  const today = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
  return formatter.format(today);
}

function TeamPerformanceInner() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [doers, setDoers] = useState<Doer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Minimal filters
  const [filterDate, setFilterDate] = useState<"All" | "Today" | "ThisWeek" | "ThisMonth">("ThisMonth");
  
  // Selected Doer Profile
  const [selectedDoerId, setSelectedDoerId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [taskData, doerData] = await Promise.all([
          api.get<Task[]>("/tasks"),
          api.get<Doer[]>("/users"),
        ]);
        setTasks(taskData);
        setDoers(doerData.filter(d => d.role === "Doer" || d.role === "PC"));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load data.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Filter Tasks
  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filterDate !== "All") {
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();

      result = result.filter(t => {
        const d = new Date(t.dueDate);
        if (isNaN(d.getTime())) return true;

        if (filterDate === "Today") {
          return t.dueDate === getTodayIso();
        }
        if (filterDate === "ThisWeek") {
          const firstDay = new Date(today.setDate(today.getDate() - today.getDay()));
          const lastDay = new Date(today.setDate(today.getDate() - today.getDay() + 6));
          return d >= firstDay && d <= lastDay;
        }
        if (filterDate === "ThisMonth") {
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        }
        return true;
      });
    }
    return result;
  }, [tasks, filterDate]);

  const todayIso = getTodayIso();

  interface DoerStat {
    doer: Doer;
    total: number;
    completed: number;
    overdue: number;
    completedOnTime: number;
    completedLate: number;
    tasks: Task[];
  }

  // Compute Stats & Scores
  const doerStats = useMemo(() => {
    const map = new Map<string, DoerStat>();
    doers.forEach(d => {
      map.set(d.id, {
        doer: d,
        total: 0,
        completed: 0,
        overdue: 0,
        completedOnTime: 0,
        completedLate: 0,
        tasks: [],
      });
    });

    filteredTasks.forEach(t => {
      const stats = map.get(t.assignedDoerId);
      if (!stats) return;

      stats.total++;
      stats.tasks.push(t);

      const isCompleted = t.status === "Completed";
      const isCancelled = t.status === "Cancelled";
      const isOverdue = !isCompleted && !isCancelled && t.dueDate < todayIso;

      if (isCompleted) {
        stats.completed++;
        const completedDate = t.updatedAt ? t.updatedAt.slice(0, 10) : todayIso;
        if (completedDate > t.dueDate) {
          stats.completedLate++;
        } else {
          stats.completedOnTime++;
        }
      } else if (!isCancelled) {
        if (isOverdue) {
          stats.overdue++;
        }
      }
    });

    return Array.from(map.values()).map(s => {
      // Clean, simple performance score
      let score = 100 - (s.overdue * 2) - (s.completedLate * 1) + (s.completedOnTime * 1);
      score = Math.max(0, Math.min(100, score));

      return {
        ...s,
        score
      };
    }).sort((a, b) => b.score - a.score);
  }, [doers, filteredTasks, todayIso]);

  // Overall statistics
  const overall = useMemo(() => {
    const o = { total: 0, completed: 0, overdue: 0, totalScore: 0 };
    doerStats.forEach(s => {
      o.total += s.total;
      o.completed += s.completed;
      o.overdue += s.overdue;
      o.totalScore += s.score;
    });
    const avgScore = doerStats.length > 0 ? Math.round(o.totalScore / doerStats.length) : 100;
    return { ...o, avgScore };
  }, [doerStats]);

  // Badge Color Helper
  function getScoreBadge(score: number) {
    if (score >= 90) return { label: "Excellent", color: "bg-green-600 text-white" };
    if (score >= 75) return { label: "Good", color: "bg-green-400 text-black" };
    if (score >= 60) return { label: "Average", color: "bg-yellow-400 text-black" };
    if (score >= 40) return { label: "Needs Improvement", color: "bg-orange-500 text-white" };
    return { label: "Poor", color: "bg-red-600 text-white" };
  }

  // Export to CSV
  function exportCSV() {
    const headers = ["Rank", "Doer Name", "Assigned Tasks", "Completed Tasks", "Overdue Tasks", "Performance Score"];
    const rows = doerStats.map((s, i) => [
      i + 1,
      s.doer.name,
      s.total,
      s.completed,
      s.overdue,
      s.score
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `scoreboard-${getTodayIso()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const selectedProfile = selectedDoerId ? doerStats.find(s => s.doer.id === selectedDoerId) : null;

  return (
    <>
      <MobileHeader />
      <SideNav active="team-performance" />

      <div className="md:ml-64 flex-1 flex flex-col bg-background min-h-screen">
        {/* Top Header */}
        <header className="hidden md:flex bg-surface w-full border-b-2 border-on-surface justify-between items-center h-16 px-container-padding sticky top-0 z-30">
          <div className="font-headline-md text-headline-md text-on-surface uppercase border-b-2 border-on-surface pb-1">
            📊 Team Performance
          </div>
          <div className="flex items-center gap-stack-md">
            <button onClick={exportCSV} className="px-4 py-1 border-2 border-on-surface bg-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors cursor-pointer">
              Export CSV
            </button>
            <button onClick={() => window.print()} className="px-4 py-1 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors cursor-pointer">
              Export PDF
            </button>
          </div>
        </header>

        {/* Content Container */}
        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-lg max-w-full overflow-hidden">
          
          {/* Filters & Timeframe */}
          <div className="bg-surface border-2 border-on-surface p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Timeframe:</span>
              <div className="flex gap-2">
                {(["All", "Today", "ThisWeek", "ThisMonth"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setFilterDate(t)}
                    className={`px-3 py-1 border text-xs font-label-sm uppercase transition-colors cursor-pointer ${
                      filterDate === t
                        ? "bg-on-surface text-surface border-on-surface"
                        : "border-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {t === "ThisWeek" ? "This Week" : t === "ThisMonth" ? "This Month" : t === "All" ? "All Time" : t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Simple Cards Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-stack-md">
            {[
              { label: "Total Tasks", val: overall.total },
              { label: "Completed", val: overall.completed, color: "text-primary" },
              { label: "Overdue", val: overall.overdue, color: "text-error" },
              { label: "Average Score", val: `${overall.avgScore}/100` }
            ].map(k => (
              <div key={k.label} className="bg-surface border-2 border-on-surface p-4 flex flex-col justify-between hover:bg-surface-container transition-colors">
                <span className="font-label-sm text-[11px] text-on-surface-variant uppercase border-b border-on-surface pb-1 mb-2">
                  {k.label}
                </span>
                <div className={`font-data-mono text-2xl font-bold ${k.color || 'text-on-surface'}`}>
                  {k.val}
                </div>
              </div>
            ))}
          </div>

          {/* Doer Scoreboard Table */}
          <div className="bg-surface-container-lowest border-2 border-on-surface overflow-x-auto max-w-full">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container text-on-surface font-label-sm text-xs uppercase border-b-2 border-on-surface">
                <tr>
                  <th className="py-2.5 px-3 border-r border-surface-variant w-16 text-center">Rank</th>
                  <th className="py-2.5 px-3 border-r border-surface-variant">Name</th>
                  <th className="py-2.5 px-3 border-r border-surface-variant text-center">Assigned</th>
                  <th className="py-2.5 px-3 border-r border-surface-variant text-center">Completed</th>
                  <th className="py-2.5 px-3 border-r border-surface-variant text-center">Overdue</th>
                  <th className="py-2.5 px-3 text-center">Score</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-sm">
                {loading && (
                  <tr><td colSpan={6} className="py-6 text-center font-data-mono">Loading data...</td></tr>
                )}
                {!loading && doerStats.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center font-data-mono">No doers found.</td></tr>
                )}
                {doerStats.map((s, i) => {
                  const badge = getScoreBadge(s.score);
                  return (
                    <tr
                      key={s.doer.id}
                      className="border-b border-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer"
                      onClick={() => setSelectedDoerId(s.doer.id)}
                    >
                      <td className="py-2.5 px-3 border-r border-surface-variant text-center font-bold font-data-mono">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                      </td>
                      <td className="py-2.5 px-3 border-r border-surface-variant font-bold hover:underline">
                        {s.doer.name}
                      </td>
                      <td className="py-2.5 px-3 border-r border-surface-variant text-center font-data-mono">{s.total}</td>
                      <td className="py-2.5 px-3 border-r border-surface-variant text-center font-data-mono text-primary">{s.completed}</td>
                      <td className="py-2.5 px-3 border-r border-surface-variant text-center font-data-mono text-error font-bold">{s.overdue}</td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-data-mono font-bold px-1.5 py-0.5 border border-on-surface">
                            {s.score}
                          </span>
                          <span className={`text-[9px] uppercase px-1.5 py-0.5 ${badge.color}`}>
                            {badge.label}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </main>
      </div>

      {/* Simplified Profile Modal */}
      {selectedProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 print:hidden">
          <div className="w-full max-w-xl bg-surface-container-lowest border-2 border-on-surface flex flex-col">
            <div className="flex items-center justify-between border-b-2 border-on-surface p-3 bg-surface">
              <div className="flex items-center gap-3">
                <InitialsAvatar name={selectedProfile.doer.name} className="w-10 h-10 text-sm" />
                <div>
                  <h3 className="font-headline-md uppercase text-sm">{selectedProfile.doer.name}</h3>
                  <p className="text-[10px] text-on-surface-variant uppercase">{selectedProfile.doer.department}</p>
                </div>
              </div>
              <button onClick={() => setSelectedDoerId(null)} className="font-label-sm text-xs uppercase hover:underline cursor-pointer">Close</button>
            </div>
            
            <div className="p-4 flex flex-col gap-4">
              {/* Profile KPI Cards */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="border border-on-surface p-2 bg-surface">
                  <div className="text-[9px] uppercase text-on-surface-variant mb-1">Score</div>
                  <div className={`font-data-mono text-lg font-bold ${getScoreBadge(selectedProfile.score).color} py-0.5`}>
                    {selectedProfile.score}
                  </div>
                </div>
                <div className="border border-on-surface p-2 bg-surface">
                  <div className="text-[9px] uppercase text-on-surface-variant mb-1">Assigned</div>
                  <div className="font-data-mono text-lg font-bold">{selectedProfile.total}</div>
                </div>
                <div className="border border-on-surface p-2 bg-surface">
                  <div className="text-[9px] uppercase text-on-surface-variant mb-1">Completed</div>
                  <div className="font-data-mono text-lg font-bold text-primary">{selectedProfile.completed}</div>
                </div>
                <div className="border border-on-surface p-2 bg-surface">
                  <div className="text-[9px] uppercase text-on-surface-variant mb-1">Overdue</div>
                  <div className="font-data-mono text-lg font-bold text-error">{selectedProfile.overdue}</div>
                </div>
              </div>

              {/* Tasks List */}
              <div className="border border-on-surface bg-surface">
                <h4 className="font-label-sm text-[10px] uppercase border-b border-on-surface p-2 bg-surface-container-low">Recent Tasks</h4>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-container font-label-sm uppercase border-b border-on-surface">
                      <tr>
                        <th className="p-2">Task</th>
                        <th className="p-2 w-24">Due</th>
                        <th className="p-2 w-20 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProfile.tasks.slice(0, 5).map(t => (
                        <tr key={t.id} className="border-b border-surface-variant hover:bg-surface-container-low transition-colors">
                          <td className="p-2 truncate max-w-[180px]">{t.title}</td>
                          <td className="p-2 font-data-mono">{t.dueDate}</td>
                          <td className={`p-2 text-right ${t.status === 'Completed' ? 'text-primary' : (t.status !== 'Cancelled' && t.dueDate < todayIso) ? 'text-error font-bold' : ''}`}>
                            {t.status}
                          </td>
                        </tr>
                      ))}
                      {selectedProfile.tasks.length === 0 && (
                        <tr><td colSpan={3} className="p-4 text-center">No tasks found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function TeamPerformancePage() {
  const { user } = useAuth();

  if (user && user.role !== "Admin") {
    return (
      <AuthGuard>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="font-data-mono text-data-mono text-error uppercase border-2 border-error p-4">
            Access Denied. Admins Only.
          </p>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <TeamPerformanceInner />
    </AuthGuard>
  );
}
