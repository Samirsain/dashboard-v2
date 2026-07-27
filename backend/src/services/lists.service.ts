import { sheetsConfig } from "../config/sheets.config";
import { dataService, type SheetRecord } from "./data.service";
import { generateId } from "../utils/id";
import { todayIso } from "../utils/date";
import { AppError } from "../utils/AppError";
import { canViewAllData } from "../utils/access";
import { usersService } from "./users.service";
import type { JwtClaims, List, ListType, User } from "../types";

const entity = sheetsConfig.lists;

function toList(record: SheetRecord): List {
  const raw = record["Members"] ?? "";
  return {
    id: record["List ID"] ?? "",
    name: record["Name"] ?? "",
    type: (record["Type"] as ListType) || "task",
    memberIds: raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    createdAt: record["CreatedAt"] ?? "",
  };
}

export const listsService = {
  /** Ensure default OFFICE TL and OFFICE CL lists exist in DB with proper initial membership. */
  async ensureDefaultLists(): Promise<void> {
    try {
      const records = await dataService.findAll(entity);
      const lists = records.map(toList);
      const allUsers = await usersService.list();
      const sahilUser = allUsers.find(
        (u: User) => (u.employeeCode ?? "").toUpperCase() === "TM02" || u.name.toUpperCase().includes("SAHIL SETIA")
      );
      const sahilId = sahilUser?.id;

      const defaultMemberIds = allUsers
        .map((u: User) => u.id)
        .filter((id: string) => id !== sahilId);

      const officeTl = lists.find((l) => l.type === "task" && l.name.trim().toUpperCase().startsWith("OFFICE"));
      if (!officeTl) {
        await this.create({
          name: "OFFICE TL",
          type: "task",
          memberIds: defaultMemberIds,
        });
      } else if (sahilId && officeTl.memberIds.includes(sahilId)) {
        const updatedMembers = officeTl.memberIds.filter((id) => id !== sahilId);
        await this.updateMembers(officeTl.id, updatedMembers);
      }

      const officeCl = lists.find((l) => l.type === "checklist" && l.name.trim().toUpperCase().startsWith("OFFICE"));
      if (!officeCl) {
        await this.create({
          name: "OFFICE CL",
          type: "checklist",
          memberIds: defaultMemberIds,
        });
      } else if (sahilId && officeCl.memberIds.includes(sahilId)) {
        const updatedMembers = officeCl.memberIds.filter((id) => id !== sahilId);
        await this.updateMembers(officeCl.id, updatedMembers);
      }
    } catch (err) {
      console.error("Failed to ensure default lists:", err);
    }
  },

  /**
   * Lists the given user is allowed to see. Admin sees everything;
   * a plain doer only sees lists they're a member of. `type` narrows to Task
   * Lists or Checklists.
   */
  async list(opts: { type?: ListType; user?: JwtClaims } = {}): Promise<List[]> {
    await this.ensureDefaultLists();
    const records = await dataService.findAll(entity);
    let lists = records.map(toList);
    if (opts.type) lists = lists.filter((l) => l.type === opts.type);
    if (opts.user && !canViewAllData(opts.user)) {
      lists = lists.filter((l) => l.memberIds.includes(opts.user!.sub));
    }
    return lists.sort((a, b) => a.name.localeCompare(b.name));
  },

  async getById(id: string): Promise<List> {
    const record = await dataService.findById(entity, id);
    if (!record) throw AppError.notFound(`List "${id}" not found`);
    return toList(record);
  },

  async create(input: { name: string; type: ListType; memberIds?: string[] }): Promise<List> {
    const record: SheetRecord = {
      "List ID": generateId("LIST"),
      Name: input.name,
      Type: input.type,
      Members: (input.memberIds ?? []).join(","),
      CreatedAt: todayIso(),
    };
    const saved = await dataService.append(entity, record);
    return toList(saved);
  },

  /** Replaces the full member list — the admin's "who can access this list" control. */
  async updateMembers(id: string, memberIds: string[]): Promise<List> {
    const saved = await dataService.updateById(entity, id, {
      Members: memberIds.join(","),
    });
    return toList(saved);
  },

  async remove(id: string): Promise<void> {
    await dataService.deleteById(entity, id);
  },
};
