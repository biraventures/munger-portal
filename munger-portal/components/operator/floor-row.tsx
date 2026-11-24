"use client";

import { Trash2 } from "lucide-react";
import { FinancialYearSelect } from "./financial-year-select";

export interface FloorFormState {
  key: string; // client-only, for React list keys — not sent to the API
  floorLabel: string;
  buildupSqft: string;
  constType: "RCC" | "Asbestos" | "Other";
  usageType: string;
  occupancy: "self" | "rented";
  yearBuilt: string;
  closingYear: string;
  /** Floor changes: the recorded floor this row comes from (set when the holding is loaded; several rows = a split). */
  source?: FloorSnapshot | null;
  /** Floor changes: how this row's change applies. */
  changeKind?: "" | "from_year" | "correction";
  changeYear?: string;
}

/** A recorded floor, as it was when the holding was loaded. */
export interface FloorSnapshot {
  floorLabel: string;
  buildupSqft: string | number;
  constType: string;
  usageType: string;
  occupancy: string;
  yearBuilt: string | null;
  closingYear: string | null;
}

export function snapshotOfRow(f: FloorFormState): FloorSnapshot {
  return {
    floorLabel: f.floorLabel,
    buildupSqft: f.buildupSqft,
    constType: f.constType,
    usageType: f.usageType,
    occupancy: f.occupancy,
    yearBuilt: f.yearBuilt || null,
    closingYear: f.closingYear || null,
  };
}

// Value strings are what actually gets stored/sent — "Ground Floor - 0"
// specifically must stay exactly this, since taxCalculation.service.ts
// on the backend matches this exact string to detect the ground floor
// for vacant-land calculations. The rest are free to be whatever's
// readable, since nothing else keys off them.
export const FLOOR_LABEL_OPTIONS: { value: string; label: string }[] = [
  { value: "Basement - B", label: "Basement" },
  { value: "Ground Floor - 0", label: "Ground Floor" },
  { value: "First Floor - 1", label: "1st Floor" },
  { value: "Second Floor - 2", label: "2nd Floor" },
  { value: "Third Floor - 3", label: "3rd Floor" },
  { value: "Fourth Floor - 4", label: "4th Floor" },
  { value: "Fifth Floor - 5", label: "5th Floor" },
  { value: "Sixth Floor - 6", label: "6th Floor" },
  { value: "Seventh Floor - 7", label: "7th Floor" },
  { value: "Eighth Floor - 8", label: "8th Floor" },
];

export function makeBlankFloor(index: number): FloorFormState {
  return {
    key: `floor-${Date.now()}-${index}`,
    floorLabel: FLOOR_LABEL_OPTIONS[Math.min(index, FLOOR_LABEL_OPTIONS.length - 1)]!.value,
    buildupSqft: "",
    constType: "RCC",
    usageType: "",
    occupancy: "self",
    yearBuilt: "",
    closingYear: "",
  };
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

const currentYear = new Date().getFullYear();

export function FloorRow({
  floor,
  usageTypes,
  onChange,
  onRemove,
  removable,
  previewResult,
}: {
  floor: FloorFormState;
  usageTypes: string[];
  onChange: (next: FloorFormState) => void;
  onRemove: () => void;
  removable: boolean;
  /** Set once "Calculate ARV & Tax" has run — this floor's own ARV/tax from that calculation. */
  previewResult?: { floorArv?: string; floorTax?: string; error?: string | null; demolished?: boolean };
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <select
          value={floor.floorLabel}
          onChange={(e) => onChange({ ...floor, floorLabel: e.target.value })}
          className={`${inputClass} max-w-xs font-medium`}
        >
          {FLOOR_LABEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          {previewResult && (
            <span className="rounded-md bg-blue-50 px-2.5 py-1 font-mono text-xs text-nnm-blue">
              {previewResult.error
                ? previewResult.error
                : previewResult.demolished
                  ? "Demolished — excluded from total"
                  : `ARV ₹${Number(previewResult.floorArv ?? 0).toLocaleString("en-IN")} · Tax ₹${Number(previewResult.floorTax ?? 0).toLocaleString("en-IN")}`}
            </span>
          )}
          {removable && (
            <button type="button" onClick={onRemove} aria-label="Remove floor" className="rounded-md p-1.5 text-red-500 hover:bg-red-50">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Buildup area (sqft)</label>
          <input
            type="number"
            min="0"
            value={floor.buildupSqft}
            onChange={(e) => onChange({ ...floor, buildupSqft: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Construction type</label>
          <select
            value={floor.constType}
            onChange={(e) => onChange({ ...floor, constType: e.target.value as FloorFormState["constType"] })}
            className={inputClass}
          >
            <option value="RCC">RCC</option>
            <option value="Asbestos">Asbestos</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Occupancy</label>
          <select
            value={floor.occupancy}
            onChange={(e) => onChange({ ...floor, occupancy: e.target.value as FloorFormState["occupancy"] })}
            className={inputClass}
          >
            <option value="self">Self-occupied</option>
            <option value="rented">Rented</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <label className={labelClass}>Usage</label>
          <select value={floor.usageType} onChange={(e) => onChange({ ...floor, usageType: e.target.value })} className={inputClass}>
            <option value="">Select usage…</option>
            {usageTypes.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Year built</label>
          <FinancialYearSelect
            value={floor.yearBuilt}
            onChange={(v) => onChange({ ...floor, yearBuilt: v })}
            startYear={1950}
            endYear={currentYear + 1}
            allowBlank
            blankLabel="Original / unknown"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Closing year (if demolished)</label>
          <FinancialYearSelect
            value={floor.closingYear}
            onChange={(v) => onChange({ ...floor, closingYear: v })}
            startYear={1950}
            endYear={currentYear + 1}
            allowBlank
            blankLabel="Still standing"
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}
