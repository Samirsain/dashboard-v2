/** A single plain figure with its label — the minimal stat tile used across the app. */
export default function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col gap-1 border border-on-surface/25 px-3 py-2">
      <span className="font-label-sm text-[10px] uppercase tracking-wide text-on-surface-variant">{label}</span>
      <span className="font-data-mono text-lg font-bold text-on-surface">{value}</span>
    </div>
  );
}
