import type { JwtClaims, List, ListType } from "../types";

/**
 * Decides which lists (sheets) a user is allowed to see the contents of.
 *
 * Settings lets the MD tick/untick which lists each person belongs to, but that
 * membership was only ever applied to users who couldn't "view all". MD and PC
 * both pass canViewAllData(), so for a PC the tickboxes did nothing: unticking
 * a sheet still left every task and checklist in it visible.
 *
 * The MD keeps unrestricted sight of everything. Everyone else is held to their
 * membership, so unticking a sheet actually removes its work from view.
 *
 * Items filed under no list at all belong to the implicit "Office" bucket,
 * which Settings shows as OFFICE TL / OFFICE CL. Those map onto the real
 * OFFICE list of the matching type when one exists, so its tickbox works like
 * any other. With no OFFICE list to check against, unfiled work stays visible
 * rather than silently disappearing.
 */
export type ListVisibility = (listId: string, type: ListType) => boolean;

export function buildListVisibility(user: JwtClaims | undefined, lists: List[]): ListVisibility {
  if (user?.role === "MD") return () => true;
  if (!user) return () => false;

  const memberOf = new Set(lists.filter((l) => l.memberIds.includes(user.sub)).map((l) => l.id));

  const officeByType = new Map<ListType, List>();
  for (const l of lists) {
    if (l.name.trim().toUpperCase().startsWith("OFFICE")) officeByType.set(l.type, l);
  }

  return (listId: string, type: ListType) => {
    if (listId) return memberOf.has(listId);
    const office = officeByType.get(type);
    return office ? memberOf.has(office.id) : true;
  };
}
