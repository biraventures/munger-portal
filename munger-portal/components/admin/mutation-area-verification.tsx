"use client";

import type { AreaVerification, AreaVerificationBody } from "@/lib/admin-api";
import { SURVEY_WARDS } from "@/lib/mutation-api";

export const AREA_TOLERANCE_SQFT = 1;

export interface VerificationDraft {
  jamabandiAreaSqft: string;
  documentAreaSqft: string;
  holdingAreaSqft: string;
  /** Ticked: the entire holding is mutated. */
  entire: boolean;
  mutateAreaSqft: string;
  khataNo: string;
  khesraNo: string;
  surveySheetNo: string;
  surveyWard: string;
  remarks: string;
  /** Floor-wise mutation: the floors the applicant is buying (labels); null = the whole building. */
  floors?: string[] | null;
}

export const floorName = (label: string) => label.split(" - ")[0]!;

export function areasOf(v: VerificationDraft): number[] {
  return [v.jamabandiAreaSqft, v.documentAreaSqft, v.holdingAreaSqft].map((x) => Number(x));
}

/** Area being mutated: the holding's area when the entire holding is mutated. */
export function mutateArea(v: VerificationDraft): number {
  return v.entire ? Number(v.holdingAreaSqft) : Number(v.mutateAreaSqft);
}

export function isPartial(v: VerificationDraft): boolean {
  return !!v.floors?.length || (!v.entire && mutateArea(v) < Number(v.holdingAreaSqft) - AREA_TOLERANCE_SQFT);
}

/** Entire holding: jamabandi = document = holding. Part: jamabandi = document = area being mutated. */
export function areasMatch(v: VerificationDraft): boolean {
  const [j, d, h] = areasOf(v) as [number, number, number];
  const compared = isPartial(v) ? [j, d, mutateArea(v)] : [j, d, h];
  return Math.max(...compared) - Math.min(...compared) <= AREA_TOLERANCE_SQFT;
}

export function verificationProblem(v: VerificationDraft): string | null {
  const a = areasOf(v);
  if (a.some((x) => !(x > 0))) return "Enter all three areas in sq ft.";
  if (!v.entire && !(Number(v.mutateAreaSqft) > 0) && !(v.floors?.length && v.mutateAreaSqft.trim() !== "" && Number(v.mutateAreaSqft) === 0)) {
    return v.floors?.length ? "Enter the land area being transferred (0 if the land stays with the seller)." : "Enter the area being mutated, or tick 'Entire holding'.";
  }
  if (mutateArea(v) > Number(v.holdingAreaSqft) + AREA_TOLERANCE_SQFT) return "The area being mutated cannot be more than the holding's area.";
  if (!v.khataNo.trim() || !v.khesraNo.trim() || !v.surveySheetNo.trim() || !v.surveyWard) return "Enter the khata, khesra, survey sheet number and survey ward.";
  if (!areasMatch(v) && v.remarks.trim().length < 5) return "The areas do not match — explain the difference in the remarks.";
  return null;
}

export function toBody(v: VerificationDraft): AreaVerificationBody {
  const [jamabandiAreaSqft, documentAreaSqft, holdingAreaSqft] = areasOf(v) as [number, number, number];
  return {
    jamabandiAreaSqft,
    documentAreaSqft,
    holdingAreaSqft,
    mutateAreaSqft: v.entire ? null : Number(v.mutateAreaSqft),
    khataNo: v.khataNo,
    khesraNo: v.khesraNo,
    surveySheetNo: v.surveySheetNo,
    surveyWard: v.surveyWard,
    remarks: v.remarks || null,
  };
}

const input = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const label = "mb-1 block text-xs font-medium text-slate-600";

