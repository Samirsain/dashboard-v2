"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import type { List } from "@/lib/types";

type NavKey = "dashboard" | "checklist" | "task-list" | "workflow" | "team-performance";

const NAV_ITEMS: { key: NavKey; href: string; icon: string; label: string; adminOnly?: boolean }[] = [
  { key: "dashboard", href: "/", icon: "dashboard", label: "Dashboard" },
  { key: "checklist", href: "/checklist", icon: "checklist", label: "Checklist" },
  { key: "task-list", href: "/task-list", icon: "assignment", label: "Task List" },
  { key: "workflow", href: "/workflow", icon: "account_tree", label: "Workflow" },
  { key: "team-performance", href: "/team-performance", icon: "insights", label: "Team Performance", adminOnly: true },
];

export default function SideNav({ active }: { active: NavKey }) {
  const { user, logout } = useAuth();
  const [lists, setLists] = useState<List[]>([]);

  useEffect(() => {
    api.get<List[]>("/lists").then(setLists).catch(() => setLists([]));
  }, []);

  const taskLists = lists.filter((l) => l.type === "task");
  const checklists = lists.filter((l) => l.type === "checklist");

  return (
    <nav className="hidden md:flex fixed left-0 top-0 h-full flex-col z-40 w-64 border-r-2 border-on-surface bg-surface">
      {/* Brand Area */}
      <div className="p-6 border-b-2 border-on-surface">
        <h1 className="font-headline-md text-headline-md font-bold uppercase tracking-tighter text-on-surface">
          ThirtyMilestones
        </h1>
        <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">
          Enterprise RE MIS
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex-1 py-4 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          // Hide admin-only items if user is not Admin
          if (item.adminOnly && user?.role !== "Admin") {
            return null;
          }
          
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={
                isActive
                  ? "bg-secondary-container text-on-secondary-container border-l-4 border-primary px-4 py-3 flex items-center gap-3"
                  : "text-on-surface-variant px-4 py-3 flex items-center gap-3 hover:bg-surface-container hover:text-on-surface transition-colors border-l-4 border-transparent"
              }
            >
              <span className="material-symbols-outlined" data-icon={item.icon}>
                {item.icon}
              </span>
              <span className="font-headline-md text-headline-md text-base">
                {item.label}
              </span>
            </Link>
          );
        })}

        {(taskLists.length > 0 || checklists.length > 0) && (
          <div className="mt-4 border-t-2 border-on-surface pt-3">
            {taskLists.length > 0 && (
              <>
                <p className="px-4 pb-1 font-label-sm text-label-sm uppercase text-on-surface-variant">
                  Task Lists
                </p>
                {taskLists.map((l) => (
                  <Link
                    key={l.id}
                    href={`/task-list?list=${l.id}`}
                    className="text-on-surface-variant px-4 py-2 flex items-center gap-2 hover:bg-surface-container hover:text-on-surface transition-colors border-l-4 border-transparent"
                  >
                    <span className="material-symbols-outlined text-base" data-icon="folder">
                      folder
                    </span>
                    <span className="font-body-md text-body-md truncate">{l.name}</span>
                  </Link>
                ))}
              </>
            )}
            {checklists.length > 0 && (
              <>
                <p className="px-4 pt-2 pb-1 font-label-sm text-label-sm uppercase text-on-surface-variant">
                  Checklists
                </p>
                {checklists.map((l) => (
                  <Link
                    key={l.id}
                    href={`/checklist?list=${l.id}`}
                    className="text-on-surface-variant px-4 py-2 flex items-center gap-2 hover:bg-surface-container hover:text-on-surface transition-colors border-l-4 border-transparent"
                  >
                    <span className="material-symbols-outlined text-base" data-icon="folder">
                      folder
                    </span>
                    <span className="font-body-md text-body-md truncate">{l.name}</span>
                  </Link>
                ))}
              </>
            )}
          </div>
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
        <a
          className="text-on-surface-variant px-4 py-3 flex items-center gap-3 hover:bg-surface-container transition-colors"
          href="#"
        >
          <span className="material-symbols-outlined" data-icon="settings">
            settings
          </span>
          <span className="font-label-sm text-label-sm">Settings</span>
        </a>
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
