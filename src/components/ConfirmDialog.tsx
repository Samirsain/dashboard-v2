"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button, buttonClass } from "@/components/ui";

/**
 * A small "Are you sure?" popup.
 *
 * "Done" buttons sit right next to other controls in dense tables, so on a
 * phone they get tapped by accident while scrolling — and marking something
 * done can't be undone from the UI. Every such action asks first.
 *
 * Usage:
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Mark as done?", message: task.title }))) return;
 */

type ConfirmOptions = {
  title?: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmFn = (opts?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((o = {}) => {
    // A second request while one is open answers the first with "no".
    resolverRef.current?.(false);
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  useEffect(() => {
    if (!opts) return;
    // Focus Cancel, not Confirm, so a stray Enter / double tap doesn't confirm.
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={() => close(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-xs border-2 border-on-surface bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-title" className="font-label-sm text-sm uppercase tracking-wide text-on-surface">
              {opts.title ?? "Are you sure?"}
            </h3>
            {opts.message && (
              <p className="mt-2 text-sm text-on-surface-variant break-words">{opts.message}</p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button ref={cancelRef} type="button" className={buttonClass("secondary")} onClick={() => close(false)}>
                {opts.cancelLabel ?? "Cancel"}
              </button>
              <Button variant="primary" onClick={() => close(true)}>
                {opts.confirmLabel ?? "Yes, Done"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  // Outside the provider, fall back to the browser's own dialog.
  return ctx ?? (async (o) => window.confirm(o?.title ?? "Are you sure?"));
}
