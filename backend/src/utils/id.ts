import { v4 as uuidv4 } from "uuid";

/**
 * Generates a short, human-friendly unique ID with a prefix, e.g. "TASK-3F9A1C2B".
 * Always prefer this over row numbers or sequential counters — rows can be
 * reordered/deleted in Google Sheets, IDs cannot drift.
 */
export function generateId(prefix: string): string {
  const segment = uuidv4().split("-")[0]?.toUpperCase() ?? uuidv4().toUpperCase();
  return `${prefix}-${segment}`;
}

/** Full RFC 4122 v4 UUID — used for Task IDs, which must be UUIDs (not row-derived or sequential). */
export function generateUuid(): string {
  return uuidv4();
}
