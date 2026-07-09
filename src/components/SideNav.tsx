"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import BrandLogo from "@/components/BrandLogo";
import type { List } from "@/lib/types";

type NavKey =
  | "dashboard"
  | "checklist"
  | "task-list"
  | "all-tasks"
  | "workflow"
  | "team-performance"
  | "settings";

/** "SAHIL SIR TASKLIST" -> "SAHIL TL"; a named list's short sidebar label. */
function shortListLabel(name: string, type: "task" | "checklist"): string {
  const first = name.trim().split(/\s+/)[0]?.toUpperCase() || "LIST";
  return `${first} ${type === "task" ? "TL" : "CL"}`;
}

const linkBase =
  "text-on-surface-variant px-4 py-3 flex items-center gap-3 hover:bg-surface-container hover:text-on-surface transition-colors border-l-4 border-transparent";
const linkActive =
  "bg-secondary-container text-on-secondary-container border-l-4 border-primary px-4 py-3 flex items-center gap-3";
const labelCls = "font-headline-md text-headline-md text-base uppercase tracking-tight";

type OpenState = { "task-list": boolean; checklist: boolean };

// A collapsible parent (Task List / Checklist): clicking toggles the sheets
// dropdown — the "office" (no-list) view plus every named list, shown as
// OFFICE TL / SAHIL TL etc.
function CollapsibleSection({
  active,
  open,
  setOpen,
  navKey,
  icon,
  label,
  basePath,
  officeLabel,
  sectionLists,
  type,
}: {
  active: NavKey;
  open: OpenState;
  setOpen: (updater: (p: OpenState) => OpenState) => void;
  navKey: "task-list" | "checklist";
  icon: string;
  label: string;
  basePath: string;
  officeLabel: string;
  sectionLists: List[];
  type: "task" | "checklist";
}) {
  const expanded = open[navKey];
  return (
    <div>
      <button
        onClick={() => setOpen((p) => ({ ...p, [navKey]: !p[navKey] }))}
        className={`w-full ${active === navKey ? linkActive : linkBase} justify-between`}
      >
        <span className="flex items-center gap-3">
          <span className="material-symbols-outlined" data-icon={icon}>
            {icon}
          </span>
          <span className={labelCls}>{label}</span>
        </span>
        <span className="material-symbols-outlined text-lg">
          {expanded ? "expand_more" : "chevron_right"}
        </span>
      </button>

      {expanded && (
        <>
          {/* Office / normal view (no named list) */}
          <Link href={basePath} className={`${linkBase} pl-12 pr-4`}>
            <span className={`${labelCls} truncate`}>{officeLabel}</span>
          </Link>
          {/* Named lists (e.g. Sahil) */}
          {sectionLists.map((l) => (
            <Link key={l.id} href={`${basePath}?list=${l.id}`} className={`${linkBase} pl-12 pr-4`}>
              <span className={`${labelCls} truncate`}>{shortListLabel(l.name, type)}</span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}

export default function SideNav({ active }: { active: NavKey }) {
  const { user, logout } = useAuth();
  const [lists, setLists] = useState<List[]>([]);
  // Which collapsible section is expanded. Open the one matching the current
  // page by default so the active list is visible on load.
  const [open, setOpen] = useState<{ "task-list": boolean; checklist: boolean }>({
    "task-list": active === "task-list",
    checklist: active === "checklist",
  });

  useEffect(() => {
    api.get<List[]>("/lists").then(setLists).catch(() => setLists([]));
  }, []);

  const taskLists = lists.filter((l) => l.type === "task");
  const checklists = lists.filter((l) => l.type === "checklist");

  return (
    <nav className="hidden md:flex fixed left-0 top-0 h-full flex-col z-40 w-64 border-r-2 border-on-surface bg-surface">
      {/* Brand Area */}
      <div className="p-6 border-b-2 border-on-surface">
        <Link href="/" className="flex items-center gap-3 text-on-surface">
          <BrandLogo className="h-9 w-auto shrink-0" />
        </Link>
      </div>

      {/* Navigation Tabs */}
      <div className="flex-1 py-4 flex flex-col gap-1 overflow-y-auto">
        {/* Dashboard */}
        <Link href="/" className={active === "dashboard" ? linkActive : linkBase}>
          <span className="material-symbols-outlined" data-icon="dashboard">
            dashboard
          </span>
          <span className={labelCls}>Dashboard</span>
        </Link>

        {/* Task List (dropdown): OFFICE TL + named task lists */}
        <CollapsibleSection
          active={active}
          open={open}
          setOpen={setOpen}
          navKey="task-list"
          icon="assignment"
          label="Task List"
          basePath="/task-list"
          officeLabel="OFFICE TL"
          sectionLists={taskLists}
          type="task"
        />

        {/* Checklist (dropdown): OFFICE CL + named checklists */}
        <CollapsibleSection
          active={active}
          open={open}
          setOpen={setOpen}
          navKey="checklist"
          icon="checklist"
          label="Checklist"
          basePath="/checklist"
          officeLabel="OFFICE CL"
          sectionLists={checklists}
          type="checklist"
        />

        {/* Workflow */}
        <Link href="/workflow" className={active === "workflow" ? linkActive : linkBase}>
          <span className="material-symbols-outlined" data-icon="account_tree">
            account_tree
          </span>
          <span className={labelCls}>Workflow</span>
        </Link>

        {/* Admin-only */}
        {user?.role === "Admin" && (
          <>
            <Link href="/all-tasks" className={active === "all-tasks" ? linkActive : linkBase}>
              <span className="material-symbols-outlined" data-icon="fact_check">
                fact_check
              </span>
              <span className={labelCls}>All Tasks</span>
            </Link>
            <Link
              href="/team-performance"
              className={active === "team-performance" ? linkActive : linkBase}
            >
              <span className="material-symbols-outlined" data-icon="insights">
                insights
              </span>
              <span className={labelCls}>Team Performance</span>
            </Link>
          </>
        )}
      </div>

      {/* Signed-in user + logout */}
      {user && (
        <div className="px-4 py-3 border-t-2 border-on-surface flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-label-sm text-label-sm uppercase text-on-surface truncate">
              {user.name}
            </p>
            <p className="font-data-mono text-data-mono text-on-surface-variant text-[11px]">
              {user.employeeCode || user.role}
            </p>
          </div>
          <button
            onClick={logout}
            className="font-label-sm text-label-sm uppercase border-2 border-on-surface px-2 py-1 hover:bg-on-surface hover:text-on-primary transition-colors shrink-0"
          >
            Logout
          </button>
        </div>
      )}

      {/* Footer Tabs */}
      <div className="border-t-2 border-on-surface py-2">
        {user?.role === "Admin" && (
          <Link
            href="/settings"
            className={
              active === "settings"
                ? "bg-secondary-container text-on-secondary-container px-4 py-3 flex items-center gap-3 border-l-4 border-primary"
                : "text-on-surface-variant px-4 py-3 flex items-center gap-3 hover:bg-surface-container transition-colors border-l-4 border-transparent"
            }
          >
            <span className="material-symbols-outlined" data-icon="settings">
              settings
            </span>
            <span className="font-label-sm text-label-sm">Settings</span>
          </Link>
        )}
        <a
          className="text-on-surface-variant px-4 py-3 flex items-center gap-3 hover:bg-surface-container transition-colors"
          href="#"
        >
          <span className="material-symbols-outlined" data-icon="help">
            help
          </span>
          <span className="font-label-sm text-label-sm">Support</span>
        </a>
      </div>
    </nav>
  );
}
