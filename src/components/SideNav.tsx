"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { canAccessAllTasks, canAccessInventory, canViewTeamPerformance } from "@/lib/access";
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

const labelCls = "font-headline-md text-headline-md text-base uppercase tracking-tight truncate";

/**
 * One nav row. Collapsed, it's the icon alone, centred in the rail's fixed
 * width; expanded, the label appears beside it. Every page reserves the same
 * `RAIL_W` of margin regardless of expand state — expanding draws the rest of
 * the rail as an overlay on top of the page rather than pushing content over,
 * so nothing outside this component has to know or care whether it's open.
 */
function NavItem({
  href,
  active,
  icon,
  label,
  expanded,
  onNavigate,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  expanded: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      title={expanded ? undefined : label}
      onClick={onNavigate}
      className={`flex items-center gap-3 border-l-4 py-3 transition-colors ${
        expanded ? "px-4" : "justify-center px-0"
      } ${
        active
          ? "border-primary bg-secondary-container text-on-secondary-container"
          : "border-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
      }`}
    >
      <span className="shrink-0 flex items-center justify-center w-6 h-6">{icon}</span>
      {expanded && <span className={labelCls}>{label}</span>}
    </Link>
  );
}

/** Fixed rail width (px) reserved by every page's `md:ml-16` — icons only, always visible. */
export const RAIL_W = 64;

export default function SideNav({ active }: { active: NavKey }) {
  const { user } = useAuth();
  // Collapsed by default — a full name-per-row nav spends most of the screen
  // on nothing when all anyone needs most of the time is "which icon is
  // Workflow". Expanding is one click away and doesn't cost anything else on
  // the page, since it overlays rather than reflowing.
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* Clicking outside an open rail closes it — the usual drawer behaviour. */}
      {expanded && (
        <button
          aria-label="Close navigation"
          onClick={() => setExpanded(false)}
          className="hidden md:block fixed inset-0 z-30 cursor-default bg-transparent"
        />
      )}

      <nav
        className={`hidden md:flex fixed left-0 top-0 h-full flex-col z-40 border-r-2 border-on-surface bg-surface transition-[width] duration-150 ${
          expanded ? "w-64" : "w-16"
        }`}
      >
        {/* Brand + expand toggle */}
        <div className={`border-b-2 border-on-surface flex items-center ${expanded ? "justify-between p-4" : "justify-center py-4"}`}>
          {expanded ? (
            <Link href="/" className="flex items-center gap-3 text-on-surface min-w-0">
              <BrandLogo className="h-9 w-auto shrink-0" />
            </Link>
          ) : (
            <Link href="/" className="text-on-surface" title="Thirty Milestones">
              <BrandLogo className="h-8 w-auto shrink-0" />
            </Link>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Collapse menu" : "Expand menu"}
            className={`shrink-0 flex items-center justify-center w-8 h-8 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors ${
              expanded ? "" : "mt-2"
            }`}
          >
            <span className="material-symbols-outlined">{expanded ? "chevron_left" : "menu"}</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex-1 py-4 flex flex-col gap-1 overflow-y-auto overflow-x-hidden">
          <NavItem
            href="/"
            active={active === "dashboard"}
            expanded={expanded}
            onNavigate={() => setExpanded(false)}
            label="Dashboard"
            icon={
              <span className="material-symbols-outlined" data-icon="dashboard">
                dashboard
              </span>
            }
          />

          <NavItem
            href="/forms"
            active={active === "forms"}
            expanded={expanded}
            onNavigate={() => setExpanded(false)}
            label="Google Forms"
            icon={<GoogleFormsIcon className="w-6 h-6 shrink-0" />}
          />

          <NavItem
            href="/master-sheet"
            active={active === "master-sheet"}
            expanded={expanded}
            onNavigate={() => setExpanded(false)}
            label="Master Sheet"
            icon={
              <span className="material-symbols-outlined" data-icon="table_chart">
                table_chart
              </span>
            }
          />

          {/* Inventory — MD always, PC only if granted in PC Management */}
          {canAccessInventory(user) && (
            <NavItem
              href="/ims"
              active={active === "ims"}
              expanded={expanded}
              onNavigate={() => setExpanded(false)}
              label="Inventory"
              icon={
                <span className="material-symbols-outlined" data-icon="inventory_2">
                  inventory_2
                </span>
              }
            />
          )}

          <NavItem
            href="/workflow"
            active={active === "workflow"}
            expanded={expanded}
            onNavigate={() => setExpanded(false)}
            label="Workflow"
            icon={
              <span className="material-symbols-outlined" data-icon="account_tree">
                account_tree
              </span>
            }
          />

          {/* All Tasks */}
          {canAccessAllTasks(user) && (
            <NavItem
              href="/all-tasks"
              active={active === "all-tasks"}
              expanded={expanded}
              onNavigate={() => setExpanded(false)}
              label="All Tasks"
              icon={
                <span className="material-symbols-outlined" data-icon="fact_check">
                  fact_check
                </span>
              }
            />
          )}

          <NavItem
            href="/attendance"
            active={active === "attendance"}
            expanded={expanded}
            onNavigate={() => setExpanded(false)}
            label="Attendance"
            icon={
              <span className="material-symbols-outlined" data-icon="badge">
                badge
              </span>
            }
          />

          {/* Team Performance — MD only, a PC never sees the scoreboard */}
          {canViewTeamPerformance(user) && (
            <NavItem
              href="/team-performance"
              active={active === "team-performance"}
              expanded={expanded}
              onNavigate={() => setExpanded(false)}
              label="Team Performance"
              icon={
                <span className="material-symbols-outlined" data-icon="insights">
                  insights
                </span>
              }
            />
          )}
        </div>

        {/* Signed-in user */}
        {user && (
          <div
            className={`border-t-2 border-on-surface flex items-center gap-2 ${
              expanded ? "justify-between px-4 py-3" : "justify-center py-3"
            }`}
            title={expanded ? undefined : `${user.name} · ${user.employeeCode || user.role}`}
          >
            {expanded ? (
              <div className="min-w-0">
                <p className="font-label-sm text-label-sm uppercase text-on-surface truncate">
                  {user.name}
                </p>
                <p className="font-data-mono text-data-mono text-on-surface-variant text-[11px]">
                  {user.employeeCode || user.role}
                </p>
              </div>
            ) : (
              <span className="w-8 h-8 flex items-center justify-center border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface shrink-0">
                {user.name?.[0] ?? "?"}
              </span>
            )}
          </div>
        )}
      </nav>
    </>
  );
}
