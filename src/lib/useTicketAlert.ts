"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth-context";
import type { Ticket } from "./types";

/**
 * Whether the Help Ticket nav item should blink red for the current user:
 *  - Admin — any ticket still needing admin action (Pending or Reopened).
 *  - Everyone else — any of their own tickets waiting on them (Waiting for Employee).
 */
export function useHelpTicketAlert(): boolean {
  const { user } = useAuth();
  const [hasAlert, setHasAlert] = useState(false);

  useEffect(() => {
    if (!user) {
      queueMicrotask(() => setHasAlert(false));
      return;
    }
    let cancelled = false;
    api
      .get<Ticket[]>("/tickets")
      .then((tickets) => {
        if (cancelled) return;
        const alert =
          user.role === "Admin"
            ? tickets.some((t) => t.status === "Pending" || t.status === "Reopened")
            : tickets.some((t) => t.status === "Waiting for Employee");
        setHasAlert(alert);
      })
      .catch(() => {
        if (!cancelled) setHasAlert(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return hasAlert;
}
