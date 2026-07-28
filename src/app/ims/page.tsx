"use client";

import { useEffect, useMemo, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";
import ImsItemModal from "@/components/ImsItemModal";
import ImsTransactionModal from "@/components/ImsTransactionModal";
import { api, ApiError } from "@/lib/api";
import { formatDMY } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import type { ImsItem, ImsTransaction, ImsStockLedger, ImsReorderRow } from "@/lib/types";

type Tab = "items" | "transactions" | "ledger" | "reorder";
type QuickRange = "week" | "month" | "custom";

function num(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "0";
}

/** Returns an ISO date string YYYY-MM-DD for today minus `days` days */
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Range Filter Bar Component ───────────────────────────────────────────
function RangeFilterBar({
  range, onRange, from, onFrom, to, onTo,
}: {
  range: QuickRange; onRange: (r: QuickRange) => void;
  from: string; onFrom: (v: string) => void;
  to: string; onTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-surface-container border-2 border-on-surface px-3 py-2">
      <span className="font-label-sm text-xs uppercase text-on-surface-variant font-bold">Period:</span>

      {/* Quick buttons */}
      {(["week", "month"] as const).map((r) => (
        <button
          key={r}
          onClick={() => onRange(r)}
          className={`px-3 py-1 border-2 font-label-sm text-xs uppercase font-bold transition-colors cursor-pointer ${
            (range as string) === r
              ? "bg-on-surface text-surface border-on-surface"
              : "border-on-surface text-on-surface hover:bg-surface-container-low"
          }`}
        >
          {r === "week" ? "This Week (7d)" : "This Month (30d)"}
        </button>
      ))}

      {/* Divider */}
      <span className="text-on-surface-variant text-xs font-data-mono">|</span>

      {/* Custom date range */}
      <div className="flex items-center gap-1.5">
        <span className="font-label-sm text-xs text-on-surface-variant uppercase">From:</span>
        <input
          type="date"
          value={from}
          onChange={(e) => { onFrom(e.target.value); onRange("custom"); }}
          className={`border-2 px-2 py-1 font-data-mono text-xs text-on-surface bg-surface focus:outline-none cursor-pointer ${
            range === "custom" ? "border-on-surface" : "border-on-surface/50"
          }`}
        />
        <span className="font-label-sm text-xs text-on-surface-variant uppercase">To:</span>
        <input
          type="date"
          value={to}
          onChange={(e) => { onTo(e.target.value); onRange("custom"); }}
          className={`border-2 px-2 py-1 font-data-mono text-xs text-on-surface bg-surface focus:outline-none cursor-pointer ${
            range === "custom" ? "border-on-surface" : "border-on-surface/50"
          }`}
        />
        {range === "custom" && (
          <span className="text-[10px] font-label-sm uppercase bg-on-surface text-surface px-2 py-1 font-bold">
            Custom Range Active
          </span>
        )}
      </div>
    </div>
  );
}

function ImsInner() {
  const [tab, setTab] = useState<Tab>("items");
  const [items, setItems] = useState<ImsItem[]>([]);
  const [transactions, setTransactions] = useState<ImsTransaction[]>([]);
  const [ledger, setLedger] = useState<ImsStockLedger>({ dates: [], rows: [] });
  const [reorder, setReorder] = useState<ImsReorderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ImsItem | null>(null);
  const [showTxModal, setShowTxModal] = useState(false);

  // Item search
  const [itemSearch, setItemSearch] = useState("");

  // Transactions filter
  const [txSearch, setTxSearch] = useState("");
  const [txRange, setTxRange] = useState<QuickRange>("week");
  const [txFrom, setTxFrom] = useState(daysAgo(7));
  const [txTo, setTxTo] = useState(todayIso());
  const [txDirection, setTxDirection] = useState<"All" | "In" | "Out">("All");

  // Ledger filter
  const [ledgerRange, setLedgerRange] = useState<QuickRange>("week");
  const [ledgerFrom, setLedgerFrom] = useState(daysAgo(7));
  const [ledgerTo, setLedgerTo] = useState(todayIso());

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [itemData, txData, ledgerData, reorderData] = await Promise.all([
        api.get<ImsItem[]>("/ims/items"),
        api.get<ImsTransaction[]>("/ims/transactions"),
        api.get<ImsStockLedger>("/ims/stock-ledger"),
        api.get<ImsReorderRow[]>("/ims/reorder-sheet"),
      ]);
      setItems(itemData);
      setTransactions(txData);
      setLedger(ledgerData);
      setReorder(reorderData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load inventory data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => { load(); });
  }, []);

  // ── Quick range button handlers ──────────────────────────────────────────
  function applyTxRange(range: QuickRange) {
    setTxRange(range);
    if (range === "week") { setTxFrom(daysAgo(7)); setTxTo(todayIso()); }
    if (range === "month") { setTxFrom(daysAgo(30)); setTxTo(todayIso()); }
    // "custom" keeps whatever the date inputs hold
  }

  function applyLedgerRange(range: QuickRange) {
    setLedgerRange(range);
    if (range === "week") { setLedgerFrom(daysAgo(7)); setLedgerTo(todayIso()); }
    if (range === "month") { setLedgerFrom(daysAgo(30)); setLedgerTo(todayIso()); }
  }

  const nameBySku = new Map(items.map((i) => [i.skuCode, i.itemName]));
  const needsReorderCount = reorder.filter((r) => r.reorderQty > 0).length;
  // Map for quick lookup of reorder data by SKU (used in Item List color coding)
  const reorderBySku = new Map(reorder.map((r) => [r.skuCode, r]));

  const sortedReorder = useMemo(
    () =>
      [...reorder].sort((a, b) => {
        if (a.reorderQty > 0 && b.reorderQty === 0) return -1;
        if (a.reorderQty === 0 && b.reorderQty > 0) return 1;
        if (a.reorderQty !== b.reorderQty) return b.reorderQty - a.reorderQty;
        return a.itemName.localeCompare(b.itemName);
      }),
    [reorder]
  );

  // ── Filtered items ───────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (!itemSearch) return items;
    const q = itemSearch.toLowerCase();
    return items.filter((i) => i.skuCode.toLowerCase().includes(q) || i.itemName.toLowerCase().includes(q));
  }, [items, itemSearch]);

  // ── Filtered transactions (date range + search + direction) ──────────────
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // Date filter: compare t.date (YYYY-MM-DD) against range
      const txDate = t.date ?? t.timestamp?.slice(0, 10) ?? "";
      const inRange = (!txFrom || txDate >= txFrom) && (!txTo || txDate <= txTo);
      if (!inRange) return false;

      // Direction filter
      if (txDirection !== "All" && t.direction !== txDirection) return false;

      // Text search
      if (txSearch) {
        const q = txSearch.toLowerCase();
        const matchSku = t.skuCode.toLowerCase().includes(q);
        const matchName = (nameBySku.get(t.skuCode) ?? "").toLowerCase().includes(q);
        if (!matchSku && !matchName) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, txFrom, txTo, txSearch, txDirection, items]);

  // ── Visible ledger dates (filtered by date range) ────────────────────────
  const visibleLedgerDates = useMemo(() => {
    return ledger.dates.filter((d) => (!ledgerFrom || d >= ledgerFrom) && (!ledgerTo || d <= ledgerTo));
  }, [ledger.dates, ledgerFrom, ledgerTo]);

  // ── Summary stats for filtered transactions ──────────────────────────────
  const txStats = useMemo(() => {
    const totalIn = filteredTransactions.filter((t) => t.direction === "In").reduce((s, t) => s + t.quantity, 0);
    const totalOut = filteredTransactions.filter((t) => t.direction === "Out").reduce((s, t) => s + t.quantity, 0);
    return { totalIn, totalOut, count: filteredTransactions.length };
  }, [filteredTransactions]);

  async function handleDeleteItem(skuCode: string) {
    if (!confirm(`Delete SKU "${skuCode}"? This also removes its transaction history.`)) return;
    try {
      await api.delete(`/ims/items/${encodeURIComponent(skuCode)}`);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete item.");
    }
  }

  async function handleDeleteTransaction(id: string) {
    if (!confirm("Delete this transaction?")) return;
    try {
      await api.delete(`/ims/transactions/${id}`);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete transaction.");
    }
  }

  const thCls = "py-3 px-4 border-r border-surface-variant whitespace-nowrap";
  const tdCls = "py-2 px-4 border-r border-surface-variant font-data-mono text-data-mono whitespace-nowrap";

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "items", label: "Item List" },
    { key: "transactions", label: "In / Out" },
    { key: "ledger", label: "Stock Ledger" },
    { key: "reorder", label: "Reorder Sheet", badge: needsReorderCount },
  ];


  return (
    <>
      <MobileHeader />
      <SideNav active="ims" />

      <div className="md:ml-64 flex-1 flex flex-col bg-background min-h-screen">
        <header className="flex flex-col gap-2 bg-surface w-full border-b border-on-surface p-3 z-30 md:flex-row md:items-center md:justify-between md:gap-4 md:h-16 md:py-0 md:px-container-padding md:sticky md:top-0">
          <div className="font-headline-md text-headline-md text-on-surface uppercase border-b-2 border-on-surface pb-1 font-black">
            📦 Inventory Management System
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tab === "items" && (
              <button
                onClick={() => { setEditingItem(null); setShowItemModal(true); }}
                className="border-2 border-on-surface bg-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-surface hover:bg-primary transition-colors cursor-pointer"
              >
                + Add Item
              </button>
            )}
            {tab === "transactions" && (
              <button
                onClick={() => setShowTxModal(true)}
                disabled={items.length === 0}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-label-sm uppercase tracking-wide border bg-on-surface text-surface border-on-surface hover:opacity-90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                + Log Transaction
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-lg max-w-full overflow-hidden">
          {/* Mobile header */}
          <div className="md:hidden flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface uppercase tracking-tighter">
              📦 Inventory
            </h2>
            {tab === "items" && (
              <button onClick={() => { setEditingItem(null); setShowItemModal(true); }} className="px-3 py-2 border-2 border-on-surface bg-on-surface text-surface font-label-sm text-label-sm uppercase">
                + Item
              </button>
            )}
            {tab === "transactions" && (
              <button onClick={() => setShowTxModal(true)} disabled={items.length === 0} className="px-3 py-2 border-2 border-on-surface bg-on-surface text-surface font-label-sm text-label-sm uppercase disabled:opacity-50">
                + Log
              </button>
            )}
          </div>

          {error && <p className="font-label-sm text-sm text-error border border-error px-3 py-2">{error}</p>}

          {!loading && items.length === 0 ? (
            <div className="bg-surface-container-lowest border-2 border-on-surface p-stack-lg flex flex-col items-center gap-4 text-center">
              <p className="font-headline-md text-headline-md text-on-surface uppercase">Get Started</p>
              <p className="font-data-mono text-data-mono text-on-surface-variant max-w-md">
                Add your first item (SKU) to start tracking stock. Once you have items, log In/Out
                movements and the Stock Ledger &amp; Reorder Sheet build themselves automatically.
              </p>
              <button
                onClick={() => { setEditingItem(null); setShowItemModal(true); }}
                className="px-6 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors cursor-pointer"
              >
                + Add Your First Item
              </button>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Total Items (SKUs)", value: items.length, tone: "" },
                  { label: "Total Stock On Hand", value: num(reorder.reduce((s, r) => s + r.closingStock, 0)), tone: "" },
                  { label: "Transactions Logged", value: transactions.length, tone: "" },
                  {
                    label: "Needs Reorder",
                    value: needsReorderCount,
                    tone: needsReorderCount > 0 ? "bg-error/10 border-error text-error" : "",
                  },
                ].map((c) => (
                  <div key={c.label} className={`border-2 border-on-surface p-3 ${c.tone || "bg-surface-container-lowest"}`}>
                    <p className="font-label-sm text-label-sm uppercase text-on-surface-variant">{c.label}</p>
                    <p className="font-headline-md text-headline-md mt-1">{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div className="flex flex-wrap gap-2 border-b-2 border-on-surface pb-2">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex items-center gap-2 px-3 py-1.5 border-2 font-label-sm text-label-sm uppercase transition-colors cursor-pointer ${
                      tab === t.key
                        ? "border-on-surface bg-on-surface text-surface"
                        : "border-on-surface text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {t.label}
                    {!!t.badge && (
                      <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[11px] font-bold ${tab === t.key ? "bg-surface text-error" : "bg-error text-on-error"}`}>
                        {t.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {loading ? (
                <p className="font-data-mono text-data-mono text-on-surface-variant">Loading...</p>
              ) : (
                <>
                  {/* ─── Section 1: Item List ─────────────────────────────── */}
                  {tab === "items" && (
                    <div className="flex flex-col gap-stack-sm">
                      <input
                        value={itemSearch}
                        onChange={(e) => setItemSearch(e.target.value)}
                        placeholder="Search by SKU or item name..."
                        className="min-h-[40px] border border-on-surface bg-surface px-3 py-2 font-data-mono text-sm text-on-surface focus:outline-2 focus:outline-offset-[-2px] focus:outline-on-surface max-w-sm"
                      />
                      {/* Color Legend */}
                      <div className="flex items-center gap-0 border border-on-surface/30 bg-surface-container-lowest font-label-sm text-[10px] uppercase divide-x divide-on-surface/20 overflow-hidden">
                        <span className="px-3 py-2 text-on-surface-variant font-bold whitespace-nowrap">Color Guide</span>
                        <span className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap">
                          <span className="inline-block w-2.5 h-2.5 bg-error/30 border border-error flex-shrink-0"></span>
                          <span className="text-error font-bold">Red</span>
                          <span className="text-on-surface-variant hidden sm:inline">— Stock critically low (order ≥ MOQ)</span>
                        </span>
                        <span className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap">
                          <span className="inline-block w-2.5 h-2.5 bg-amber-200 border border-amber-500 flex-shrink-0"></span>
                          <span className="text-amber-700 font-bold">Yellow</span>
                          <span className="text-on-surface-variant hidden sm:inline">— Stock slightly low (min. MOQ order)</span>
                        </span>
                        <span className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap">
                          <span className="inline-block w-2.5 h-2.5 bg-emerald-200 border border-emerald-500 flex-shrink-0"></span>
                          <span className="text-emerald-700 font-bold">Green</span>
                          <span className="text-on-surface-variant hidden sm:inline">— Stock sufficient</span>
                        </span>
                      </div>
                      <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[1100px]">
                          <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                            <tr>
                              <th className={thCls}>Item Code</th>
                              <th className={thCls}>Item Name</th>
                              <th className={thCls}>Category</th>
                              <th className={thCls} title="Kitna roz use hota hai">Daily Use</th>
                              <th className={thCls} title="Order karne ke baad kitne din mein aata hai">Delivery Days</th>
                              <th className={thCls} title="Extra buffer multiplier">Safety Factor</th>
                              <th className={thCls} title="Minimum Order Quantity">Min. Order</th>
                              <th className={thCls}>Max Stock</th>
                              <th className={thCls} title="Max Stock × Buffer, auto calculate">Target Stock</th>
                              <th className={thCls} title="Jo order hua hai lekin abhi aaya nahi">On the Way</th>
                              <th className="py-3 px-4">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="font-body-md text-body-md text-on-surface">
                            {filteredItems.length === 0 && (
                              <tr>
                                <td colSpan={11} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                                  No items match &quot;{itemSearch}&quot;.
                                </td>
                              </tr>
                            )}
                            {filteredItems.map((i) => {
                              const rd = reorderBySku.get(i.skuCode);
                              const raw = rd ? rd.effectiveMaxLevel - rd.closingStock - rd.materialInTransit : null;
                              const isBigShortage = raw !== null && raw >= i.moq;
                              const isSmallShortage = raw !== null && raw > 0 && raw < i.moq;
                              const rowStyle = isBigShortage
                                ? { backgroundColor: "rgba(254,226,226,0.6)" }
                                : isSmallShortage
                                ? { backgroundColor: "rgba(254,240,138,0.45)", borderLeft: "3px solid #eab308" }
                                : { backgroundColor: "rgba(209,250,229,0.5)" };
                              return (
                              <tr key={i.skuCode} style={rowStyle} className="border-b border-surface-variant last:border-b-0 transition-colors">
                                <td className={tdCls}>{i.skuCode}</td>
                                <td className="py-2 px-4 border-r border-surface-variant font-medium whitespace-nowrap">{i.itemName}</td>
                                <td className={tdCls}>{i.category}</td>
                                <td className={tdCls}>{num(i.avgDailyConsumption)}</td>
                                <td className={tdCls}>{num(i.leadTime)}</td>
                                <td className={tdCls}>{num(i.safetyFactor)}</td>
                                <td className={tdCls}>{num(i.moq)}</td>
                                <td className={tdCls}>{num(i.baseMaxLevel)}</td>
                                <td className={tdCls}>{num(i.effectiveMaxLevel)}</td>
                                <td className={tdCls}>{num(i.materialInTransit)}</td>
                                <td className="py-2 px-4 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => { setEditingItem(i); setShowItemModal(true); }}
                                      className="px-2 py-1 border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors cursor-pointer"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteItem(i.skuCode)}
                                      className="px-2 py-1 border-2 border-error text-error font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors cursor-pointer"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ─── Section 2: In / Out Transactions ────────────────── */}
                  {tab === "transactions" && (
                    <div className="flex flex-col gap-3">
                      {/* Range Filter Bar */}
                      <RangeFilterBar
                        range={txRange} onRange={applyTxRange}
                        from={txFrom} onFrom={setTxFrom}
                        to={txTo} onTo={setTxTo}
                      />

                      {/* Search + Direction filter */}
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={txSearch}
                          onChange={(e) => setTxSearch(e.target.value)}
                          placeholder="Search by SKU or item name..."
                          className="border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-xs text-on-surface focus:outline-none min-w-[220px]"
                        />
                        <div className="flex items-center gap-1">
                          {(["All", "In", "Out"] as const).map((d) => (
                            <button
                              key={d}
                              onClick={() => setTxDirection(d)}
                              className={`px-3 py-1.5 border-2 font-label-sm text-xs uppercase font-bold transition-colors cursor-pointer ${
                                txDirection === d
                                  ? "bg-on-surface text-surface border-on-surface"
                                  : "border-on-surface text-on-surface hover:bg-surface-container"
                              }`}
                            >
                              {d === "In" ? "↑ In" : d === "Out" ? "↓ Out" : "All"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Transaction summary mini cards */}
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="border border-on-surface/30 bg-surface p-3">
                          <p className="font-label-sm text-[10px] uppercase text-on-surface-variant">Transactions</p>
                          <p className="font-data-mono text-xl font-bold text-on-surface">{txStats.count}</p>
                        </div>
                        <div className="border border-on-surface/30 bg-emerald-50 p-3">
                          <p className="font-label-sm text-[10px] uppercase text-emerald-800">Total Stock In</p>
                          <p className="font-data-mono text-xl font-bold text-emerald-700">+{num(txStats.totalIn)}</p>
                        </div>
                        <div className="border border-on-surface/30 bg-rose-50 p-3">
                          <p className="font-label-sm text-[10px] uppercase text-rose-800">Total Stock Out</p>
                          <p className="font-data-mono text-xl font-bold text-rose-700">-{num(txStats.totalOut)}</p>
                        </div>
                      </div>

                      <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[720px]">
                          <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                            <tr>
                              <th className={thCls}>Timestamp</th>
                              <th className={thCls}>SKU</th>
                              <th className={thCls}>Item Name</th>
                              <th className={thCls}>In / Out</th>
                              <th className={thCls}>Date</th>
                              <th className={thCls}>Quantity</th>
                              <th className="py-3 px-4">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="font-body-md text-body-md text-on-surface">
                            {filteredTransactions.length === 0 && (
                              <tr>
                                <td colSpan={7} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                                  {transactions.length === 0
                                    ? "No transactions yet."
                                    : `No transactions found for selected range / filter.`}
                                </td>
                              </tr>
                            )}
                            {filteredTransactions.map((t) => (
                              <tr key={t.id} className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors">
                                <td className={tdCls}>
                                  {t.timestamp ? new Date(t.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                                </td>
                                <td className={tdCls}>{t.skuCode}</td>
                                <td className="py-2 px-4 border-r border-surface-variant whitespace-nowrap">{nameBySku.get(t.skuCode) ?? "—"}</td>
                                <td className="py-2 px-4 border-r border-surface-variant">
                                  <span
                                    className={`inline-block px-2 py-0.5 border font-label-sm text-label-sm uppercase font-bold ${
                                      t.direction === "In"
                                        ? "bg-emerald-100 text-emerald-800 border-emerald-400"
                                        : "bg-rose-100 text-rose-800 border-rose-400"
                                    }`}
                                  >
                                    {t.direction === "In" ? "↑ In" : "↓ Out"}
                                  </span>
                                </td>
                                <td className={tdCls}>{formatDMY(t.date)}</td>
                                <td className={tdCls}>{num(t.quantity)}</td>
                                <td className="py-2 px-4">
                                  <button
                                    onClick={() => handleDeleteTransaction(t.id)}
                                    className="px-2 py-1 border-2 border-error text-error font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ─── Section 3: Stock Ledger ──────────────────────────── */}
                  {tab === "ledger" && (
                    <div className="flex flex-col gap-3">
                      <RangeFilterBar
                        range={ledgerRange} onRange={applyLedgerRange}
                        from={ledgerFrom} onFrom={setLedgerFrom}
                        to={ledgerTo} onTo={setLedgerTo}
                      />

                      {visibleLedgerDates.length === 0 && ledger.dates.length > 0 && (
                        <p className="font-label-sm text-xs text-on-surface-variant border border-on-surface/30 px-3 py-2">
                          No ledger dates fall within selected range. Try changing the date filter.
                        </p>
                      )}

                      <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                            <tr>
                              <th className={thCls}>Item Code</th>
                              <th className={thCls}>Item Name</th>
                              <th className={thCls}>Target Stock</th>
                              <th className={thCls}>On the Way</th>
                              <th className={thCls}>Current Stock</th>
                              {visibleLedgerDates.map((d) => (
                                <th key={d} className={thCls}>{formatDMY(d)}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="font-body-md text-body-md text-on-surface">
                            {ledger.rows.length === 0 && (
                              <tr>
                                <td colSpan={5 + visibleLedgerDates.length || 5} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                                  No data yet — add items and log transactions first.
                                </td>
                              </tr>
                            )}
                            {ledger.rows.map((r) => (
                              <tr key={r.skuCode} className="border-b border-surface-variant last:border-b-0">
                                <td className={tdCls}>{r.skuCode}</td>
                                <td className="py-2 px-4 border-r border-surface-variant whitespace-nowrap">{r.itemName}</td>
                                <td className={tdCls}>{num(r.maxLevel)}</td>
                                <td className={tdCls}>{num(r.materialInTransit)}</td>
                                <td className={tdCls}>{num(r.closingStock)}</td>
                                {visibleLedgerDates.map((d) => (
                                  <td key={d} className={tdCls}>{num(r.byDate[d] ?? 0)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ─── Section 4: Reorder Sheet ─────────────────────────── */}
                  {tab === "reorder" && (
                    <div className="flex flex-col gap-stack-sm">
                      {/* Color Legend */}
                      <div className="flex items-center gap-0 border border-on-surface/30 bg-surface-container-lowest font-label-sm text-[10px] uppercase divide-x divide-on-surface/20 overflow-hidden">
                        <span className="px-3 py-2 text-on-surface-variant font-bold whitespace-nowrap">Color Guide</span>
                        <span className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap">
                          <span className="inline-block w-2.5 h-2.5 bg-error/30 border border-error flex-shrink-0"></span>
                          <span className="text-error font-bold">Red</span>
                          <span className="text-on-surface-variant hidden sm:inline">— Stock critically low (order ≥ MOQ)</span>
                        </span>
                        <span className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap">
                          <span className="inline-block w-2.5 h-2.5 bg-amber-200 border border-amber-500 flex-shrink-0"></span>
                          <span className="text-amber-700 font-bold">Yellow</span>
                          <span className="text-on-surface-variant hidden sm:inline">— Stock slightly low (min. MOQ order)</span>
                        </span>
                        <span className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap">
                          <span className="inline-block w-2.5 h-2.5 bg-emerald-200 border border-emerald-500 flex-shrink-0"></span>
                          <span className="text-emerald-700 font-bold">Green</span>
                          <span className="text-on-surface-variant hidden sm:inline">— Stock sufficient</span>
                        </span>
                      </div>
                      <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[1100px]">
                          <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                            <tr>
                              <th className={thCls}>Item Code</th>
                              <th className={thCls}>Item Name</th>
                              <th className={thCls}>Category</th>
                              <th className={thCls}>Min. Order</th>
                              <th className={thCls}>Max Stock</th>
                              <th className={thCls}>Safety Factor</th>
                              <th className={thCls}>Target Stock</th>
                              <th className={thCls}>Current Stock</th>
                              <th className={thCls}>On the Way</th>
                              <th className="py-3 px-4">Order Now</th>
                            </tr>
                          </thead>
                          <tbody className="font-body-md text-body-md text-on-surface">
                            {sortedReorder.length === 0 && (
                              <tr>
                                <td colSpan={10} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                                  No items yet.
                                </td>
                              </tr>
                            )}
                            {sortedReorder.map((r) => {
                              const raw = r.effectiveMaxLevel - r.closingStock - r.materialInTransit;
                              const isBigShortage = raw >= r.moq;
                              const isSmallShortage = raw > 0 && raw < r.moq;
                              const rowStyle = isBigShortage
                                ? { backgroundColor: "rgba(254,226,226,0.6)" }
                                : isSmallShortage
                                ? { backgroundColor: "rgba(254,240,138,0.45)", borderLeft: "3px solid #eab308" }
                                : { backgroundColor: "rgba(209,250,229,0.5)" };
                              const qtyColor = isBigShortage
                                ? "text-error"
                                : isSmallShortage
                                ? "text-amber-700"
                                : "text-emerald-700";
                              return (
                              <tr key={r.skuCode} style={rowStyle} className="border-b border-surface-variant last:border-b-0">
                                <td className={tdCls}>{r.skuCode}</td>
                                <td className="py-2 px-4 border-r border-surface-variant whitespace-nowrap">{r.itemName}</td>
                                <td className={tdCls}>{r.category}</td>
                                <td className={tdCls}>{num(r.moq)}</td>
                                <td className={tdCls}>{num(r.baseMaxLevel)}</td>
                                <td className={tdCls}>{num(r.safetyFactor)}</td>
                                <td className={tdCls}>{num(r.effectiveMaxLevel)}</td>
                                <td className={tdCls}>{num(r.closingStock)}</td>
                                <td className={tdCls}>{num(r.materialInTransit)}</td>
                                <td className="py-2 px-4 font-data-mono text-data-mono font-bold">
                                  <span className={qtyColor}>{num(r.reorderQty)}</span>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {showItemModal && (
        <ImsItemModal
          item={editingItem}
          onClose={() => setShowItemModal(false)}
          onSaved={() => { setShowItemModal(false); load(); }}
        />
      )}
      {showTxModal && (
        <ImsTransactionModal
          items={items}
          onClose={() => setShowTxModal(false)}
          onSaved={() => { setShowTxModal(false); load(); }}
        />
      )}
    </>
  );
}

export default function ImsPage() {
  const { user } = useAuth();

  if (user && user.role !== "MD" && user.role !== "PC") {
    return (
      <AuthGuard>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="font-data-mono text-data-mono text-error uppercase border-2 border-error p-4">
          Access Denied. MD / PC Only.
          </p>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <ImsInner />
    </AuthGuard>
  );
}
