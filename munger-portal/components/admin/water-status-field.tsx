"use client";

import { Droplets } from "lucide-react";
import { WATER_CONNECTION_LABELS, type WaterConnectionStatus } from "@/lib/admin-api";

export interface WaterStatusValue {
  status: WaterConnectionStatus | "";
  count: string;
}
export const EMPTY_WATER: WaterStatusValue = { status: "", count: "" };

/** "" when filled in correctly, else what is missing. */
export function waterStatusError(v: WaterStatusValue): string {
  if (!v.status) return "Select the holding's water supply status.";
  if (v.status === "multiple" && !(Number(v.count) >= 2)) return "Enter how many water connections the holding has (2 or more).";
  return "";
}

export function waterStatusPayload(v: WaterStatusValue): { waterConnectionStatus?: WaterConnectionStatus; waterConnectionCount?: number } {
  if (!v.status) return {};
  return { waterConnectionStatus: v.status, ...(v.status === "multiple" ? { waterConnectionCount: Number(v.count) } : {}) };
}

/**
 * Water supply status, chosen afresh by the Tax Collector on every field visit (not pre-filled, so it is actually
 * checked at the holding). The last recorded status is shown for reference.
 */
export function WaterStatusField({
  value,
  onChange,
  lastRecorded,
}: {
  value: WaterStatusValue;
  onChange: (v: WaterStatusValue) => void;
  lastRecorded?: string | null;
}) {
  return (
    <div className={`rounded-lg border p-3 ${value.status ? "border-slate-200" : "border-red-300 bg-red-50/40"}`}>
      <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-800" htmlFor="water-status">
        <Droplets className="h-4 w-4 text-nnm-blue" /> Water supply status <span className="text-red-600">*</span>
      </label>
      <select
        id="water-status"
        value={value.status}
        onChange={(e) => onChange({ ...value, status: e.target.value as WaterConnectionStatus | "" })}
        className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
      >
        <option value="">Select what you found at the holding</option>
        {(Object.keys(WATER_CONNECTION_LABELS) as WaterConnectionStatus[]).map((k) => (
          <option key={k} value={k}>
            {WATER_CONNECTION_LABELS[k]}
          </option>
        ))}
      </select>
      {value.status === "multiple" && (
        <input
          value={value.count}
          onChange={(e) => onChange({ ...value, count: e.target.value.replace(/\D/g, "").slice(0, 2) })}
          inputMode="numeric"
          placeholder="Number of connections (2 or more)"
          aria-label="Number of water connections"
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
        />
      )}
      {lastRecorded && (
        <p className="mt-1.5 text-xs text-slate-500">
          Last recorded: {WATER_CONNECTION_LABELS[lastRecorded as WaterConnectionStatus] ?? lastRecorded}
        </p>
      )}
    </div>
  );
}

/** Read-only label for a recorded status (reports). */
export function waterStatusLabel(status: string | null | undefined, count?: number | null): string | null {
  if (!status) return null;
  const label = WATER_CONNECTION_LABELS[status as WaterConnectionStatus] ?? status;
  return status === "multiple" && count ? `${label} (${count})` : label;
}
