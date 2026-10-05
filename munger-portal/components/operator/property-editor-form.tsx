"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Calculator, Clock, Plus, Hash } from "lucide-react";
import { FloorRow, makeBlankFloor, type FloorFormState } from "./floor-row";
import { sanitizeOldHoldingNoInput } from "@/lib/holding-no";
import { FinancialYearSelect } from "./financial-year-select";
import { saveProperty, createNewEntryProperty, previewPropertyTax, type FormOptions, type SaveError, type SavePropertyApiResult, type TaxPreviewResult } from "@/lib/operator-api";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

interface MasterFormState {
  ownerName: string;
  relationType: string;
  relationName: string;
  mobileNo: string;
  areaSqft: string;
  address: string;
  ward: string;
  zone: string;
  pincode: string;
  assessmentYear: string;
  roadType: "PMR" | "MR" | "OR";
  vacantAreaSqft: string;
  rainWaterHarvesting: boolean;
  solidWasteChargeType: string;
  solidWasteMonths: string;
  isBwg: boolean;
  holdingCreationYear: string;
  taxPaidTillYear: string;
  miscCost: string;
  miscCostReason: string;
  miscRebate: string;
  miscRebateReason: string;
  /** The old/legacy MUNG- holding number, once discovered for an MMC-/MUNGMC- holding — distinct from oldPid below. */
  oldHoldingNo: string;
  /** A separate legacy system identifier, if any — not the same as the old holding number above. */
  oldPid: string;
  khesraNo: string;
  surveySheetNo: string;
  khataNo: string;
  aadhaarNumber: string;
  /** Current actual on-ground name/category of the holding — descriptive only, not used in tax calculation. */
  presentHoldingName: string;
  presentCategory: string;
  changeBasis: string;
  changeReference: string;
}

function blankMaster(defaultFinancialYear: string): MasterFormState {
  return {
    ownerName: "",
    relationType: "",
    relationName: "",
    mobileNo: "",
    areaSqft: "",
    address: "",
    ward: "",
    zone: "",
    pincode: "",
    assessmentYear: defaultFinancialYear,
    roadType: "PMR",
    vacantAreaSqft: "",
    rainWaterHarvesting: false,
    solidWasteChargeType: "",
    solidWasteMonths: "12",
    isBwg: false,
    holdingCreationYear: defaultFinancialYear,
    taxPaidTillYear: "",
    miscCost: "",
    miscCostReason: "",
    miscRebate: "",
    miscRebateReason: "",
    oldHoldingNo: "",
    oldPid: "",
    khesraNo: "",
    surveySheetNo: "",
    khataNo: "",
    aadhaarNumber: "",
    presentHoldingName: "",
    presentCategory: "",
    changeBasis: "",
    changeReference: "",
  };
}

interface SaveResult {
  holdingNo?: string;
  taxCalc: { netTax: string; currentTax: string; arv: string };
  solidWasteCharge: number;
  pendingChangeRequestId?: number;
}