/** Tax Daroga: areas (jamabandi / transfer document / holding) and the land-record details, before forwarding a mutation. */
export function AreaVerificationForm({ value, onChange, recordArea }: { value: VerificationDraft; onChange: (v: VerificationDraft) => void; recordArea: string | null }) {
  const set = (k: keyof VerificationDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value });
  const a = areasOf(value);
  const filled = a.every((x) => x > 0) && (value.entire || Number(value.mutateAreaSqft) > 0 || (!!value.floors?.length && value.mutateAreaSqft.trim() !== ""));
  const match = filled && areasMatch(value);
  const partial = filled && isPartial(value);
  return (
    <div className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">Area &amp; land record verification (required to forward)</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={label}>Area as in jamabandi (sq ft)</label>
          <input type="number" min="0" step="0.01" inputMode="decimal" value={value.jamabandiAreaSqft} onChange={set("jamabandiAreaSqft")} className={input} />
        </div>
        <div>
          <label className={label}>Area as in sale deed / other document (sq ft)</label>
          <input type="number" min="0" step="0.01" inputMode="decimal" value={value.documentAreaSqft} onChange={set("documentAreaSqft")} className={input} />
        </div>
        <div>
          <label className={label}>Total area in holding details (sq ft)</label>
          <input type="number" min="0" step="0.01" inputMode="decimal" value={value.holdingAreaSqft} onChange={set("holdingAreaSqft")} className={input} />
          {recordArea && <p className="mt-0.5 text-[11px] text-slate-400">Holding record shows {recordArea} sq ft</p>}
        </div>
      </div>
      {!!value.floors?.length && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <b>Floor-wise mutation:</b> the applicant is buying only {value.floors.map(floorName).join(", ")}. These floors go to a new MMC holding; the
          other floors stay with the present holding. Enter the land area that goes with them (0 when the land stays with the seller).
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label className={label}>{value.floors?.length ? "Land area being transferred (sq ft)" : "Area being mutated (sq ft)"}</label>
          <label className="mb-1 flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={value.entire} onChange={(e) => onChange({ ...value, entire: e.target.checked })} /> {value.floors?.length ? "Entire land" : "Entire holding"}
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            disabled={value.entire}
            value={value.entire ? value.holdingAreaSqft : value.mutateAreaSqft}
            onChange={set("mutateAreaSqft")}
            className={`${input} disabled:bg-slate-100`}
          />
        </div>
        {partial && (
          <p className="self-end rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900 sm:col-span-2">
            Partial mutation: on final approval the holding continues with {(Number(value.holdingAreaSqft) - mutateArea(value)).toLocaleString("en-IN")} sq ft
            {value.floors?.length ? " and its remaining floors" : ""}, and a new MMC holding of {mutateArea(value).toLocaleString("en-IN")} sq ft
            {value.floors?.length ? ` with ${value.floors.map(floorName).join(", ")}` : ""} is created for the new owner. Jamabandi and document areas are
            compared with the part being mutated.
          </p>
        )}
      </div>
      {filled && (
        <p className={`rounded-md px-3 py-1.5 text-xs font-semibold ${match ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {match ? "✓ The areas match." : "✗ The areas do not match — explain the difference below."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className={label}>Khata no.</label>
          <input value={value.khataNo} onChange={set("khataNo")} maxLength={64} className={input} />
        </div>
        <div>
          <label className={label}>Khesra no.</label>
          <input value={value.khesraNo} onChange={set("khesraNo")} maxLength={64} className={input} />
        </div>
        <div>
          <label className={label}>Survey sheet no.</label>
          <input value={value.surveySheetNo} onChange={set("surveySheetNo")} maxLength={64} className={input} />
        </div>
        <div>
          <label className={label}>Survey ward</label>
          <select value={value.surveyWard} onChange={set("surveyWard")} className={input}>
            <option value="">—</option>
            {SURVEY_WARDS.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={label}>Remarks{filled && !match ? " (required — why the areas differ)" : " (optional)"}</label>
        <textarea value={value.remarks} onChange={set("remarks")} rows={2} maxLength={1000} className={input} />
      </div>
    </div>
  );
}

/** The recorded verification, for every desk after the Tax Daroga. */
export function AreaVerificationView({ v }: { v: AreaVerification }) {
  return (
    <section className={`rounded-xl border p-6 ${v.areas_match ? "border-green-200 bg-white" : "border-red-300 bg-red-50"}`}>
      <h2 className="mb-3 text-base font-semibold text-slate-900">Area &amp; land record verification</h2>
      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Jamabandi area</span>
          {Number(v.jamabandi_area_sqft).toLocaleString("en-IN")} sq ft
        </div>
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Document area</span>
          {Number(v.document_area_sqft).toLocaleString("en-IN")} sq ft
        </div>
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Holding area</span>
          {Number(v.holding_area_sqft).toLocaleString("en-IN")} sq ft
        </div>
      </div>
      {v.is_partial && (
        <p className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
          Partial mutation: {v.mutate_floors?.length ? <><b>{v.mutate_floors.map(floorName).join(", ")}</b> with </> : null}
          <b>{Number(v.mutate_area_sqft).toLocaleString("en-IN")} sq ft</b> of {Number(v.holding_area_sqft).toLocaleString("en-IN")} sq ft land
          transferred — a new MMC holding is created on final approval.
        </p>
      )}
      <p className={`mt-3 text-sm font-semibold ${v.areas_match ? "text-green-700" : "text-red-700"}`}>
        {v.areas_match ? "✓ Areas match" : "✗ Areas differ"}
        {v.remarks ? ` — “${v.remarks}”` : ""}
      </p>
      <p className="mt-2 text-sm text-slate-700">
        Khata <b>{v.khata_no}</b> · Khesra <b>{v.khesra_no}</b> · Survey sheet <b>{v.survey_sheet_no}</b> · Survey ward <b>{v.survey_ward}</b>
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Verified by {v.verified_by} on {new Date(v.verified_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
      </p>
    </section>
  );
}
