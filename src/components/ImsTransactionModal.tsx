"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { ImsItem, ImsDirection } from "@/lib/types";

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default function ImsTransactionModal({
  items,
  onClose,
  onSaved,
}: {
  items: ImsItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [skuCode, setSkuCode] = useState(items[0]?.skuCode ?? "");
  const [direction, setDirection] = useState<ImsDirection>("In");
  const [date, setDate] = useState(todayIso());
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!skuCode) {
      setError("Pick a SKU.");
      return;
    }
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      setError("Quantity must be greater than 0.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/ims/transactions", { skuCode, direction, date, quantity: qty });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to log transaction.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-data-mono text-on-surface focus:outline-none w-full";
  const labelCls = "font-label-sm text-label-sm uppercase text-on-surface-variant";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm bg-surface-container-lowest border-2 border-on-surface">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md">
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">Log Transaction</h3>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase"
          >
            Close
          </button>
        </div>

        <div className="p-stack-lg flex flex-col gap-4">
          {error && (
            <p className="font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">{error}</p>
          )}

          <div className="flex flex-col gap-1">
            <label className={labelCls}>SKU</label>
            <select value={skuCode} onChange={(e) => setSkuCode(e.target.value)} className={inputCls}>
              {items.length === 0 && <option value="">No items yet</option>}
              {items.map((i) => (
                <option key={i.skuCode} value={i.skuCode}>
                  {i.skuCode} — {i.itemName}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelCls}>In / Out</label>
            <div className="flex gap-2">
              {(["In", "Out"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDirection(d)}
                  className={`flex-1 px-3 py-1.5 border-2 font-label-sm text-label-sm uppercase transition-colors ${
                    direction === d
                      ? "border-on-surface bg-on-surface text-surface"
                      : "border-on-surface text-on-surface hover:bg-surface-container"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelCls}>Date</label>
            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelCls}>Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || items.length === 0}
              className="px-4 py-2 bg-on-surface text-surface-container-lowest border-2 border-on-surface font-label-sm text-label-sm uppercase hover:bg-primary transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
