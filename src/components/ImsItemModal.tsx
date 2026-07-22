"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { ImsItem } from "@/lib/types";

/** Create a new SKU, or edit an existing one (skuCode is then locked). */
export default function ImsItemModal({
  item,
  onClose,
  onSaved,
}: {
  item: ImsItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!item;
  const [skuCode, setSkuCode] = useState(item?.skuCode ?? "");
  const [itemName, setItemName] = useState(item?.itemName ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [avgDailyConsumption, setAvgDailyConsumption] = useState(String(item?.avgDailyConsumption ?? ""));
  const [leadTime, setLeadTime] = useState(String(item?.leadTime ?? ""));
  const [safetyFactor, setSafetyFactor] = useState(String(item?.safetyFactor ?? "1"));
  const [moq, setMoq] = useState(String(item?.moq ?? ""));
  const [baseMaxLevel, setBaseMaxLevel] = useState(String(item?.baseMaxLevel ?? ""));
  const [materialInTransit, setMaterialInTransit] = useState(String(item?.materialInTransit ?? "0"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveMax = (Number(baseMaxLevel) || 0) * (Number(safetyFactor) || 0);

  async function handleSave() {
    if (!skuCode.trim() || !itemName.trim() || !category.trim()) {
      setError("SKU Code, Item Name, and Category are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        skuCode: skuCode.trim(),
        itemName: itemName.trim(),
        category: category.trim(),
        avgDailyConsumption: Number(avgDailyConsumption) || 0,
        leadTime: Number(leadTime) || 0,
        safetyFactor: Number(safetyFactor) || 1,
        moq: Number(moq) || 0,
        baseMaxLevel: Number(baseMaxLevel) || 0,
        materialInTransit: Number(materialInTransit) || 0,
      };
      if (isEdit) {
        await api.patch(`/ims/items/${encodeURIComponent(skuCode)}`, payload);
      } else {
        await api.post("/ims/items", payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save item.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "border-2 border-on-surface bg-surface px-3 py-1.5 font-data-mono text-data-mono text-on-surface focus:outline-none w-full";
  const labelCls = "font-label-sm text-label-sm uppercase text-on-surface-variant";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-surface-container-lowest border-2 border-on-surface max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b-2 border-on-surface p-stack-md sticky top-0 bg-surface-container-lowest">
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">
            {isEdit ? "Edit Item" : "Add Item"}
          </h3>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm uppercase"
          >
            Close
          </button>
        </div>

        <div className="p-stack-lg grid grid-cols-2 gap-4">
          {error && (
            <p className="col-span-2 font-label-sm text-label-sm text-error border-2 border-error px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label className={labelCls}>SKU Code</label>
            <input
              value={skuCode}
              onChange={(e) => setSkuCode(e.target.value)}
              disabled={isEdit}
              className={`${inputCls} disabled:opacity-60`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Item Name</label>
            <input value={itemName} onChange={(e) => setItemName(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Category</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Avg Daily Consumption</label>
            <input
              type="number"
              value={avgDailyConsumption}
              onChange={(e) => setAvgDailyConsumption(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Lead Time (days)</label>
            <input type="number" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Safety Factor</label>
            <input
              type="number"
              step="0.1"
              value={safetyFactor}
              onChange={(e) => setSafetyFactor(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>MOQ</label>
            <input type="number" value={moq} onChange={(e) => setMoq(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Base Max Level</label>
            <input
              type="number"
              value={baseMaxLevel}
              onChange={(e) => setBaseMaxLevel(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Material In Transit</label>
            <input
              type="number"
              value={materialInTransit}
              onChange={(e) => setMaterialInTransit(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Effective Max Level (auto)</label>
            <p className={`${inputCls} bg-surface-container`}>{effectiveMax || 0}</p>
          </div>

          <div className="col-span-2 flex gap-2 justify-end pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border-2 border-on-surface font-label-sm text-label-sm uppercase text-on-surface hover:bg-surface-container transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
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
