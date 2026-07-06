import bcrypt from "bcryptjs";
import { sheetsConfig } from "../config/sheets.config";
import { dataService, type SheetRecord } from "./data.service";
import { generateId } from "../utils/id";
import { todayIso } from "../utils/date";
import { AppError } from "../utils/AppError";
import type { User, UserRole, UserStatus, UserWithSecrets } from "../types";

/** DOERLIST — master employee table. `id` here is the Doer ID (idColumn). */
const entity = sheetsConfig.users;

function toUser(record: SheetRecord): User {
  return {
    id: record["Doer ID"] ?? "",
    employeeCode: record["Employee Code"] ?? "",
    name: record["Name"] ?? "",
    mobile: record["Mobile"] ?? "",
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
    const records = await dataService.findAll(entity);
    return records.map(toUser);
  },

  async getById(id: string): Promise<User> {
    const record = await dataService.findById(entity, id);
    if (!record) throw AppError.notFound(`Doer "${id}" not found in DOERLIST`);
    return toUser(record);
  },

  /** True if `id` exists in DOERLIST — used to validate Assigned Doer ID on tasks. */
  async exists(id: string): Promise<boolean> {
    const record = await dataService.findById(entity, id);
    return record !== null;
  },

  async findByEmail(email: string): Promise<UserWithSecrets | null> {
    const records = await dataService.findAll(entity);
    const match = records.find(
      (r) => (r["Email"] ?? "").toLowerCase() === email.toLowerCase()
    );
    return match ? toUserWithSecrets(match) : null;
  },

  /** Login lookup: `identifier` may be either an Email or an Employee Code (e.g. "EM01"). */
  async findByIdentifier(identifier: string): Promise<UserWithSecrets | null> {
    const records = await dataService.findAll(entity);
    const needle = identifier.trim().toLowerCase();
    const match = records.find(
      (r) =>
        (r["Email"] ?? "").toLowerCase() === needle ||
        (r["Employee Code"] ?? "").toLowerCase() === needle
    );
    return match ? toUserWithSecrets(match) : null;
  },

  async create(input: {
    name: string;
    mobile: string;
    email: string;
    department: string;
    role: UserRole;
    status: UserStatus;
    password: string;
    employeeCode?: string;
  }): Promise<User> {
    const existing = await this.findByEmail(input.email);
    if (existing) throw AppError.conflict(`A doer with email "${input.email}" already exists`);

    const passwordHash = await bcrypt.hash(input.password, 10);
    const record: SheetRecord = {
      "Doer ID": generateId("USR"),
      "Employee Code": input.employeeCode ?? "",
      Name: input.name,
      Mobile: input.mobile,
      Email: input.email,
      Department: input.department,
      Role: input.role,
      Status: input.status,
      PasswordHash: passwordHash,
      CreatedAt: todayIso(),
    };

    const saved = await dataService.append(entity, record);
    return toUser(saved);
  },

  async update(
    id: string,
    updates: Partial<
      Pick<User, "name" | "mobile" | "email" | "department" | "role" | "status" | "employeeCode">
    >
  ): Promise<User> {
    const patch: Partial<SheetRecord> = {};
    if (updates.name !== undefined) patch["Name"] = updates.name;
    if (updates.mobile !== undefined) patch["Mobile"] = updates.mobile;
    if (updates.email !== undefined) patch["Email"] = updates.email;
    if (updates.department !== undefined) patch["Department"] = updates.department;
    if (updates.role !== undefined) patch["Role"] = updates.role;
    if (updates.status !== undefined) patch["Status"] = updates.status;
    if (updates.employeeCode !== undefined) patch["Employee Code"] = updates.employeeCode;

    const saved = await dataService.updateById(entity, id, patch);
    return toUser(saved);
  },

  async remove(id: string): Promise<void> {
    await dataService.deleteById(entity, id);
  },

  async verifyPassword(user: UserWithSecrets, password: string): Promise<boolean> {
    if (!user.passwordHash) return false;
    return bcrypt.compare(password, user.passwordHash);
  },
};
