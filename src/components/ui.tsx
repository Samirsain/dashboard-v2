import type { ReactNode } from "react";

/**
 * Shared UI primitives.
 *
 * Every page used to hand-roll its own button, input and table markup, which
 * drifted into a dozen near-identical variants with different paddings, border
 * weights and text sizes. These are the one definition of each; pages compose
 * them instead of repeating class strings.
 *
 * Sizing is chosen for touch first: controls are at least 40px tall so they
 * stay tappable on a phone, and grow no larger on desktop.
 */

// ---- Buttons ---------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 font-label-sm uppercase tracking-wide " +
  "border transition-colors cursor-pointer select-none whitespace-nowrap " +
  "disabled:opacity-40 disabled:cursor-not-allowed " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-surface";

const buttonSizes: Record<ButtonSize, string> = {
  sm: "min-h-[36px] px-3 text-[11px]",
  md: "min-h-[40px] px-4 text-xs",
};

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-on-surface text-surface border-on-surface hover:opacity-90",
  secondary: "bg-surface text-on-surface border-on-surface hover:bg-surface-container",
  ghost: "bg-transparent text-on-surface-variant border-transparent hover:bg-surface-container hover:text-on-surface",
  danger: "bg-surface text-error border-error hover:bg-error hover:text-surface",
};

export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  extra = ""
): string {
  return `${buttonBase} ${buttonSizes[size]} ${buttonVariants[variant]} ${extra}`.trim();
}

export function Button({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  className = "",
  type = "button",
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, `${fullWidth ? "w-full" : ""} ${className}`)}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A group of buttons that wraps cleanly and goes full-width on very small screens. */
export function ButtonRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
}

// ---- Form fields -----------------------------------------------------------

/** Shared class for text inputs, selects, date pickers and textareas. */
export const fieldClass =
  "min-h-[40px] w-full border border-on-surface bg-surface px-3 py-2 text-sm text-on-surface " +
  "placeholder:text-on-surface-variant focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface";

/** Same, but sized to sit inline in a toolbar rather than fill a form row. */
export const fieldInlineClass =
  "min-h-[40px] border border-on-surface bg-surface px-3 py-2 text-sm text-on-surface " +
  "placeholder:text-on-surface-variant focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface";

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="font-label-sm text-[11px] uppercase tracking-wide text-on-surface-variant">
      {children}
    </label>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// ---- Layout ----------------------------------------------------------------

/**
 * Page title bar. Unlike the old per-page headers this renders on mobile too —
 * those were `hidden md:flex`, which left phones with no page title and, worse,
 * no way to reach the actions that lived in them.
 */
export function PageHeader({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-on-surface pb-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-headline-md text-headline-md uppercase font-bold text-on-surface truncate">
          {title}
        </h1>
        {children}
      </div>
      {actions && <ButtonRow className="shrink-0">{actions}</ButtonRow>}
    </header>
  );
}

/** The standard page shell: sits beside the desktop nav, pads for mobile. */
export function PageBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main className={`md:ml-16 min-h-screen bg-background ${className}`}>
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 p-4 md:p-6">{children}</div>
    </main>
  );
}

export function Card({
  title,
  actions,
  children,
  className = "",
  bodyClassName = "p-3",
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`border border-on-surface bg-surface ${className}`}>
      {(title || actions) && (
        <div className="flex flex-col gap-2 border-b border-on-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          {title && (
            <h2 className="font-label-sm text-xs uppercase tracking-wide text-on-surface-variant">{title}</h2>
          )}
          {actions && <ButtonRow>{actions}</ButtonRow>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A toolbar strip — filters, week pickers, search. Wraps instead of overflowing. */
export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 border border-on-surface/30 p-2 ${className}`}>
      {children}
    </div>
  );
}

// ---- Tables ----------------------------------------------------------------

/**
 * Horizontal scroll container for wide tables. Tables stay tables on phones —
 * they just scroll sideways inside this box rather than pushing the whole page
 * wide, so the rest of the layout never breaks.
 */
export function TableWrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`w-full overflow-x-auto border border-on-surface ${className}`}>{children}</div>
  );
}

export const tableClass = "w-full border-collapse text-left";
export const theadClass =
  "border-b border-on-surface font-label-sm text-[11px] uppercase tracking-wide text-on-surface-variant";
export const thClass = "whitespace-nowrap px-3 py-2 font-normal";
export const trClass = "border-b border-on-surface/15 last:border-b-0 hover:bg-surface-container-low transition-colors";
export const tdClass = "px-3 py-2 align-middle";

export function StateRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center font-data-mono text-sm text-on-surface-variant">
        {children}
      </td>
    </tr>
  );
}

// ---- Feedback --------------------------------------------------------------

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="border border-error px-3 py-2 font-label-sm text-sm text-error">
      {children}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="border border-on-surface/25 px-3 py-8 text-center font-data-mono text-sm text-on-surface-variant">
      {children}
    </div>
  );
}

// ---- Modal -----------------------------------------------------------------

/**
 * Centred dialog. Full width with breathing room on phones, capped on desktop,
 * and its body scrolls so a long form can never push the actions off-screen.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92vh] w-full ${widths[size]} flex-col border border-on-surface bg-surface`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-on-surface px-3 py-2.5">
          <h2 className="font-label-sm text-xs uppercase tracking-wide text-on-surface">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="min-h-[32px] px-2 font-label-sm text-xs uppercase text-on-surface-variant hover:text-on-surface hover:underline cursor-pointer"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-on-surface px-3 py-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
