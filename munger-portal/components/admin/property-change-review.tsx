"use client";

import { useState } from "react";
import { BaselineNote, ChangeLegend, changed, countChanges, OnlyChangedToggle, ReviewSections, show, type ReviewSection, type Val } from "./change-review";

type Rec = Record<string, unknown>;

export interface TaxEffect {
  current: { arv: number; annualTax: number; solidWasteCharge: number } | null;
  proposed: { arv: number; annualTax: number; solidWasteCharge: number } | null;
}

export interface HoldingBaseline {
  taken_at: string;
  property: Rec | null;
  floors: Rec[];
}

const ROAD: Record<string, string> = { PMR: "PMR - Principal Main Road", MR: "MR - Main Road", OR: "OR - Other Road" };
const sqft = (v: Val) => (v === null || v === undefined || v === "" ? "—" : `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })} sq ft`);
const rs = (v: Val) => (v === null || v === undefined || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const road = (v: Val) => (v ? ROAD[String(v)] ?? String(v) : "—");

/** [label, record column, proposal key, format] */
const FIELDS: { title: string; rows: [string, string, string, ((v: Val) => string)?][] }[] = [
  {
    title: "Owner",
    rows: [
      ["Owner name", "owner_name", "ownerName"],
      ["Relation", "relation_type", "relationType"],
      ["Relation name", "relation_name", "relationName"],
      ["Mobile number", "mobile_no", "mobileNo"],
      ["Aadhaar number", "aadhaar_number", "aadhaarNumber"],
    ],
  },
  {
    title: "Location and land record",
    rows: [
      ["Address", "address", "address"],
      ["Ward", "ward", "ward"],
      ["Zone", "zone", "zone"],
      ["Pincode", "pincode", "pincode"],
      ["Khata no.", "khata_no", "khataNo"],
      ["Khesra no.", "khesra_no", "khesraNo"],
      ["Survey sheet no.", "survey_sheet_no", "surveySheetNo"],
      ["Old holding no.", "old_holding_no", "oldHoldingNo"],
      ["Old PID", "old_pid", "oldPid"],
      ["Present holding name", "present_holding_name", "presentHoldingName"],
      ["Present category", "present_category", "presentCategory"],
    ],
  },
  {
    title: "Assessment, area and road",
    rows: [
      ["Plot area", "area_sqft", "areaSqft", sqft],
      ["Vacant area", "vacant_area_sqft", "vacantAreaSqft", sqft],
      ["Type of road", "road_type", "roadType", road],
      ["Assessment year", "assessment_year", "assessmentYear"],
      ["Holding creation year", "holding_creation_year", "holdingCreationYear"],
      ["Tax paid till year", "tax_paid_till_year", "taxPaidTillYear"],
      ["Rain water harvesting", "rain_water_harvesting", "rainWaterHarvesting"],
      ["Slum area holding", "is_slum", "isSlum"],
    ],
  },
  {
    title: "Solid waste and other charges",
    rows: [
      ["Solid waste user type", "solid_waste_charge_type", "solidWasteChargeType"],
      ["Solid waste months", "solid_waste_months", "solidWasteMonths"],
      ["Solid waste paid till", "solid_waste_paid_till_year", "solidWastePaidTillYear"],
      ["Bulk waste generator (no user charge)", "is_bwg", "isBwg"],
      ["Arrear tax", "arrear_tax", "arrearTax", rs],
      ["Penal charge", "penal_charge", "penalCharge", rs],
      ["Water charge", "water_charge", "waterCharge", rs],
      ["Boring charge", "boring_charge", "boringCharge", rs],
      ["Form fee", "form_fee", "formFee", rs],
      ["Misc. cost", "misc_cost", "miscCost", rs],
      ["Misc. cost reason", "misc_cost_reason", "miscCostReason"],
      ["Misc. rebate", "misc_rebate", "miscRebate", rs],
      ["Misc. rebate reason", "misc_rebate_reason", "miscRebateReason"],
      ["Penalty", "penalty", "penalty", rs],
      ["Outstanding demand", "outstanding_demand", "outstandingDemand", rs],
    ],
  },
];

const FLOOR_COLS: [string, string, string, ((v: Val) => string)?][] = [
  ["Built-up", "buildup_sqft", "buildupSqft", sqft],
  ["Construction", "const_type", "constType"],
  ["Usage", "usage_type", "usageType"],
  ["Occupancy", "occupancy", "occupancy"],
  ["Year built", "year_built", "yearBuilt"],
  ["Closing year", "closing_year", "closingYear"],
];

type FloorPair = { label: string; before: Rec | null; after: Rec | null };

function pairFloors(before: Rec[], after: Rec[]): FloorPair[] {
  const key = (s: unknown) => String(s ?? "").trim().toLowerCase();
  const left = [...before];
  const out: FloorPair[] = [];
  for (const a of after) {
    const i = left.findIndex((b) => key(b.floor_label) === key(a.floorLabel));
    const b = i >= 0 ? left.splice(i, 1)[0]! : null;
    out.push({ label: String(a.floorLabel ?? ""), before: b, after: a });
  }
  for (const b of left) out.push({ label: String(b.floor_label ?? ""), before: b, after: null });
  return out;
}

function FloorsTable({ pairs, onlyChanged }: { pairs: FloorPair[]; onlyChanged: boolean }) {
  const rowChanged = (p: FloorPair) => !p.before || !p.after || FLOOR_COLS.some(([, bk, ak]) => changed(p.before![bk] as Val, p.after![ak] as Val));
  const rows = onlyChanged ? pairs.filter(rowChanged) : pairs;
  const total = (side: "before" | "after") => pairs.reduce((t, p) => t + Number((side === "before" ? p.before?.buildup_sqft : p.after?.buildupSqft) ?? 0), 0);
  const tb = total("before");
  const ta = total("after");
  const n = pairs.filter(rowChanged).length;
  if (rows.length === 0 && onlyChanged) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Floors</h3>
        {n > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{n} changed</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Floor</th>
              {FLOOR_COLS.map(([l]) => (
                <th key={l} className="px-3 py-2 font-medium">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const added = !p.before;
              const removed = !p.after;
              return (
                <tr key={`${p.label}-${i}`} className={`border-t border-slate-100 ${added ? "bg-green-50" : removed ? "bg-red-50" : rowChanged(p) ? "bg-amber-50" : ""}`}>
                  <td className={`px-3 py-2 font-medium ${removed ? "text-red-700 line-through" : added ? "text-green-800" : "text-slate-800"}`}>
                    {p.label}
                    {added && <span className="ml-1 rounded bg-green-200 px-1 text-[10px] font-semibold text-green-900 no-underline">NEW</span>}
                    {removed && <span className="ml-1 rounded bg-red-200 px-1 text-[10px] font-semibold text-red-900">REMOVED</span>}
                  </td>
                  {FLOOR_COLS.map(([l, bk, ak, f]) => {
                    const b = p.before?.[bk] as Val;
                    const a = p.after?.[ak] as Val;
                    if (added) return <td key={l} className="px-3 py-2 font-semibold text-green-800">{show(a, f)}</td>;
                    if (removed) return <td key={l} className="px-3 py-2 text-red-700 line-through">{show(b, f)}</td>;
                    return (
                      <td key={l} className="px-3 py-2">
                        {changed(b, a) ? (
                          <span className="inline-flex flex-wrap gap-1">
                            <span className="text-red-700 line-through">{show(b, f)}</span>
                            <span className="font-semibold text-green-800">{show(a, f)}</span>
                          </span>
                        ) : (
                          show(a, f)
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="border-t border-slate-200 bg-slate-50 text-xs">
              <td className="px-3 py-2 font-semibold">Total built-up</td>
              <td className="px-3 py-2" colSpan={FLOOR_COLS.length}>
                {changed(tb, ta) ? (
                  <span className="inline-flex gap-1.5">
                    <span className="text-red-700 line-through">{sqft(tb)}</span>
                    <span className="font-semibold text-green-800">{sqft(ta)}</span>
                  </span>
                ) : (
                  sqft(ta)
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TaxEffectTable({ t }: { t: TaxEffect | null | undefined }) {
  if (!t || (!t.current && !t.proposed)) return null;
  const rows: [string, keyof NonNullable<TaxEffect["current"]>][] = [
    ["ARV", "arv"],
    ["Annual holding tax", "annualTax"],
    ["Solid waste user charge (yearly)", "solidWasteCharge"],
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="bg-slate-50 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Effect on tax (current assessment year)</h3>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium" />
            <th className="px-3 py-2 text-right font-medium">Now</th>
            <th className="px-3 py-2 text-right font-medium">After change</th>
            <th className="px-3 py-2 text-right font-medium">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([l, k]) => {
            const a = t.current?.[k];
            const b = t.proposed?.[k];
            const d = a != null && b != null ? b - a : null;
            return (
              <tr key={k} className={`border-t border-slate-100 ${d ? "bg-amber-50" : ""}`}>
                <td className="px-3 py-2 text-slate-600">{l}</td>
                <td className="px-3 py-2 text-right tabular-nums">{rs(a)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{rs(b)}</td>
                <td className={`px-3 py-2 text-right font-semibold tabular-nums ${d && d > 0 ? "text-green-700" : d && d < 0 ? "text-red-700" : "text-slate-400"}`}>
                  {d == null ? "—" : d === 0 ? "no change" : `${d > 0 ? "+" : "−"}₹${Math.abs(d).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The whole holding as it stands vs. as proposed. While the request is open the comparison is with the live record
 * (what approval will change); once decided, with the snapshot taken when the request was made.
 */
export function PropertyChangeReview({
  status,
  current,
  currentFloors,
  baseline,
  proposed,
  taxEffect,
  title = "Full holding details - changes highlighted",
}: {
  status: string;
  current: Rec | null | undefined;
  currentFloors: Rec[] | null | undefined;
  baseline: HoldingBaseline | null | undefined;
  proposed: Rec;
  taxEffect?: TaxEffect | null;
  title?: string;
}) {
  const [onlyChanged, setOnlyChanged] = useState(false);
  const open = status === "pending" || status === "reverted";
  const useBaseline = !open && !!baseline?.property;
  const before: Rec = (useBaseline ? baseline!.property : current) ?? {};
  const beforeFloors: Rec[] = (useBaseline ? baseline!.floors : currentFloors) ?? [];
  const fmtDate = (s: unknown) => (s ? new Date(String(s)).toLocaleDateString("en-IN") : "");

  let note: string | null = null;
  if (useBaseline) note = `Compared with the holding as it was when this request was made (${fmtDate(baseline!.taken_at)}).`;
  else if (!open) note = "This request is older than the before-snapshots, so it is compared with the holding as it is today - a change already applied may not show as changed.";
  else if (baseline?.taken_at && current?.last_modified_date && new Date(String(current.last_modified_date)) > new Date(baseline.taken_at)) {
    note = `The holding record was updated on ${fmtDate(current.last_modified_date)}, after this request was made - compared with the record as it is now.`;
  }

  const sections: ReviewSection[] = FIELDS.map((s) => ({
    title: s.title,
    rows: s.rows.map(([label, bk, ak, format]) => {
      const b = before[bk] as Val;
      // A key the proposal leaves out keeps the stored value.
      const a = proposed[ak] === undefined ? b : (proposed[ak] as Val);
      return { label, before: b, after: a, format };
    }),
  }));
  const afterFloors = Array.isArray(proposed.floors) ? (proposed.floors as Rec[]) : null;
  const pairs = afterFloors ? pairFloors(beforeFloors, afterFloors) : beforeFloors.map((b) => ({ label: String(b.floor_label ?? ""), before: b, after: toProposedFloor(b) }));
  const floorChanges = pairs.filter((p) => !p.before || !p.after || FLOOR_COLS.some(([, bk, ak]) => changed(p.before![bk] as Val, p.after![ak] as Val))).length;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <ChangeLegend />
      </div>
      <OnlyChangedToggle value={onlyChanged} onChange={setOnlyChanged} count={countChanges(sections) + floorChanges} />
      <BaselineNote text={note} />
      <TaxEffectTable t={taxEffect} />
      <ReviewSections sections={sections} onlyChanged={onlyChanged} />
      <FloorsTable pairs={pairs} onlyChanged={onlyChanged} />
    </section>
  );
}

function toProposedFloor(b: Rec): Rec {
  return {
    floorLabel: b.floor_label,
    buildupSqft: b.buildup_sqft,
    constType: b.const_type,
    usageType: b.usage_type,
    occupancy: b.occupancy,
    yearBuilt: b.year_built,
    closingYear: b.closing_year,
  };
}
