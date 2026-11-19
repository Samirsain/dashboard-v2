/**
 * A single plain figure with its label — the minimal stat tile used across the app.
 * `shortLabel` replaces the label on phones, where four tiles share one row.
 */
export default function Stat({
  label,
  shortLabel,
  value,
}: {
  label: string;
  shortLabel?: string;
  value: number | string;
}) {
  return (
    <div className="flex flex-col gap-1 border border-on-surface/25 px-3 py-2">
      <span className="font-label-sm text-[10px] uppercase tracking-wide text-on-surface-variant truncate">
        {shortLabel ? (
          <>
            <span className="max-md:hidden">{label}</span>
            <span className="md:hidden">{shortLabel}</span>
          </>
        ) : (
          label
        )}
      </span>
      <span className="font-data-mono text-lg font-bold text-on-surface">{value}</span>
    </div>
  );
}
