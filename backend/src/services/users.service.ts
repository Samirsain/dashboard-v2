import bcrypt from "bcryptjs";
import { sheetsConfig } from "../config/sheets.config";
import { googleSheetsService, type SheetRecord } from "./googleSheets.service";
import { generateId } from "../utils/id";
import { todayIso } from "../utils/date";
import { AppError } from "../utils/AppError";
import type { User, UserRole, UserStatus, UserWithSecrets } from "../types";

const entity = sheetsConfig.users;

function toUser(record: SheetRecord): User {
  return {
    id: record["ID"] ?? "",
    name: record["Name"] ?? "",
    email: record["Email"] ?? "",
    department: record["Department"] ?? "",
    role: (record["Role"] as UserRole) || "Doer",
    status: (record["Status"] as UserStatus) || "Active",
    createdAt: record["CreatedAt"] ?? "",
  };
}

function toUserWithSecrets(record: SheetRecord): UserWithSecrets {
  return { ...toUser(record), passwordHash: record["PasswordHash"] ?? "" };
}

export const usersService = {
  async list(): Promise<User[]> {
    const records = await googleSheetsService.findAll(entity);
    return records.map(toUser);
  },

  async getById(id: string): Promise<User> {
    const record = await googleSheetsService.findById(entity, id);
    if (!record) throw AppError.notFound(`User "${id}" not found`);
    return toUser(record);
  },

  async findByEmail(email: string): Promise<UserWithSecrets | null> {
    const records = await googleSheetsService.findAll(entity);
    const match = records.find(
      (r) => (r["Email"] ?? "").toLowerCase() === email.toLowerCase()
    );
    return match ? toUserWithSecrets(match) : null;
  },

  async create(input: {
    name: string;
    email: string;
    department: string;
    role: UserRole;
    status: UserStatus;
    password: string;
  }): Promise<User> {
    const existing = await this.findByEmail(input.email);
    if (existing) throw AppError.conflict(`A user with email "${input.email}" already exists`);

    const passwordHash = await bcrypt.hash(input.password, 10);
    const record: SheetRecord = {
      ID: generateId("USR"),
      Name: input.name,
      Email: input.email,
      Department: input.department,
      Role: input.role,
      Status: input.status,
      PasswordHash: passwordHash,
      CreatedAt: todayIso(),
    };

    const saved = await googleSheetsService.append(entity, record);
    return toUser(saved);
  },

  async update(
    id: string,
    updates: Partial<Pick<User, "name" | "email" | "department" | "role" | "status">>
  ): Promise<User> {
    const patch: Partial<SheetRecord> = {};
    if (updates.name !== undefined) patch["Name"] = updates.name;
    if (updates.email !== undefined) patch["Email"] = updates.email;
    if (updates.department !== undefined) patch["Department"] = updates.department;
    if (updates.role !== undefined) patch["Role"] = updates.role;
    if (updates.status !== undefined) patch["Status"] = updates.status;

    const saved = await googleSheetsService.updateById(entity, id, patch);
    return toUser(saved);
  },

  async remove(id: string): Promise<void> {
    await googleSheetsService.deleteById(entity, id);
  },

  async verifyPassword(user: UserWithSecrets, password: string): Promise<boolean> {
    if (!user.passwordHash) return false;
    return bcrypt.compare(password, user.passwordHash);
  },
};
