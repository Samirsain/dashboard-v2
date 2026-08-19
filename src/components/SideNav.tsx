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
  // Two independent reasons the rail can be open: someone clicked the toggle
  // (stays open until they click it again or pick a link), or the mouse is
  // just sitting over it (open only as long as it's hovered). Either one is
  // enough — a mouse user never has to click at all, and the toggle still
  // gives keyboard/touch a way in.
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const expanded = pinned || hovered;
  // After picking a link, close fully rather than leaving it pinned open —
  // hovering will reopen it the moment the mouse is back over the rail.
  function closeNav() {
    setPinned(false);
    setHovered(false);
  }

  return (
    <>
      {/* Clicking outside an open rail closes it — the usual drawer behaviour. */}
      {expanded && (
        <button
          aria-label="Close navigation"
          onClick={() => setPinned(false)}
          className="hidden md:block fixed inset-0 z-30 cursor-default bg-transparent"
        />
      )}

      <nav
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`hidden md:flex fixed left-0 top-0 h-full flex-col z-40 border-r-2 border-on-surface bg-surface transition-[width] duration-150 ${
          expanded ? "w-64" : "w-16"
        }`}
      >
        {/*
          Brand + toggle. Collapsed, there's only room for the square "30"
          mark, not the full wordmark — so it swaps to the icon-only crop
          rather than trying to shrink the wide logo and having it bleed
          past the rail's edge. Stacked vertically when collapsed (logo, then
          the toggle below it) since there's no horizontal room for both.
        */}
        <div
          className={`border-b-2 border-on-surface flex items-center ${
            expanded ? "h-16 justify-between px-4" : "flex-col gap-1.5 py-3"
          }`}
        >
          {expanded ? (
            <Link href="/" className="flex items-center gap-3 text-on-surface min-w-0 overflow-hidden">
              <BrandLogo className="h-8 w-auto shrink-0" />
            </Link>
          ) : (
            <Link href="/" className="text-on-surface" title="Thirty Milestones">
              <BrandLogo iconOnly className="h-7 w-auto shrink-0" />
            </Link>
          )}
          <button
            onClick={() => setPinned((v) => !v)}
            title={expanded ? "Collapse menu" : "Expand menu"}
            className="shrink-0 flex items-center justify-center w-8 h-8 text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
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
            onNavigate={closeNav}
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
            onNavigate={closeNav}
            label="Google Forms"
            icon={<GoogleFormsIcon className="w-6 h-6 shrink-0" />}
          />

          <NavItem
            href="/master-sheet"
            active={active === "master-sheet"}
            expanded={expanded}
            onNavigate={closeNav}
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
              onNavigate={closeNav}
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
            onNavigate={closeNav}
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
              onNavigate={closeNav}
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
            onNavigate={closeNav}
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
              onNavigate={closeNav}
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
