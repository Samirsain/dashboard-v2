"use client";

import type { ReactNode } from "react";

/**
 * Renders `text` with every occurrence of `needles` (already lowercased)
 * wrapped in a <mark>, so a search hit is visible in the cell rather than
 * leaving the reader to scan for it. Matching is case-insensitive; the
 * original casing is preserved in the output.
 */
export default function HighlightedText({ text, needles }: { text: string; needles: string[] }) {
  const usable = needles.filter(Boolean);
  if (!text || usable.length === 0) return <>{text}</>;

  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  while (cursor < text.length) {
    // The earliest match from here; on a tie the longest one wins, so
    // "ravi kumar" highlights as one run rather than just "ravi".
    let start = -1;
    let end = -1;
    for (const needle of usable) {
      const at = lower.indexOf(needle, cursor);
      if (at === -1) continue;
      if (start === -1 || at < start || (at === start && at + needle.length > end)) {
        start = at;
        end = at + needle.length;
      }
    }
    if (start === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={key++} className="bg-primary/40 text-on-surface">
        {text.slice(start, end)}
      </mark>
    );
    cursor = end;
  }

  return <>{parts}</>;
}
