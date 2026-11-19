"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import BrandLogo from "@/components/BrandLogo";
import { useAuth } from "@/lib/auth-context";
import { canAccessAllTasks, canAccessInventory, canManageDoers, canViewTeamPerformance } from "@/lib/access";
import { api } from "@/lib/api";
import type { List } from "@/lib/types";

/** "SAHIL SIR TASKLIST" -> "SAHIL TL" */
function shortListLabel(name: string, type: "task" | "checklist"): string {
  const first = name.trim().split(/\s+/)[0]?.toUpperCase() || "LIST";
  return `${first} ${type === "task" ? "TL" : "CL"}`;
}

function Icon({ name, filled = false, className = "" }: { name: string; filled?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined ${className}`}
      data-weight={filled ? "fill" : undefined}
    >
      {name}
    </span>
  );
}

/**
 * Phone chrome: a slim top bar, a fixed bottom tab bar for the four places
 * people go all day, and a drawer ("More") holding every other route. All of
 * it is `md:hidden` — desktop keeps SideNav and never renders any of this.
 */
export default function MobileHeader({ ticketAlert = false }: { ticketAlert?: boolean } = {}) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<List[]>([]);
  const [sub, setSub] = useState<{ task: boolean; checklist: boolean }>({
    task: false,
    checklist: false,
  });

  useEffect(() => {
    api.get<List[]>("/lists").then(setLists).catch(() => setLists([]));
  }, []);

  // Close the drawer whenever the route changes (after a nav tap).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);

  // Drawer open: lock the page behind it and let Escape close it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const taskLists = lists.filter((l) => l.type === "task");
  const checklists = lists.filter((l) => l.type === "checklist");

  // Fourth tab: whatever "my tasks" means for this person. Plain doers work
  // their tasks from the dashboard itself, so they get no Tasks tab.
  const tasksHref = canAccessAllTasks(user) ? "/all-tasks" : user?.role !== "Doer" ? "/task-list" : null;
  const tabs = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/attendance", label: "Attendance", icon: "badge" },
    { href: "/workflow", label: "Workflow", icon: "account_tree" },
    ...(tasksHref ? [{ href: tasksHref, label: "Tasks", icon: "fact_check" }] : []),
  ];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const moreActive = !tabs.some((t) => isActive(t.href));

  const rowBase =
    "flex items-center gap-3 min-h-[48px] px-4 font-headline-md text-[15px] uppercase tracking-tight transition-colors";
  const rowFor = (href: string) =>
    `${rowBase} ${
      isActive(href)
        ? "bg-secondary-container font-bold text-on-surface"
        : "text-on-surface-variant active:bg-surface-container"
    }`;
  const subRow = `${rowBase} pl-[52px] text-on-surface-variant active:bg-surface-container`;

  return (
    <>
      <header className="md:hidden sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b-2 border-on-surface bg-surface px-4">
        <Link href="/" aria-label="Dashboard home">
          <BrandLogo className="h-7 w-auto text-on-surface" />
        </Link>
        {/* Help Ticket lives up here on phones; the dot means a ticket is open
            (the dashboard passes it — elsewhere the icon is just a shortcut). */}
        <Link
          href="/help-ticket"
          aria-label={ticketAlert ? "Help Ticket — open tickets" : "Help Ticket"}
          className="-mr-2 relative flex h-11 w-11 items-center justify-center text-on-surface"
        >
          <Icon name="support_agent" filled={isActive("/help-ticket")} />
          {ticketAlert && (
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-surface bg-error" />
          )}
        </Link>
      </header>

      <nav
        aria-label="Main"
        className={`bottom-nav md:hidden fixed inset-x-0 bottom-0 z-40 grid ${
          tabs.length === 4 ? "grid-cols-5" : "grid-cols-4"
        } border-t-2 border-on-surface bg-surface pb-[env(safe-area-inset-bottom)]`}
      >
        {tabs.map((t) => {
          const active = isActive(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex h-16 flex-col items-center justify-center gap-0.5 ${
                active ? "text-on-surface" : "text-on-surface-variant"
              }`}
            >
              {active && <span className="absolute inset-x-3 top-0 h-[3px] bg-on-surface" />}
              <Icon name={t.icon} filled={active} />
              <span className={`font-label-sm text-[10px] uppercase tracking-wide ${active ? "font-bold" : ""}`}>
                {t.label}
              </span>
            </Link>
          );
        })}
        <button
          onClick={() => setOpen(true)}
          aria-label="More pages"
          aria-expanded={open}
          className={`relative flex h-16 flex-col items-center justify-center gap-0.5 ${
            moreActive ? "text-on-surface" : "text-on-surface-variant"
          }`}
        >
          {moreActive && <span className="absolute inset-x-3 top-0 h-[3px] bg-on-surface" />}
          <Icon name="menu" />
          <span className={`font-label-sm text-[10px] uppercase tracking-wide ${moreActive ? "font-bold" : ""}`}>
            More
          </span>
        </button>
      </nav>

      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
          {/* Backdrop */}
          <div className="flex-1 bg-black/50" onClick={() => setOpen(false)} />
          {/* Drawer */}
          <nav className="drawer flex h-full w-80 max-w-[86%] flex-col overflow-y-auto border-l-2 border-on-surface bg-surface pb-[env(safe-area-inset-bottom)]">
            <div className="flex h-14 shrink-0 items-center justify-between border-b-2 border-on-surface px-4">
              <BrandLogo className="h-7 w-auto text-on-surface" />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="-mr-2 flex h-11 w-11 items-center justify-center text-on-surface"
              >
                <Icon name="close" />
              </button>
            </div>

            <div className="flex-1 py-2">
              <Link href="/" className={rowFor("/")}>
                <Icon name="home" filled={isActive("/")} /> Dashboard
              </Link>
              <Link href="/help-ticket" className={rowFor("/help-ticket")}>
                <Icon name="support_agent" /> Help Ticket
              </Link>
              <Link href="/forms" className={rowFor("/forms")}>
                <Icon name="description" /> Google Forms
              </Link>
              <Link href="/master-sheet" className={rowFor("/master-sheet")}>
                <Icon name="table_chart" /> Master Sheet
              </Link>
              {canAccessInventory(user) && (
                <Link href="/ims" className={rowFor("/ims")}>
                  <Icon name="inventory_2" /> Inventory
                </Link>
              )}
              <Link href="/workflow" className={rowFor("/workflow")}>
                <Icon name="account_tree" /> Workflow
              </Link>

              {/* Task List + Checklist: hidden for plain doers (they use the
                  dashboard's Pending Tasks & Checklists instead). */}
              {user?.role !== "Doer" && (
                <>
                  <button
                    onClick={() => setSub((p) => ({ ...p, task: !p.task }))}
                    aria-expanded={sub.task}
                    className={`w-full text-left ${rowFor("/task-list")}`}
                  >
                    <Icon name="checklist" />
                    <span className="flex-1">Task List</span>
                    <Icon name={sub.task ? "expand_less" : "expand_more"} className="text-lg" />
                  </button>
                  {sub.task && (
                    <>
                      <Link href="/task-list" className={subRow}>
                        OFFICE TL
                      </Link>
                      {taskLists.map((l) => (
                        <Link key={l.id} href={`/task-list?list=${l.id}`} className={subRow}>
                          {shortListLabel(l.name, "task")}
                        </Link>
                      ))}
                    </>
                  )}

                  <button
                    onClick={() => setSub((p) => ({ ...p, checklist: !p.checklist }))}
                    aria-expanded={sub.checklist}
                    className={`w-full text-left ${rowFor("/checklist")}`}
                  >
                    <Icon name="task_alt" />
                    <span className="flex-1">Checklist</span>
                    <Icon name={sub.checklist ? "expand_less" : "expand_more"} className="text-lg" />
                  </button>
                  {sub.checklist && (
                    <>
                      <Link href="/checklist" className={subRow}>
                        OFFICE CL
                      </Link>
                      {checklists.map((l) => (
                        <Link key={l.id} href={`/checklist?list=${l.id}`} className={subRow}>
                          {shortListLabel(l.name, "checklist")}
                        </Link>
                      ))}
                    </>
                  )}
                </>
              )}

              {canAccessAllTasks(user) && (
                <Link href="/all-tasks" className={rowFor("/all-tasks")}>
                  <Icon name="fact_check" /> All Tasks
                </Link>
              )}
              <Link href="/attendance" className={rowFor("/attendance")}>
                <Icon name="badge" /> Attendance
              </Link>
              {canViewTeamPerformance(user) && (
                <Link href="/team-performance" className={rowFor("/team-performance")}>
                  <Icon name="insights" /> Team Performance
                </Link>
              )}
              {canManageDoers(user) && (
                <Link href="/settings" className={rowFor("/settings")}>
                  <Icon name="settings" /> Settings
                </Link>
              )}
            </div>

            {user && (
              <div className="flex shrink-0 items-center justify-between gap-2 border-t-2 border-on-surface p-4">
                <div className="min-w-0">
                  <p className="font-label-sm text-label-sm uppercase text-on-surface truncate">{user.name}</p>
                  <p className="font-data-mono text-[11px] text-on-surface-variant">
                    {user.employeeCode || user.role}
                  </p>
                </div>
                <button
                  onClick={logout}
                  className="min-h-[44px] shrink-0 border-2 border-on-surface px-4 font-label-sm text-label-sm uppercase"
                >
                  Logout
                </button>
              </div>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
