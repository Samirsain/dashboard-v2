"use client";

import { useEffect, useState, useMemo } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import InitialsAvatar from "@/components/InitialsAvatar";
import { api, ApiError } from "@/lib/api";
import { formatDMY } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import type { Task, Doer, ChecklistInstance, ChecklistTemplate, List } from "@/lib/types";

function getTodayIso() {
  const formatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
  return formatter.format(new Date());
}

/** First word of a list's name, uppercased — how the sidebar groups OFFICE/SAHIL TL+CL together. */
function listGroupKey(name: string): string {
  return name.trim().split(/\s+/)[0]?.toUpperCase() || "LIST";
}

const OFFICE = "OFFICE";
const ALL = "ALL";

function TeamPerformanceInner() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [checklistInstances, setChecklistInstances] = useState<ChecklistInstance[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [doers, setDoers] = useState<Doer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  // Which list "group" to score: ALL, OFFICE (no named list), or a named
  // group like SAHIL — grouping Office/Sahil's Task List and Checklist
  // together the same way the sidebar does (OFFICE TL + OFFICE CL, etc).
  const [scope, setScope] = useState<string>(ALL);
  const [selectedDoerId, setSelectedDoerId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [taskData, doerData, listData, templateData, instanceData] = await Promise.all([
        api.get<Task[]>("/tasks"),
        api.get<Doer[]>("/users"),
        api.get<List[]>("/lists").catch(() => [] as List[]),
        api.get<ChecklistTemplate[]>("/checklist/templates").catch(() => [] as ChecklistTemplate[]),
        api.get<ChecklistInstance[]>("/checklist/instances").catch(() => [] as ChecklistInstance[]),
      ]);
      setTasks(taskData);
      setDoers(doerData.filter((d) => d.role === "Doer" || d.role === "Admin"));
      setLists(listData);
      setTemplates(templateData);
      setChecklistInstances(instanceData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadData();
    });
  }, []);

  async function handleResetScoring() {
    const confirmed = confirm(
      "⚠️ This will PERMANENTLY DELETE every COMPLETED task and every COMPLETED checklist item — for every employee, all history. Pending/open items are kept, and scoring will restart fresh from them. This cannot be undone.\n\nAre you absolutely sure you want to reset Team Performance?"
    );
    if (!confirmed) return;
    const typed = prompt('This is irreversible. Type "RESET SCORING" (without quotes) to confirm.');
    if (typed !== "RESET SCORING") {
      alert("Cancelled — text didn't match. Nothing was deleted.");
      return;
    }
    setResetting(true);
    try {
      await Promise.all([
        api.delete("/tasks/completed"),
        api.delete("/checklist/instances/completed"),
      ]);
      await loadData();
      alert("Team Performance has been reset — completed history cleared, pending items kept.");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to reset Team Performance.");
    } finally {
      setResetting(false);
    }
  }

  const todayIso = getTodayIso();

  // template id -> list id, so checklist instances can be scoped by list.
  const templateListMap = useMemo(
    () => Object.fromEntries(templates.map((t) => [t.id, t.listId])),
    [templates]
  );

  // Named-list groups available in the scope dropdown, e.g. { SAHIL: [...] }.
  const scopeGroups = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; listIds: Set<string> }>();
    for (const l of lists) {
      const key = listGroupKey(l.name);
      if (!groups.has(key)) groups.set(key, { key, label: key, listIds: new Set() });
      groups.get(key)!.listIds.add(l.id);
    }
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [lists]);

  function inScope(listId: string): boolean {
    if (scope === ALL) return true;
    if (scope === OFFICE) return !listId;
    const group = scopeGroups.find((g) => g.key === scope);
    return group ? group.listIds.has(listId) : true;
  }

  function inDateWindow(dateStr: string): boolean {
    if (!rangeFrom && !rangeTo) return true;
    if (rangeFrom && dateStr < rangeFrom) return false;
    if (rangeTo && dateStr > rangeTo) return false;
    return true;
  }

  const filteredTasks = useMemo(
    () => tasks.filter((t) => inScope(t.listId) && inDateWindow(t.dueDate)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, scope, rangeFrom, rangeTo, scopeGroups]
  );

  const filteredChecklist = useMemo(
    () =>
      checklistInstances.filter(
        (c) => inScope(templateListMap[c.templateId] ?? "") && inDateWindow(c.date)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checklistInstances, templateListMap, scope, rangeFrom, rangeTo, scopeGroups]
  );

  interface DoerStat {
    doer: Doer;
    taskTotal: number;
    taskCompleted: number;
    taskOverdue: number;
    clTotal: number;
    clCompleted: number;
    clOverdue: number;
    total: number;
    completed: number;
    overdue: number;
    tasks: Task[];
    checklist: ChecklistInstance[];
  }

  // Valid, bounded 0-100 score: only items that have actually been resolved
  // (completed) or missed (overdue) count toward it — a task/checklist item
  // that's still pending and not yet due doesn't penalize or help. Late
  // completions earn half credit; on-time completions earn full credit.
  const doerStats = useMemo(() => {
    const map = new Map<string, DoerStat>();
    doers.forEach((d) => {
      map.set(d.id, {
        doer: d,
        taskTotal: 0,
        taskCompleted: 0,
        taskOverdue: 0,
        clTotal: 0,
        clCompleted: 0,
        clOverdue: 0,
        total: 0,
        completed: 0,
        overdue: 0,
        tasks: [],
        checklist: [],
      });
    });

    const earnedByDoer = new Map<string, number>();
    const resolvableByDoer = new Map<string, number>();

    filteredTasks.forEach((t) => {
      const s = map.get(t.assignedDoerId);
      if (!s) return;
      s.taskTotal++;
      s.total++;
      s.tasks.push(t);

      const isCompleted = t.status === "Completed";
      const isCancelled = t.status === "Cancelled";
      const isOverdue = !isCompleted && !isCancelled && t.dueDate < todayIso;

      if (isCompleted) {
        s.taskCompleted++;
        s.completed++;
        const completedDate = t.updatedAt ? t.updatedAt.slice(0, 10) : todayIso;
        const earned = completedDate > t.dueDate ? 0.5 : 1;
        earnedByDoer.set(t.assignedDoerId, (earnedByDoer.get(t.assignedDoerId) ?? 0) + earned);
        resolvableByDoer.set(t.assignedDoerId, (resolvableByDoer.get(t.assignedDoerId) ?? 0) + 1);
      } else if (isOverdue) {
        s.taskOverdue++;
        s.overdue++;
        resolvableByDoer.set(t.assignedDoerId, (resolvableByDoer.get(t.assignedDoerId) ?? 0) + 1);
      }
    });

    filteredChecklist.forEach((c) => {
      const s = map.get(c.assignedDoerId);
      if (!s) return;
      s.clTotal++;
      s.total++;
      s.checklist.push(c);

      const isCompleted = c.status === "Completed";
      const isOverdue = !isCompleted && c.date < todayIso;

      if (isCompleted) {
        s.clCompleted++;
        s.completed++;
        const completedDate = c.completedAt ? c.completedAt.slice(0, 10) : todayIso;
        const earned = completedDate > c.date ? 0.5 : 1;
        earnedByDoer.set(c.assignedDoerId, (earnedByDoer.get(c.assignedDoerId) ?? 0) + earned);
        resolvableByDoer.set(c.assignedDoerId, (resolvableByDoer.get(c.assignedDoerId) ?? 0) + 1);
      } else if (isOverdue) {
        s.clOverdue++;
        s.overdue++;
        resolvableByDoer.set(c.assignedDoerId, (resolvableByDoer.get(c.assignedDoerId) ?? 0) + 1);
      }
    });

    return Array.from(map.values())
      .map((s) => {
        const resolvable = resolvableByDoer.get(s.doer.id) ?? 0;
        const earned = earnedByDoer.get(s.doer.id) ?? 0;
        const score = resolvable > 0 ? Math.round((earned / resolvable) * 100) : 100;
        return { ...s, score: Math.max(0, Math.min(100, score)) };
      })
      .sort((a, b) => b.score - a.score);
  }, [doers, filteredTasks, filteredChecklist, todayIso]);

  const overall = useMemo(() => {
    const o = { total: 0, completed: 0, overdue: 0, totalScore: 0 };
    doerStats.forEach((s) => {
      o.total += s.total;
      o.completed += s.completed;
      o.overdue += s.overdue;
      o.totalScore += s.score;
    });
    const avgScore = doerStats.length > 0 ? Math.round(o.totalScore / doerStats.length) : 100;
    return { ...o, avgScore };
  }, [doerStats]);

  function getScoreBadge(score: number) {
    if (score >= 90) return { label: "Excellent", color: "bg-green-600 text-white" };
    if (score >= 75) return { label: "Good", color: "bg-green-400 text-black" };
    if (score >= 60) return { label: "Average", color: "bg-yellow-400 text-black" };
    if (score >= 40) return { label: "Needs Improvement", color: "bg-orange-500 text-white" };
    return { label: "Poor", color: "bg-red-600 text-white" };
  }

  function exportCSV() {
    const headers = [
      "Rank",
      "Doer Name",
      "Tasks Assigned",
      "Tasks Completed",
      "Tasks Overdue",
      "Checklist Assigned",
      "Checklist Completed",
      "Checklist Overdue",
      "Performance Score",
    ];
    const rows = doerStats.map((s, i) => [
      i + 1,
      s.doer.name,
      s.taskTotal,
      s.taskCompleted,
      s.taskOverdue,
      s.clTotal,
      s.clCompleted,
      s.clOverdue,
      s.score,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map((e) => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `scoreboard-${getTodayIso()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const selectedProfile = selectedDoerId ? doerStats.find((s) => s.doer.id === selectedDoerId) : null;

  const scopeOptions = [
    { key: ALL, label: "All Lists" },
    { key: OFFICE, label: "Office" },
    ...scopeGroups.filter((g) => g.key !== OFFICE).map((g) => ({ key: g.key, label: g.label })),
  ];

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
          {/* Mobile title + exports (desktop header is hidden below md) */}
          <div className="md:hidden flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface uppercase tracking-tighter">
              Team Performance
            </h2>
            <div className="flex gap-2">
              <button
                onClick={exportCSV}
                className="px-3 py-1.5 border-2 border-on-surface bg-surface font-label-sm text-label-sm uppercase"
              >
                CSV
              </button>
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase"
              >
                PDF
              </button>
            </div>
          </div>

          {error && (
            <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">{error}</p>
          )}

          {/* Filters & Timeframe */}
          <div className="bg-surface border-2 border-on-surface p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">From:</span>
              <input
                type="date"
                value={rangeFrom}
                max={rangeTo || undefined}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-data-mono text-on-surface focus:outline-none"
              />
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">To:</span>
              <input
                type="date"
                value={rangeTo}
                min={rangeFrom || undefined}
                onChange={(e) => setRangeTo(e.target.value)}
                className="border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-data-mono text-on-surface focus:outline-none"
              />
              {(rangeFrom || rangeTo) && (
                <button
                  onClick={() => {
                    setRangeFrom("");
                    setRangeTo("");
                  }}
                  className="px-3 py-1.5 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">List:</span>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="border-2 border-on-surface bg-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-on-surface focus:outline-none"
              >
                {scopeOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Danger zone — permanently wipes completed history to reset scoring. */}
          <div className="bg-error/10 border-2 border-error p-4 flex flex-wrap items-center justify-between gap-4">
            <p className="font-label-sm text-label-sm uppercase text-error">
              ⚠️ Danger Zone — permanently deletes every COMPLETED task and checklist item (pending items are kept).
            </p>
            <button
              disabled={resetting}
              onClick={handleResetScoring}
              className="px-3 py-1.5 border-2 border-error bg-error text-on-error font-label-sm text-label-sm uppercase hover:bg-error/80 transition-colors disabled:opacity-40 cursor-pointer"
            >
              {resetting ? "Resetting..." : "Reset Team Performance"}
            </button>
          </div>

          {/* Simple Cards Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-stack-md">
            {[
              { label: "Total Items (Tasks + Checklist)", val: overall.total },
              { label: "Completed", val: overall.completed, color: "text-primary" },
              { label: "Overdue", val: overall.overdue, color: "text-error" },
              { label: "Average Score", val: `${overall.avgScore}/100` },
            ].map((k) => (
              <div key={k.label} className="bg-surface border-2 border-on-surface p-4 flex flex-col justify-between hover:bg-surface-container transition-colors">
                <span className="font-label-sm text-[11px] text-on-surface-variant uppercase border-b border-on-surface pb-1 mb-2">
                  {k.label}
                </span>
                <div className={`font-data-mono text-2xl font-bold ${k.color || "text-on-surface"}`}>{k.val}</div>
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
                  <th className="py-2.5 px-3 border-r border-surface-variant text-center">Tasks</th>
                  <th className="py-2.5 px-3 border-r border-surface-variant text-center">Checklist</th>
                  <th className="py-2.5 px-3 border-r border-surface-variant text-center">Completed</th>
                  <th className="py-2.5 px-3 border-r border-surface-variant text-center">Overdue</th>
                  <th className="py-2.5 px-3 text-center">Score</th>
                </tr>
              </thead>
              <tbody className="font-body-md text-sm">
                {loading && (
                  <tr><td colSpan={7} className="py-6 text-center font-data-mono">Loading data...</td></tr>
                )}
                {!loading && doerStats.length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center font-data-mono">No doers found.</td></tr>
                )}
                {doerStats.map((s, i) => {
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
                      <td className="py-2.5 px-3 border-r border-surface-variant text-center font-data-mono">
                        {s.taskCompleted}/{s.taskTotal}
                      </td>
                      <td className="py-2.5 px-3 border-r border-surface-variant text-center font-data-mono">
                        {s.clCompleted}/{s.clTotal}
                      </td>
                      <td className="py-2.5 px-3 border-r border-surface-variant text-center font-data-mono text-primary">
                        {s.completed}
                      </td>
                      <td className="py-2.5 px-3 border-r border-surface-variant text-center font-data-mono text-error font-bold">
                        {s.overdue}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-data-mono font-bold px-1.5 py-0.5 border border-on-surface">
                          {s.score}
                        </span>
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
              <button onClick={() => setSelectedDoerId(null)} className="font-label-sm text-xs uppercase hover:underline cursor-pointer">
                Close
              </button>
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
                <h4 className="font-label-sm text-[10px] uppercase border-b border-on-surface p-2 bg-surface-container-low">
                  Recent Tasks
                </h4>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-container font-label-sm uppercase border-b border-on-surface">
                      <tr>
                        <th className="p-2">Task</th>
                        <th className="p-2 w-24">Due</th>
                        <th className="p-2 w-20 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProfile.tasks.slice(0, 5).map((t) => (
                        <tr key={t.id} className="border-b border-surface-variant hover:bg-surface-container-low transition-colors">
                          <td className="p-2 truncate max-w-[180px]">{t.title}</td>
                          <td className="p-2 font-data-mono">{formatDMY(t.dueDate)}</td>
                          <td className={`p-2 text-right ${t.status === "Completed" ? "text-primary" : (t.status !== "Cancelled" && t.dueDate < todayIso) ? "text-error font-bold" : ""}`}>
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

              {/* Checklist List */}
              <div className="border border-on-surface bg-surface">
                <h4 className="font-label-sm text-[10px] uppercase border-b border-on-surface p-2 bg-surface-container-low">
                  Recent Checklist
                </h4>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-container font-label-sm uppercase border-b border-on-surface">
                      <tr>
                        <th className="p-2">Task</th>
                        <th className="p-2 w-24">Date</th>
                        <th className="p-2 w-20 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProfile.checklist.slice(0, 5).map((c) => (
                        <tr key={c.id} className="border-b border-surface-variant hover:bg-surface-container-low transition-colors">
                          <td className="p-2 truncate max-w-[180px]">{c.taskName}</td>
                          <td className="p-2 font-data-mono">{formatDMY(c.date)}</td>
                          <td className={`p-2 text-right ${c.status === "Completed" ? "text-primary" : c.date < todayIso ? "text-error font-bold" : ""}`}>
                            {c.status}
                          </td>
                        </tr>
                      ))}
                      {selectedProfile.checklist.length === 0 && (
                        <tr><td colSpan={3} className="p-4 text-center">No checklist items found.</td></tr>
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
