"use client";

import { useEffect, useState } from "react";
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

const TABS: { key: Tab; label: string }[] = [
  { key: "items", label: "Item List" },
  { key: "transactions", label: "In / Out" },
  { key: "ledger", label: "Stock Ledger" },
  { key: "reorder", label: "Reorder Sheet" },
];

function num(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "0";
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
      setError(err instanceof ApiError ? err.message : "Failed to load IMS data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
  }, []);

  const nameBySku = new Map(items.map((i) => [i.skuCode, i.itemName]));

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

  return (
    <>
      <MobileHeader />
      <SideNav active="ims" />

      <div className="md:ml-64 flex-1 flex flex-col bg-background min-h-screen">
        <header className="hidden md:flex bg-surface w-full border-b-2 border-on-surface justify-between items-center h-16 px-container-padding sticky top-0 z-30">
          <div className="font-headline-md text-headline-md text-on-surface uppercase border-b-2 border-on-surface pb-1">
            IMS — Inventory
          </div>
          <div className="flex items-center gap-3">
            {tab === "items" && (
              <button
                onClick={() => {
                  setEditingItem(null);
                  setShowItemModal(true);
                }}
                className="border-2 border-on-surface bg-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-surface hover:bg-primary transition-colors"
              >
                + Add Item
              </button>
            )}
            {tab === "transactions" && (
              <button
                onClick={() => setShowTxModal(true)}
                disabled={items.length === 0}
                className="border-2 border-on-surface bg-on-surface px-3 py-1.5 font-label-sm text-label-sm uppercase text-surface hover:bg-primary transition-colors disabled:opacity-50"
              >
                + Log Transaction
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col gap-stack-lg max-w-full overflow-hidden">
          <div className="md:hidden flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface uppercase tracking-tighter">
              IMS — Inventory
            </h2>
            {tab === "items" && (
              <button
                onClick={() => {
                  setEditingItem(null);
                  setShowItemModal(true);
                }}
                className="px-3 py-2 border-2 border-on-surface bg-on-surface text-surface font-label-sm text-label-sm uppercase"
              >
                + Item
              </button>
            )}
            {tab === "transactions" && (
              <button
                onClick={() => setShowTxModal(true)}
                disabled={items.length === 0}
                className="px-3 py-2 border-2 border-on-surface bg-on-surface text-surface font-label-sm text-label-sm uppercase disabled:opacity-50"
              >
                + Log
              </button>
            )}
          </div>

          {error && (
            <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">{error}</p>
          )}

          <div className="flex flex-wrap gap-2 border-b-2 border-on-surface pb-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 border-2 font-label-sm text-label-sm uppercase transition-colors ${
                  tab === t.key
                    ? "border-on-surface bg-on-surface text-surface"
                    : "border-on-surface text-on-surface hover:bg-surface-container"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="font-data-mono text-data-mono text-on-surface-variant">Loading...</p>
          ) : (
            <>
              {/* Section 1 — Item List */}
              {tab === "items" && (
                <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1100px]">
                    <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                      <tr>
                        <th className={thCls}>SKU Code</th>
                        <th className={thCls}>Item Name</th>
                        <th className={thCls}>Category</th>
                        <th className={thCls}>Avg Daily Consumption</th>
                        <th className={thCls}>Lead Time</th>
                        <th className={thCls}>Safety Factor</th>
                        <th className={thCls}>MOQ</th>
                        <th className={thCls}>Base Max Level</th>
                        <th className={thCls}>Effective Max Level (Auto)</th>
                        <th className={thCls}>Material In Transit</th>
                        <th className="py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="font-body-md text-body-md text-on-surface">
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={11} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                            No items yet.
                          </td>
                        </tr>
                      )}
                      {items.map((i) => (
                        <tr key={i.skuCode} className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors">
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
                                onClick={() => {
                                  setEditingItem(i);
                                  setShowItemModal(true);
                                }}
                                className="px-2 py-1 border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-surface-container transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteItem(i.skuCode)}
                                className="px-2 py-1 border-2 border-error text-error font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Section 2 — In / Out */}
              {tab === "transactions" && (
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
                      {transactions.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                            No transactions yet.
                          </td>
                        </tr>
                      )}
                      {transactions.map((t) => (
                        <tr key={t.id} className="border-b border-surface-variant last:border-b-0 hover:bg-surface-container-low transition-colors">
                          <td className={tdCls}>
                            {t.timestamp ? new Date(t.timestamp).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                          </td>
                          <td className={tdCls}>{t.skuCode}</td>
                          <td className="py-2 px-4 border-r border-surface-variant whitespace-nowrap">{nameBySku.get(t.skuCode) ?? "—"}</td>
                          <td className="py-2 px-4 border-r border-surface-variant">
                            <span
                              className={`inline-block px-2 py-0.5 border border-on-surface font-label-sm text-label-sm uppercase ${
                                t.direction === "In" ? "bg-primary/20" : "bg-error/20 text-error"
                              }`}
                            >
                              {t.direction}
                            </span>
                          </td>
                          <td className={tdCls}>{formatDMY(t.date)}</td>
                          <td className={tdCls}>{num(t.quantity)}</td>
                          <td className="py-2 px-4">
                            <button
                              onClick={() => handleDeleteTransaction(t.id)}
                              className="px-2 py-1 border-2 border-error text-error font-label-sm text-label-sm uppercase hover:bg-error hover:text-on-error transition-colors"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Section 3 — Stock Ledger */}
              {tab === "ledger" && (
                <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                      <tr>
                        <th className={thCls}>SKU Code</th>
                        <th className={thCls}>Item Name</th>
                        <th className={thCls}>Max Level</th>
                        <th className={thCls}>Material In Transit</th>
                        <th className={thCls}>Closing Stock</th>
                        {ledger.dates.map((d) => (
                          <th key={d} className={thCls}>
                            {formatDMY(d)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="font-body-md text-body-md text-on-surface">
                      {ledger.rows.length === 0 && (
                        <tr>
                          <td colSpan={5 + ledger.dates.length || 5} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
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
                          {ledger.dates.map((d) => (
                            <td key={d} className={tdCls}>
                              {num(r.byDate[d] ?? 0)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Section 4 — Reorder Sheet */}
              {tab === "reorder" && (
                <div className="w-full bg-surface-container-lowest border-2 border-on-surface overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[1100px]">
                    <thead className="bg-surface-container text-on-surface font-label-sm text-label-sm uppercase border-b-2 border-on-surface">
                      <tr>
                        <th className={thCls}>SKU</th>
                        <th className={thCls}>Item</th>
                        <th className={thCls}>Category</th>
                        <th className={thCls}>MOQ</th>
                        <th className={thCls}>Base Max</th>
                        <th className={thCls}>Safety Factor</th>
                        <th className={thCls}>Effective Max</th>
                        <th className={thCls}>Closing Stock</th>
                        <th className={thCls}>Material In Transit</th>
                        <th className="py-3 px-4">Reorder Qty</th>
                      </tr>
                    </thead>
                    <tbody className="font-body-md text-body-md text-on-surface">
                      {reorder.length === 0 && (
                        <tr>
                          <td colSpan={10} className="py-6 text-center font-data-mono text-data-mono text-on-surface-variant">
                            No items yet.
                          </td>
                        </tr>
                      )}
                      {reorder.map((r) => (
                        <tr
                          key={r.skuCode}
                          className={`border-b border-surface-variant last:border-b-0 ${r.reorderQty > 0 ? "bg-error/10" : ""}`}
                        >
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
                            {r.reorderQty > 0 ? (
                              <span className="text-error">{num(r.reorderQty)}</span>
                            ) : (
                              num(0)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {showItemModal && (
        <ImsItemModal
          item={editingItem}
          onClose={() => setShowItemModal(false)}
          onSaved={() => {
            setShowItemModal(false);
            load();
          }}
        />
      )}
      {showTxModal && (
        <ImsTransactionModal
          items={items}
          onClose={() => setShowTxModal(false)}
          onSaved={() => {
            setShowTxModal(false);
            load();
          }}
        />
      )}
    </>
  );
}

export default function ImsPage() {
  const { user } = useAuth();

  if (user && user.role !== "Admin") {
    return (
      <AuthGuard>
        <div className="min-h-screen flex items-center justify-center bg-background">
          <p className="font-data-mono text-data-mono text-error uppercase border-2 border-error p-4">
            Access Denied. Admins Only.
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