export function PropertyEditorForm({
  holdingNo,
  isEditing,
  autoAssign,
  initialMaster,
  initialFloors,
  existingArrears,
  formOptions,
  onSaved,
}: {
  holdingNo?: string;
  isEditing: boolean;
  /** When true, POSTs to /api/v1/properties (holding number auto-assigned as a "new" entry) instead of /api/v1/properties/:holdingNo. */
  autoAssign?: boolean;
  initialMaster?: Partial<MasterFormState>;
  initialFloors?: FloorFormState[];
  /** Pending arrears/penalty as of when this property was loaded — DB-derived, not part of the live Calculate preview. See page.tsx's mapToFormState. */
  existingArrears?: { totalPending: string; penalty: string };
  formOptions: FormOptions;
  onSaved: (holdingNo: string) => void;
}) {
  const currentYear = new Date().getFullYear();
  const defaultAssessmentYear = `${currentYear}-${currentYear + 1}`;

  const [master, setMaster] = useState<MasterFormState>({
    ...blankMaster(defaultAssessmentYear),
    ...initialMaster,
  });
  const [floors, setFloors] = useState<FloorFormState[]>(initialFloors?.length ? initialFloors : [makeBlankFloor(0)]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<SaveError | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [preview, setPreview] = useState<TaxPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  function updateMaster<K extends keyof MasterFormState>(key: K, value: MasterFormState[K]) {
    setMaster((m) => ({ ...m, [key]: value }));
  }

  function updateFloor(index: number, next: FloorFormState) {
    setFloors((fs) => fs.map((f, i) => (i === index ? next : f)));
  }

  function removeFloor(index: number) {
    setFloors((fs) => fs.filter((_, i) => i !== index));
  }

  function addFloor() {
    setFloors((fs) => [...fs, makeBlankFloor(fs.length)]);
  }

  async function handleCalculatePreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const preview = await previewPropertyTax({
        areaSqft: Number(master.areaSqft) || 0,
        roadType: master.roadType,
        rainWaterHarvesting: master.rainWaterHarvesting,
        assessmentYear: master.assessmentYear,
        solidWasteChargeType: master.solidWasteChargeType || null,
        solidWasteMonths: Number(master.solidWasteMonths) || 12,
        isBwg: master.isBwg,
        floors: floors.map((f) => ({
          floorLabel: f.floorLabel,
          buildupSqft: Number(f.buildupSqft) || 0,
          constType: f.constType,
          usageType: f.usageType,
          occupancy: f.occupancy,
          yearBuilt: f.yearBuilt || null,
          closingYear: f.closingYear || null,
        })),
      });
      setPreview(preview);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Could not calculate preview.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (isEditing && (!master.changeBasis || !master.changeReference.trim())) {
      setError({ message: "Change basis and a reference/remark are required when editing an existing holding." });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ownerName: master.ownerName,
        relationType: master.relationType || null,
        relationName: master.relationName || null,
        mobileNo: master.mobileNo || null,
        areaSqft: Number(master.areaSqft) || 0,
        address: master.address,
        ward: master.ward || null,
        zone: master.zone || null,
        pincode: master.pincode || null,
        assessmentYear: master.assessmentYear,
        roadType: master.roadType,
        vacantAreaSqft: Number(master.vacantAreaSqft) || 0,
        rainWaterHarvesting: master.rainWaterHarvesting,
        solidWasteChargeType: master.solidWasteChargeType || null,
        solidWasteMonths: Number(master.solidWasteMonths) || 12,
        isBwg: master.isBwg,
        holdingCreationYear: master.holdingCreationYear,
        taxPaidTillYear: master.taxPaidTillYear || null,
        miscCost: Number(master.miscCost) || 0,
        miscCostReason: master.miscCostReason || null,
        miscRebate: Number(master.miscRebate) || 0,
        miscRebateReason: master.miscRebateReason || null,
        oldHoldingNo: master.oldHoldingNo || null,
        oldPid: master.oldPid || null,
        khesraNo: master.khesraNo || null,
        surveySheetNo: master.surveySheetNo || null,
        khataNo: master.khataNo || null,
        aadhaarNumber: master.aadhaarNumber || null,
        presentHoldingName: master.presentHoldingName || null,
        presentCategory: master.presentCategory || null,
        changeBasis: isEditing ? master.changeBasis : null,
        changeReference: isEditing ? master.changeReference : null,
        floors: floors.map((f) => ({
          floorLabel: f.floorLabel,
          buildupSqft: Number(f.buildupSqft) || 0,
          constType: f.constType,
          usageType: f.usageType,
          occupancy: f.occupancy,
          yearBuilt: f.yearBuilt || null,
          closingYear: f.closingYear || null,
        })),
      };

      if (autoAssign) {
        const saved = await createNewEntryProperty({ holdingEntryMode: "new", ...payload });
        setResult({ holdingNo: saved.holdingNo, taxCalc: saved.taxCalc as SaveResult["taxCalc"], solidWasteCharge: saved.solidWasteCharge });
        onSaved(saved.holdingNo);
      } else {
        if (!holdingNo) throw { message: "Holding number is missing." } as SaveError;
        const saved: SavePropertyApiResult = await saveProperty(holdingNo, payload);
        if (saved.applied) {
          setResult({ holdingNo: saved.holdingNo, taxCalc: saved.taxCalc, solidWasteCharge: saved.solidWasteCharge });
        } else {
          setResult({
            holdingNo: saved.holdingNo,
            taxCalc: saved.preview.taxCalc,
            solidWasteCharge: saved.preview.solidWasteCharge,
            pendingChangeRequestId: saved.changeRequestId,
          });
        }
        onSaved(holdingNo);
      }
    } catch (err) {
      setError(err as SaveError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="sticky top-2 z-10 rounded-xl border border-nnm-blue bg-white p-4 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">ARV</span>
              <span className="block font-mono text-base font-semibold text-slate-900">
                {preview ? `₹${Number(preview.taxCalc.arv).toLocaleString("en-IN")}` : "—"}
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Current Year Tax</span>
              <span className="block font-mono text-base font-semibold text-nnm-blue">
                {preview ? `₹${Number(preview.taxCalc.netTax).toLocaleString("en-IN")}` : "—"}
              </span>
            </div>
            {existingArrears && Number(existingArrears.totalPending) > 0 && (
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-red-500">
                  Pending Arrears (as of last search)
                </span>
                <span className="block font-mono text-base font-semibold text-red-600">
                  ₹{Number(existingArrears.totalPending).toLocaleString("en-IN")}
                  {Number(existingArrears.penalty) > 0 && (
                    <span className="ml-1 text-xs font-normal text-red-500">
                      + ₹{Number(existingArrears.penalty).toLocaleString("en-IN")} penalty
                    </span>
                  )}
                </span>
              </div>
            )}
            {!master.isBwg && master.solidWasteChargeType && formOptions.solidWasteRates[master.solidWasteChargeType] !== undefined && (
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Solid Waste ({formOptions.solidWasteRates[master.solidWasteChargeType]}/mo)
                </span>
                <span className="block font-mono text-base font-semibold text-slate-900">
                  ₹
                  {(
                    formOptions.solidWasteRates[master.solidWasteChargeType]! * (Number(master.solidWasteMonths) || 12)
                  ).toLocaleString("en-IN")}
                  <span className="ml-1 text-xs font-normal text-slate-400">
                    for {master.solidWasteMonths || 12} mo
                  </span>
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleCalculatePreview}
            disabled={previewLoading}
            className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-4 py-2 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            <Calculator className="h-3.5 w-3.5" />
            {previewLoading ? "Calculating…" : "Calculate ARV & Tax"}
          </button>
        </div>
        {previewError && <p className="mt-2 text-xs text-red-600">{previewError}</p>}
        {preview && (
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-slate-100 pt-3">
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total Plot Area</span>
              <span className="block font-mono text-sm text-slate-700">{preview.taxCalc.vacant.totalPlotArea} sqft</span>
            </div>
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ground Floor Built Area</span>
              <span className="block font-mono text-sm text-slate-700">{preview.taxCalc.vacant.groundFloorBuiltArea} sqft</span>
            </div>
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Vacant Area (declared)</span>
              <span className="block font-mono text-sm text-slate-700">{preview.taxCalc.vacant.declaredArea} sqft</span>
            </div>
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Taxable Vacant Area
              </span>
              <span className="block font-mono text-sm font-semibold text-slate-900">
                {preview.taxCalc.vacant.taxableArea} sqft
                <span className="ml-1 text-xs font-normal text-slate-400">
                  (Total Plot − Ground Floor Built × 1.43)
                </span>
              </span>
            </div>
            {Number(preview.taxCalc.vacant.tax) > 0 && (
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Vacant Land Tax</span>
                <span className="block font-mono text-sm text-slate-700">
                  ₹{Number(preview.taxCalc.vacant.tax).toLocaleString("en-IN")} (@ ₹{preview.taxCalc.vacant.rate}/sqft)
                </span>
              </div>
            )}
          </div>
        )}
        {!preview && !previewError && (
          <p className="mt-2 text-xs text-slate-400">Fill in the floors below, then click Calculate to see figures here.</p>
        )}
      </div>

      <div
        className={`flex items-center gap-2 rounded-md border p-3 text-sm font-semibold ${
          holdingNo ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
      >
        <Hash className="h-4 w-4 shrink-0" />
        {holdingNo ? (
          <>
            Assigned Holding Number: <span className="font-mono">{holdingNo}</span>
          </>
        ) : (
          "Holding number to be assigned"
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>{error.message}</p>
            {error.details && (
              <ul className="mt-1 list-disc pl-4">
                {Object.entries(error.details).map(([field, msgs]) => (
                  <li key={field}>
                    {field}: {msgs.join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {result && result.pendingChangeRequestId && (
        <div role="status" className="flex items-start gap-2.5 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Submitted for approval (request #{result.pendingChangeRequestId})</p>
            <p className="text-blue-700">
              This edit now goes to Tax Daroga for review before it takes effect. Nothing has changed on the property
              yet — the figures below are a preview of what it would become.
            </p>
            <p className="mt-1 text-blue-700">
              Preview current year tax: ₹{Number(result.taxCalc.netTax).toLocaleString("en-IN")} · Solid waste
              charge: ₹{result.solidWasteCharge.toLocaleString("en-IN")}
            </p>
          </div>
        </div>
      )}

      {result && !result.pendingChangeRequestId && (
        <div role="status" className="flex items-start gap-2.5 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              {result.holdingNo ? `Saved as ${result.holdingNo} — ` : "Saved — "}
              current year tax: ₹{Number(result.taxCalc.netTax).toLocaleString("en-IN")}
            </p>
            <p className="text-green-700">
              ARV: ₹{Number(result.taxCalc.arv).toLocaleString("en-IN")} · Solid waste charge: ₹
              {result.solidWasteCharge.toLocaleString("en-IN")}
            </p>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Owner details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Owner name</label>
            <input required value={master.ownerName} onChange={(e) => updateMaster("ownerName", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Mobile number</label>
            <input value={master.mobileNo} onChange={(e) => updateMaster("mobileNo", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Relation type</label>
            <select value={master.relationType} onChange={(e) => updateMaster("relationType", e.target.value)} className={inputClass}>
              <option value="">—</option>
              {formOptions.relationTypes.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Relation name</label>
            <input value={master.relationName} onChange={(e) => updateMaster("relationName", e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Old MUNG- holding no. (optional)</label>
            <input
              value={master.oldHoldingNo}
              onChange={(e) => updateMaster("oldHoldingNo", sanitizeOldHoldingNoInput(e.target.value))}
              placeholder="Fill in if an old/original MUNG- number is later found for this holding"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
           <label className={labelClass}>Old PID (optional)</label>
            <input
              value={master.oldPid}
              onChange={(e) => updateMaster("oldPid", e.target.value)}
              placeholder="A separate legacy system identifier, if any"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Khesra no. (optional)</label>
            <input value={master.khesraNo} onChange={(e) => updateMaster("khesraNo", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Survey sheet no. (optional)</label>
            <input value={master.surveySheetNo} onChange={(e) => updateMaster("surveySheetNo", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Khata no. (optional)</label>
            <input value={master.khataNo} onChange={(e) => updateMaster("khataNo", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Owner&apos;s Aadhaar number (optional)</label>
            <input
              value={master.aadhaarNumber}
              onChange={(e) => updateMaster("aadhaarNumber", e.target.value.replace(/\D/g, "").slice(0, 12))}
              placeholder="12 digits - use 999999999999 for a trust/society/company"
              inputMode="numeric"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Present name of holding (optional)</label>
            <input
              value={master.presentHoldingName}
              onChange={(e) => updateMaster("presentHoldingName", e.target.value)}
              placeholder="e.g. current business/establishment name on the ground"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Present category of holding (optional)</label>
            <select
              value={master.presentCategory}
              onChange={(e) => updateMaster("presentCategory", e.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              {formOptions.presentCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Location</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Address</label>
            <input required value={master.address} onChange={(e) => updateMaster("address", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Ward</label>
            <input value={master.ward} onChange={(e) => updateMaster("ward", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Zone</label>
            <input value={master.zone} onChange={(e) => updateMaster("zone", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Pincode</label>
            <input value={master.pincode} onChange={(e) => updateMaster("pincode", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Road type</label>
            <select
              value={master.roadType}
              onChange={(e) => updateMaster("roadType", e.target.value as MasterFormState["roadType"])}
              className={inputClass}
            >
              {formOptions.roadTypes.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Assessment</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Assessment year</label>
            <FinancialYearSelect
              value={master.assessmentYear}
              onChange={(v) => updateMaster("assessmentYear", v)}
              startYear={new Date().getFullYear() - 1}
              endYear={new Date().getFullYear() + 1}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Holding creation year</label>
            <FinancialYearSelect
              value={master.holdingCreationYear}
              onChange={(v) => updateMaster("holdingCreationYear", v)}
              startYear={1950}
              endYear={new Date().getFullYear() + 1}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Total plot area (sqft)</label>
            <input required type="number" min="0" value={master.areaSqft} onChange={(e) => updateMaster("areaSqft", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Tax paid till year (if known)</label>
            <FinancialYearSelect
              value={master.taxPaidTillYear}
              onChange={(v) => updateMaster("taxPaidTillYear", v)}
              startYear={1950}
              endYear={new Date().getFullYear() + 1}
              allowBlank
              blankLabel="Not set"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={master.rainWaterHarvesting}
              onChange={(e) => updateMaster("rainWaterHarvesting", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Rain water harvesting installed (5% rebate)
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Solid waste charge</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Charge type</label>
            <select
              value={master.solidWasteChargeType}
              onChange={(e) => updateMaster("solidWasteChargeType", e.target.value)}
              className={inputClass}
            >
              <option value="">—</option>
              {formOptions.solidWasteChargeTypes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Months applicable</label>
            <input
              type="number"
              min="1"
              value={master.solidWasteMonths}
              onChange={(e) => updateMaster("solidWasteMonths", e.target.value)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-400">
              Enter more than 12 to include multiple pending years (e.g. 36 for 3 years) as part of arrears.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={master.isBwg}
              onChange={(e) => updateMaster("isBwg", e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>
              Registered as a Bulk Waste Generator (BWG) on the SPCB website
              <span className="block text-xs text-slate-400">
                The owner manages their own waste, so no solid waste user charge is added to the amount payable.
              </span>
            </span>
          </label>
        </div>
      </section>

      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        Penalty and Outstanding Demand are no longer entered manually — they&apos;re calculated automatically from
        pending arrears (visible in the sticky panel above once you Calculate, and on the property&apos;s search
        result). Anything else — a one-off cost, fee, or rebate not covered elsewhere — goes in Miscellaneous below.
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Miscellaneous</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Miscellaneous cost (₹)</label>
            <input
              type="number"
              min="0"
              value={master.miscCost}
              onChange={(e) => updateMaster("miscCost", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Reason for cost</label>
            <input
              value={master.miscCostReason}
              onChange={(e) => updateMaster("miscCostReason", e.target.value)}
              placeholder="Required if cost is entered"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Miscellaneous rebate (₹)</label>
            <input
              type="number"
              min="0"
              value={master.miscRebate}
              onChange={(e) => updateMaster("miscRebate", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Reason for rebate</label>
            <input
              value={master.miscRebateReason}
              onChange={(e) => updateMaster("miscRebateReason", e.target.value)}
              placeholder="Required if rebate is entered"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Floors</h2>
          <button
            type="button"
            onClick={addFloor}
            className="inline-flex items-center gap-1.5 rounded-md border border-nnm-blue px-3 py-1.5 text-xs font-semibold text-nnm-blue hover:bg-blue-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add floor
          </button>
        </div>
        <div className="space-y-3">
          {floors.map((floor, i) => (
            <FloorRow
              key={floor.key}
              floor={floor}
              usageTypes={formOptions.usageTypes}
              onChange={(next) => updateFloor(i, next)}
              onRemove={() => removeFloor(i)}
              removable={floors.length > 1}
              previewResult={preview?.taxCalc.breakdown[i]}
            />
          ))}
        </div>
      </section>

      {isEditing && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="mb-1 text-base font-semibold text-amber-900">Reason for change</h2>
          <p className="mb-4 text-xs text-amber-700">Required when editing an existing holding — recorded in the audit history.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Change basis</label>
              <select value={master.changeBasis} onChange={(e) => updateMaster("changeBasis", e.target.value)} className={inputClass}>
                <option value="">Select…</option>
                {formOptions.changeBasisOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Reference / remarks</label>
              <input value={master.changeReference} onChange={(e) => updateMaster("changeReference", e.target.value)} className={inputClass} />
            </div>
          </div>
        </section>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-nnm-blue py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {submitting ? "Saving…" : isEditing ? "Save changes" : "Create property"}
      </button>
    </form>
  );
}