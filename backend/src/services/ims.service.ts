import { getSupabase } from "../config/supabase";
import { generateId } from "../utils/id";
import { AppError } from "../utils/AppError";
import type {
  CreateImsItemInput,
  UpdateImsItemInput,
  CreateImsTransactionInput,
} from "../validation/ims.schema";

/**
 * IMS (Inventory Management System) — standalone stock-tracking feature.
 * Lives in its own two Supabase tables (ims_items, ims_transactions),
 * created via backend/scripts/add-ims-tables.ts. Not part of the
 * sheets.config/Google-Sheets-backup system — this is a fresh, self-contained
 * feature so it can't affect any existing data or behavior.
 */

export interface ImsItem {
  id: string; // = SKU Code
  skuCode: string;
  itemName: string;
  category: string;
  avgDailyConsumption: number;
  leadTime: number;
  safetyFactor: number;
  moq: number;
  baseMaxLevel: number;
  effectiveMaxLevel: number; // baseMaxLevel * safetyFactor, computed
  materialInTransit: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImsTransaction {
  id: string;
  skuCode: string;
  direction: "In" | "Out";
  date: string;
  quantity: number;
  timestamp: string;
  createdBy: string;
}

interface ItemRow {
  id: string;
  sku_code: string;
  item_name: string;
  category: string;
  avg_daily_consumption: number;
  lead_time: number;
  safety_factor: number;
  moq: number;
  base_max_level: number;
  material_in_transit: number;
  created_at: string;
  updated_at: string;
}

interface TransactionRow {
  id: string;
  sku_code: string;
  direction: "In" | "Out";
  date: string;
  quantity: number;
  timestamp: string;
  created_by: string;
}

function toItem(row: ItemRow): ImsItem {
  return {
    id: row.id,
    skuCode: row.sku_code,
    itemName: row.item_name,
    category: row.category,
    avgDailyConsumption: Number(row.avg_daily_consumption) || 0,
    leadTime: Number(row.lead_time) || 0,
    safetyFactor: Number(row.safety_factor) || 1,
    moq: Number(row.moq) || 0,
    baseMaxLevel: Number(row.base_max_level) || 0,
    effectiveMaxLevel: (Number(row.base_max_level) || 0) * (Number(row.safety_factor) || 1),
    materialInTransit: Number(row.material_in_transit) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTransaction(row: TransactionRow): ImsTransaction {
  return {
    id: row.id,
    skuCode: row.sku_code,
    direction: row.direction,
    date: row.date,
    quantity: Number(row.quantity) || 0,
    timestamp: row.timestamp,
    createdBy: row.created_by,
  };
}

export const imsService = {
  // ---- Items --------------------------------------------------------------

  async listItems(): Promise<ImsItem[]> {
    const { data, error } = await getSupabase()
      .from("ims_items")
      .select("*")
      .order("sku_code", { ascending: true });
    if (error) throw new AppError(`Failed to load IMS items: ${error.message}`, 502, "DB_ERROR");
    return (data ?? []).map(toItem);
  },

  async createItem(input: CreateImsItemInput): Promise<ImsItem> {
    const existing = await getSupabase()
      .from("ims_items")
      .select("id")
      .eq("sku_code", input.skuCode)
      .maybeSingle();
    if (existing.data) {
      throw AppError.conflict(`SKU "${input.skuCode}" already exists.`);
    }
    const now = new Date().toISOString();
    const row = {
      id: input.skuCode,
      sku_code: input.skuCode,
      item_name: input.itemName,
      category: input.category,
      avg_daily_consumption: input.avgDailyConsumption,
      lead_time: input.leadTime,
      safety_factor: input.safetyFactor,
      moq: input.moq,
      base_max_level: input.baseMaxLevel,
      material_in_transit: input.materialInTransit ?? 0,
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await getSupabase().from("ims_items").insert(row).select("*").single();
    if (error) throw new AppError(`Failed to create IMS item: ${error.message}`, 502, "DB_ERROR");
    return toItem(data as ItemRow);
  },

  async updateItem(skuCode: string, input: UpdateImsItemInput): Promise<ImsItem> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.itemName !== undefined) patch.item_name = input.itemName;
    if (input.category !== undefined) patch.category = input.category;
    if (input.avgDailyConsumption !== undefined) patch.avg_daily_consumption = input.avgDailyConsumption;
    if (input.leadTime !== undefined) patch.lead_time = input.leadTime;
    if (input.safetyFactor !== undefined) patch.safety_factor = input.safetyFactor;
    if (input.moq !== undefined) patch.moq = input.moq;
    if (input.baseMaxLevel !== undefined) patch.base_max_level = input.baseMaxLevel;
    if (input.materialInTransit !== undefined) patch.material_in_transit = input.materialInTransit;

    const { data, error } = await getSupabase()
      .from("ims_items")
      .update(patch)
      .eq("id", skuCode)
      .select("*")
      .maybeSingle();
    if (error) throw new AppError(`Failed to update IMS item: ${error.message}`, 502, "DB_ERROR");
    if (!data) throw AppError.notFound(`SKU "${skuCode}" not found.`);
    return toItem(data as ItemRow);
  },

  async removeItem(skuCode: string): Promise<void> {
    const { data, error } = await getSupabase().from("ims_items").delete().eq("id", skuCode).select("id");
    if (error) throw new AppError(`Failed to delete IMS item: ${error.message}`, 502, "DB_ERROR");
    if (!data || data.length === 0) throw AppError.notFound(`SKU "${skuCode}" not found.`);
  },

  // ---- Transactions ---------------------------------------------------------

  async listTransactions(skuCode?: string): Promise<ImsTransaction[]> {
    let query = getSupabase().from("ims_transactions").select("*").order("timestamp", { ascending: false });
    if (skuCode) query = query.eq("sku_code", skuCode);
    const { data, error } = await query;
    if (error) throw new AppError(`Failed to load IMS transactions: ${error.message}`, 502, "DB_ERROR");
    return (data ?? []).map(toTransaction);
  },

  async createTransaction(input: CreateImsTransactionInput, createdBy: string): Promise<ImsTransaction> {
    const item = await getSupabase().from("ims_items").select("id").eq("id", input.skuCode).maybeSingle();
    if (!item.data) throw AppError.notFound(`SKU "${input.skuCode}" not found in Item List.`);

    const row = {
      id: generateId("IMSTX"),
      sku_code: input.skuCode,
      direction: input.direction,
      date: input.date,
      quantity: input.quantity,
      timestamp: new Date().toISOString(),
      created_by: createdBy,
    };
    const { data, error } = await getSupabase().from("ims_transactions").insert(row).select("*").single();
    if (error) throw new AppError(`Failed to log transaction: ${error.message}`, 502, "DB_ERROR");
    return toTransaction(data as TransactionRow);
  },

  async removeTransaction(id: string): Promise<void> {
    const { data, error } = await getSupabase().from("ims_transactions").delete().eq("id", id).select("id");
    if (error) throw new AppError(`Failed to delete transaction: ${error.message}`, 502, "DB_ERROR");
    if (!data || data.length === 0) throw AppError.notFound(`Transaction "${id}" not found.`);
  },

  // ---- Computed reports -----------------------------------------------------

  /**
   * Stock Ledger: for every item, the closing stock as of every calendar day
   * from the earliest transaction's date through today — one column per day,
   * growing by one every day new transactions come in.
   */
  async stockLedger(): Promise<{
    dates: string[];
    rows: Array<{
      skuCode: string;
      itemName: string;
      maxLevel: number;
      materialInTransit: number;
      closingStock: number;
      byDate: Record<string, number>;
    }>;
  }> {
    const [items, transactions] = await Promise.all([this.listItems(), this.listTransactions()]);

    if (transactions.length === 0) {
      return {
        dates: [],
        rows: items.map((i) => ({
          skuCode: i.skuCode,
          itemName: i.itemName,
          maxLevel: i.effectiveMaxLevel,
          materialInTransit: i.materialInTransit,
          closingStock: 0,
          byDate: {},
        })),
      };
    }

    const earliestDate = transactions.reduce((min, t) => (t.date < min ? t.date : min), transactions[0]!.date);
    const todayStr = new Date().toISOString().slice(0, 10);
    const dates: string[] = [];
    for (let d = new Date(earliestDate); d.toISOString().slice(0, 10) <= todayStr; d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    const bySku = new Map<string, ImsTransaction[]>();
    for (const t of transactions) {
      const list = bySku.get(t.skuCode) ?? [];
      list.push(t);
      bySku.set(t.skuCode, list);
    }

    const rows = items.map((item) => {
      const txs = (bySku.get(item.skuCode) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
      const byDate: Record<string, number> = {};
      let running = 0;
      let txIndex = 0;
      for (const date of dates) {
        while (txIndex < txs.length && txs[txIndex]!.date <= date) {
          const t = txs[txIndex]!;
          running += t.direction === "In" ? t.quantity : -t.quantity;
          txIndex++;
        }
        byDate[date] = running;
      }
      return {
        skuCode: item.skuCode,
        itemName: item.itemName,
        maxLevel: item.effectiveMaxLevel,
        materialInTransit: item.materialInTransit,
        closingStock: dates.length > 0 ? (byDate[dates[dates.length - 1]!] ?? 0) : 0,
        byDate,
      };
    });

    return { dates, rows };
  },

  /**
   * Reorder Sheet: per item, current closing stock and how much to reorder.
   *   Reorder Qty = Effective Max Level - Closing Stock - Material In Transit
   *   < 0            -> 0
   *   > 0 and < MOQ  -> MOQ
   *   otherwise      -> the raw quantity
   */
  async reorderSheet(): Promise<
    Array<{
      skuCode: string;
      itemName: string;
      category: string;
      moq: number;
      baseMaxLevel: number;
      safetyFactor: number;
      effectiveMaxLevel: number;
      closingStock: number;
      materialInTransit: number;
      reorderQty: number;
    }>
  > {
    const [items, transactions] = await Promise.all([this.listItems(), this.listTransactions()]);

    const closingStockBySku = new Map<string, number>();
    for (const t of transactions) {
      const prev = closingStockBySku.get(t.skuCode) ?? 0;
      closingStockBySku.set(t.skuCode, prev + (t.direction === "In" ? t.quantity : -t.quantity));
    }

    return items.map((item) => {
      const closingStock = closingStockBySku.get(item.skuCode) ?? 0;
      const raw = item.effectiveMaxLevel - closingStock - item.materialInTransit;
      let reorderQty = 0;
      if (raw > 0) {
        reorderQty = raw < item.moq ? item.moq : raw;
      }
      return {
        skuCode: item.skuCode,
        itemName: item.itemName,
        category: item.category,
        moq: item.moq,
        baseMaxLevel: item.baseMaxLevel,
        safetyFactor: item.safetyFactor,
        effectiveMaxLevel: item.effectiveMaxLevel,
        closingStock,
        materialInTransit: item.materialInTransit,
        reorderQty,
      };
    });
  },
};
