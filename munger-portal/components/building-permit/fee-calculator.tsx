"use client";

import { useMemo, useState } from "react";
import { Calculator, Plus, Trash2 } from "lucide-react";
import { computeFees, FEE_RATES, rupees, SQFT_PER_SQM, SQM_PER_HECTARE, USE_TYPES } from "@/lib/building-permit-api";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

export interface CalculatorFigures {
  useType: string;
  plotAreaSqm: number;
  floors: { floor: string; areaSqm: number }[];
}

type AreaUnit = "sqm" | "sqft";
const toSqm = (v: number, unit: AreaUnit | "ha") => (unit === "sqft" ? v / SQFT_PER_SQM : unit === "ha" ? v * SQM_PER_HECTARE : v);
const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const DEFAULT_FLOORS = ["Ground floor", "First floor", "Second floor", "Third floor", "Fourth floor", "Fifth floor"];

/** Development fee + permit fee + labour cess - the same rules the office applies. */
export function FeeCalculator({ onApply }: { onApply?: (f: CalculatorFigures) => void }) {
  const [useType, setUseType] = useState("residential");
  const [plot, setPlot] = useState("");
  const [plotUnit, setPlotUnit] = useState<AreaUnit | "ha">("sqm");
  const [areaUnit, setAreaUnit] = useState<AreaUnit>("sqm");
  const [floors, setFloors] = useState([{ floor: "Ground floor", area: "" }]);

  const plotSqm = toSqm(num(plot), plotUnit);
  const floorsSqm = floors.map((f) => ({ floor: f.floor, areaSqm: Math.round(toSqm(num(f.area), areaUnit) * 100) / 100 }));
  const builtUp = Math.round(floorsSqm.reduce((t, f) => t + f.areaSqm, 0) * 100) / 100;
  const fees = useMemo(() => computeFees(useType, plotSqm, builtUp), [useType, plotSqm, builtUp]);
  const ready = plotSqm > 0 && builtUp > 0;
  const devReason =
    useType === "residential"
      ? plotSqm <= FEE_RATES.residentialPlotLimitSqm
        ? "Residential, plot up to 5 hectare"
        : "Residential, plot above 5 hectare"
      : "Non-residential use";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
        <div>
          <label htmlFor="calc-use" className={labelClass}>
            Use of the building
          </label>
          <select id="calc-use" value={useType} onChange={(e) => setUseType(e.target.value)} className={inputClass}>
            {USE_TYPES.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="calc-plot" className={labelClass}>
            Plot area
          </label>
          <div className="flex gap-2">
            <input id="calc-plot" inputMode="decimal" value={plot} onChange={(e) => setPlot(e.target.value.replace(/[^\d.]/g, ""))} className={inputClass} placeholder="e.g. 250" />
            <select aria-label="Plot area unit" value={plotUnit} onChange={(e) => setPlotUnit(e.target.value as AreaUnit | "ha")} className="rounded-md border border-slate-300 bg-white px-2 text-sm">
              <option value="sqm">sq m</option>
              <option value="sqft">sq ft</option>
              <option value="ha">hectare</option>
            </select>
          </div>
          {plotUnit !== "sqm" && plotSqm > 0 && <p className="mt-1 text-xs text-slate-500">= {plotSqm.toFixed(2)} sq m</p>}
        </div>

        <div className="sm:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <span className={labelClass}>Built-up area, floor-wise</span>
            <select aria-label="Built-up area unit" value={areaUnit} onChange={(e) => setAreaUnit(e.target.value as AreaUnit)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
              <option value="sqm">sq m</option>
              <option value="sqft">sq ft</option>
            </select>
          </div>
          <div className="space-y-2">
            {floors.map((f, i) => (
              <div key={i} className="flex gap-2">
                <input
                  aria-label={`Floor ${i + 1} name`}
                  value={f.floor}
                  onChange={(e) => setFloors(floors.map((x, j) => (j === i ? { ...x, floor: e.target.value } : x)))}
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <input
                  aria-label={`${f.floor} built-up area`}
                  inputMode="decimal"
                  value={f.area}
                  onChange={(e) => setFloors(floors.map((x, j) => (j === i ? { ...x, area: e.target.value.replace(/[^\d.]/g, "") } : x)))}
                  placeholder={areaUnit === "sqm" ? "sq m" : "sq ft"}
                  className={`${inputClass} !w-28 shrink-0`}
                />
                {floors.length > 1 && (
                  <button type="button" onClick={() => setFloors(floors.filter((_, j) => j !== i))} aria-label="Remove floor" className="rounded-md border border-slate-200 px-2 text-slate-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {floors.length < 30 && (
            <button
              type="button"
              onClick={() => setFloors([...floors, { floor: DEFAULT_FLOORS[floors.length] ?? `Floor ${floors.length}`, area: "" }])}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-nnm-blue"
            >
              <Plus className="h-3.5 w-3.5" /> Add floor
            </button>
          )}
          <p className="mt-2 text-sm text-slate-700">
            Total built-up area: <b>{builtUp.toFixed(2)} sq m</b>
            {areaUnit === "sqft" && builtUp > 0 ? ` (${(builtUp * SQFT_PER_SQM).toFixed(0)} sq ft)` : ""}
          </p>
        </div>
      </div>

      <div className="rounded-xl border-2 border-nnm-blue bg-white p-5">
        <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
          <Calculator className="h-5 w-5" /> Fee to be paid
        </h3>
        {!ready ? (
          <p className="text-sm text-slate-500">Enter the plot area and the built-up area to see the fee.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-2">
                  Development fee
                  <span className="block text-xs text-slate-500">{devReason}</span>
                </td>
                <td className="py-2 text-right tabular-nums">{rupees(fees.development)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2">
                  Permit fee
                  <span className="block text-xs text-slate-500">
                    {builtUp.toFixed(2)} sq m × ₹{FEE_RATES.permitPerSqm}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{rupees(fees.permit)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2">
                  Labour cess
                  <span className="block text-xs text-slate-500">
                    {builtUp.toFixed(2)} sq m × ₹{FEE_RATES.labourCessPerSqm}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{rupees(fees.labourCess)}</td>
              </tr>
              <tr>
                <td className="pt-3 text-base font-semibold">Total</td>
                <td className="pt-3 text-right text-lg font-bold tabular-nums text-nnm-blue">{rupees(fees.total)}</td>
              </tr>
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-slate-500">
          This is an estimate from the figures you entered. The final amount is fixed by the office after technical scrutiny of the drawing, and is paid only then.
        </p>
        {onApply && ready && (
          <button
            type="button"
            onClick={() => onApply({ useType, plotAreaSqm: Math.round(plotSqm * 100) / 100, floors: floorsSqm.filter((f) => f.areaSqm > 0) })}
            className="mt-4 w-full rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark"
          >
            Apply for building plan permit with these figures
          </button>
        )}
      </div>
    </div>
  );
}
