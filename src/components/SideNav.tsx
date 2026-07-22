"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { canAccessAllTasks } from "@/lib/access";
import BrandLogo from "@/components/BrandLogo";
import GoogleFormsIcon from "@/components/GoogleFormsIcon";

type NavKey =
  | "dashboard"
  | "checklist"
  | "task-list"
  | "all-tasks"
  | "workflow"
  | "master-sheet"
  | "forms"
  | "attendance"
  | "team-performance"
  | "settings"
  | "help-ticket"
  | "ims";

const linkBase =
  "text-on-surface-variant px-4 py-3 flex items-center gap-3 hover:bg-surface-container hover:text-on-surface transition-colors border-l-4 border-transparent";
const linkActive =
  "bg-secondary-container text-on-secondary-container border-l-4 border-primary px-4 py-3 flex items-center gap-3";
const labelCls = "font-headline-md text-headline-md text-base uppercase tracking-tight";

export default function SideNav({ active }: { active: NavKey }) {
  const { user } = useAuth();

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

        {/* Workflow */}
        <Link href="/workflow" className={active === "workflow" ? linkActive : linkBase}>
          <span className="material-symbols-outlined" data-icon="account_tree">
            account_tree
          </span>
          <span className={labelCls}>Workflow</span>
        </Link>

        {/* Master Sheet */}
        <Link href="/master-sheet" className={active === "master-sheet" ? linkActive : linkBase}>
          <span className="material-symbols-outlined" data-icon="table_chart">
            table_chart
          </span>
          <span className={labelCls}>Master Sheet</span>
        </Link>

        {/* Form Responses */}
        <Link href="/forms" className={active === "forms" ? linkActive : linkBase}>
          <GoogleFormsIcon className="w-6 h-6 shrink-0" />
          <span className={labelCls}>Google Forms</span>
        </Link>

        {/* Attendance */}
        <Link href="/attendance" className={active === "attendance" ? linkActive : linkBase}>
          <span className="material-symbols-outlined" data-icon="badge">
            badge
          </span>
          <span className={labelCls}>Attendance</span>
        </Link>

        {/* All Tasks: Admin, plus hardcoded full-task-access codes. */}
        {canAccessAllTasks(user) && (
          <Link href="/all-tasks" className={active === "all-tasks" ? linkActive : linkBase}>
            <span className="material-symbols-outlined" data-icon="fact_check">
              fact_check
            </span>
            <span className={labelCls}>All Tasks</span>
          </Link>
        )}

        {/* Admin-only */}
        {user?.role === "Admin" && (
          <>
            <Link
              href="/team-performance"
              className={active === "team-performance" ? linkActive : linkBase}
            >
              <span className="material-symbols-outlined" data-icon="insights">
                insights
              </span>
              <span className={labelCls}>Team Performance</span>
            </Link>
            <Link href="/ims" className={active === "ims" ? linkActive : linkBase}>
              <span className="material-symbols-outlined" data-icon="inventory_2">
                inventory_2
              </span>
              <span className={labelCls}>IMS</span>
            </Link>
          </>
        )}
      </div>

      {/* Signed-in user */}
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
        </div>
      )}
    </nav>
  );
}
