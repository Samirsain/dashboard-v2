"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import BrandLogo from "@/components/BrandLogo";
import { useAuth } from "@/lib/auth-context";
import { canAccessAllTasks } from "@/lib/access";
import { api } from "@/lib/api";
import type { List } from "@/lib/types";

/** "SAHIL SIR TASKLIST" -> "SAHIL TL" */
function shortListLabel(name: string, type: "task" | "checklist"): string {
  const first = name.trim().split(/\s+/)[0]?.toUpperCase() || "LIST";
  return `${first} ${type === "task" ? "TL" : "CL"}`;
}

/**
 * Mobile top bar + slide-in navigation drawer. The desktop SideNav is hidden
 * below md; this gives phones a working hamburger menu with the same routes.
 */
export default function MobileHeader() {
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

  const taskLists = lists.filter((l) => l.type === "task");
  const checklists = lists.filter((l) => l.type === "checklist");
  const isAdmin = user?.role === "Admin";

  const rowBase =
    "block px-4 py-3 font-headline-md text-base uppercase tracking-tight border-l-4 transition-colors";
  const rowFor = (href: string) =>
    `${rowBase} ${
      pathname === href
        ? "border-primary bg-secondary-container text-on-secondary-container"
        : "border-transparent text-on-surface-variant hover:bg-surface-container"
    }`;
  const subRow = `${rowBase} pl-10 border-transparent text-on-surface-variant hover:bg-surface-container`;

  return (
    <>
      <header className="md:hidden flex justify-between items-center h-16 w-full px-container-padding sticky top-0 z-30 bg-surface border-b-2 border-on-surface">
        <BrandLogo className="h-7 w-auto text-on-surface" />
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex items-center justify-center w-10 h-10 border-2 border-on-surface text-on-surface"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
      </header>

      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/50" onClick={() => setOpen(false)} />
          {/* Drawer */}
          <nav className="w-72 max-w-[85%] h-full bg-surface border-l-2 border-on-surface flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b-2 border-on-surface">
              <BrandLogo className="h-7 w-auto text-on-surface" />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="w-9 h-9 flex items-center justify-center border-2 border-on-surface text-on-surface"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 py-2">
              <Link href="/" className={rowFor("/")}>
                Dashboard
              </Link>

              {/* Task List + Checklist: hidden for plain doers (they use the
                  dashboard's Pending Tasks instead). */}
              {user?.role !== "Doer" && (
                <>
                  <button
                    onClick={() => setSub((p) => ({ ...p, task: !p.task }))}
                    className={`w-full text-left flex items-center justify-between ${rowFor("/task-list")}`}
                  >
                    <span>Task List</span>
                    <span className="material-symbols-outlined text-lg">
                      {sub.task ? "expand_less" : "expand_more"}
                    </span>
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
                    className={`w-full text-left flex items-center justify-between ${rowFor("/checklist")}`}
                  >
                    <span>Checklist</span>
                    <span className="material-symbols-outlined text-lg">
                      {sub.checklist ? "expand_less" : "expand_more"}
                    </span>
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

              <Link href="/workflow" className={rowFor("/workflow")}>
                Workflow
              </Link>
              <Link href="/master-sheet" className={rowFor("/master-sheet")}>
                Master Sheet
              </Link>
              <Link href="/forms" className={rowFor("/forms")}>
                Google Forms
              </Link>
              <Link href="/attendance" className={rowFor("/attendance")}>
                Attendance
              </Link>

              {canAccessAllTasks(user) && (
                <Link href="/all-tasks" className={rowFor("/all-tasks")}>
                  All Tasks
                </Link>
              )}
              {isAdmin && (
                <>
                  <Link href="/team-performance" className={rowFor("/team-performance")}>
                    Team Performance
                  </Link>
                  <Link href="/settings" className={rowFor("/settings")}>
                    Settings
                  </Link>
                  <Link href="/ims" className={rowFor("/ims")}>
                    IMS
                  </Link>
                </>
              )}
            </div>

            {user && (
              <div className="border-t-2 border-on-surface p-4 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-label-sm text-label-sm uppercase text-on-surface truncate">
                    {user.name}
                  </p>
                  <p className="font-data-mono text-[11px] text-on-surface-variant">
                    {user.employeeCode || user.role}
                  </p>
                </div>
                <button
                  onClick={logout}
                  className="font-label-sm text-label-sm uppercase border-2 border-on-surface px-2 py-1 shrink-0"
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
