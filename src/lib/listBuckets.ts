import type { List } from "./types";

/**
 * One toggleable sheet in the access UI.
 *
 * OFFICE TL / OFFICE CL are the implicit default buckets everyone starts in.
 * When a real OFFICE list exists they behave like any other sheet (its id is
 * linked, so the tickbox writes real membership). If one hasn't been created
 * yet, `isOffice` marks it as an always-on placeholder that can't be toggled.
 */
export type Bucket = {
  key: string;
  label: string;
  kind: "task" | "checklist";
  listId: string;
  isOffice: boolean;
};

/** First word of a list's name, uppercased — "SAHIL SIR TASKLIST" -> "SAHIL". */
export function listGroupKey(name: string): string {
  return name.trim().split(/\s+/)[0]?.toUpperCase() || "LIST";
}

/** Every sheet an MD can grant, OFFICE buckets pinned first, tasks before checklists. */
export function buildBuckets(lists: List[]): Bucket[] {
  const officeTl = lists.find(
    (l) => l.type === "task" && l.name.trim().toUpperCase().startsWith("OFFICE")
  );
  const officeCl = lists.find(
    (l) => l.type === "checklist" && l.name.trim().toUpperCase().startsWith("OFFICE")
  );

  const taskBuckets: Bucket[] = [
    { key: "office-task", label: "OFFICE TL", kind: "task", listId: officeTl?.id ?? "", isOffice: !officeTl },
  ];
  const checklistBuckets: Bucket[] = [
    { key: "office-checklist", label: "OFFICE CL", kind: "checklist", listId: officeCl?.id ?? "", isOffice: !officeCl },
  ];

  for (const l of lists) {
    if (l.name.trim().toUpperCase().startsWith("OFFICE")) continue; // already pinned above
    const short = listGroupKey(l.name);
    if (l.type === "task") {
      taskBuckets.push({ key: `t-${l.id}`, label: `${short} TL`, kind: "task", listId: l.id, isOffice: false });
    } else {
      checklistBuckets.push({ key: `c-${l.id}`, label: `${short} CL`, kind: "checklist", listId: l.id, isOffice: false });
    }
  }
  return [...taskBuckets, ...checklistBuckets];
}

/**
 * Whether a user currently has access to a bucket. Office buckets backed by a
 * real list are checked like any other; the placeholder form is always on.
 */
export function hasListAccess(lists: List[], userId: string, bucket: Bucket): boolean {
  const list = lists.find((l) => l.id === bucket.listId);
  if (!list) return bucket.isOffice;
  return list.memberIds.includes(userId);
}
