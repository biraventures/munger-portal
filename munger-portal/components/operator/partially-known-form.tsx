"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Plus } from "lucide-react";
import { PhaseArvRow, makeBlankPhaseArv, type PhaseArvEntry } from "./phase-arv-row";
import { sanitizeHoldingNoInput } from "@/lib/holding-no";
import { FinancialYearSelect } from "./financial-year-select";
import { createNewEntryProperty, type FormOptions, type SaveError, type NewEntryResult } from "@/lib/operator-api";


const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export function PartiallyKnownForm({
  formOptions,
  onSaved,
}: {
  formOptions: FormOptions;
  onSaved: (result: NewEntryResult) => void;
}) {
  const currentYear = new Date().getFullYear();

  const [oldHoldingNo, setOldHoldingNo] = useState("");
  const [oldPid, setOldPid] = useState("");
  const [khesraNo, setKhesraNo] = useState("");
  const [surveySheetNo, setSurveySheetNo] = useState("");
  const [khataNo, setKhataNo] = useState("");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [mobileNo, setMobileNo] = useState("");
  const [address, setAddress] = useState("");
  const [ward, setWard] = useState("");
  const [areaSqft, setAreaSqft] = useState("");
  const [holdingCreationYear, setHoldingCreationYear] = useState(`${currentYear}-${currentYear + 1}`);
  const [assessmentYear, setAssessmentYear] = useState(`${currentYear}-${currentYear + 1}`);
  const [taxPaidTillYear, setTaxPaidTillYear] = useState("");
  const [solidWasteChargeType, setSolidWasteChargeType] = useState("");
  const [solidWasteMonths, setSolidWasteMonths] = useState("12");
  const [markForSurvey, setMarkForSurvey] = useState(true);
  const [phases, setPhases] = useState<PhaseArvEntry[]>([
    makeBlankPhaseArv(formOptions.periodsOfAssessment, []),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<SaveError | null>(null);
  const [result, setResult] = useState<NewEntryResult | null>(null);

  function updatePhase(index: number, next: PhaseArvEntry) {
    setPhases((ps) => ps.map((p, i) => (i === index ? next : p)));
  }

  function removePhase(index: number) {
    setPhases((ps) => ps.filter((_, i) => i !== index));
  }

  function addPhase() {
    setPhases((ps) => [...ps, makeBlankPhaseArv(formOptions.periodsOfAssessment, ps.map((p) => p.periodOfAssessment))]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const validPhases = phases.filter((p) => Number(p.arvInPeriod) > 0);
    if (validPhases.length === 0) {
      setError({ message: "Enter a known ARV for at least one historical period." });
      return;
    }

    setSubmitting(true);
    try {
      const saved = await createNewEntryProperty({
        holdingEntryMode: "partiallyKnown",
        oldHoldingNo,
        oldPid: oldPid || null,
        khesraNo: khesraNo || null,
        surveySheetNo: surveySheetNo || null,
        khataNo: khataNo || null,
        aadhaarNumber: aadhaarNumber || null,
        ownerName,
        mobileNo: mobileNo || null,
        address,
        ward: ward || null,
        areaSqft: Number(areaSqft) || 0,
        roadType: "MR", // forced server-side too — this value is ignored for partiallyKnown mode
        assessmentYear,
        holdingCreationYear,
        taxPaidTillYear: taxPaidTillYear || null,
        solidWasteChargeType: solidWasteChargeType || null,
        solidWasteMonths: Number(solidWasteMonths) || 12,
        taxHistoryStages: validPhases.map((p) => ({
          periodOfAssessment: p.periodOfAssessment,
          arvInPeriod: Number(p.arvInPeriod),
        })),
        markForSurvey,
      });
      setResult(saved);
      onSaved(saved);
    } catch (err) {
      setError(err as SaveError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        Road type is fixed to <b>Main Road (MR)</b> for partially-known holdings, and floor area is
        back-calculated from the ARV you enter below — no floor survey needed.
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

      {result && (
        <div role="status" className="flex items-start gap-2.5 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              Saved as {result.holdingNo} — current year tax: ₹{Number(result.taxCalc.netTax).toLocaleString("en-IN")}
            </p>
            <p className="text-green-700">
              {result.taxHistoryStages.length} historical period(s) recorded.
            </p>
          </div>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">What we know</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Old holding number</label>
            <input required value={oldHoldingNo} onChange={(e) => setOldHoldingNo(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Related MUNG- holding no. (optional)</label>
            <input
              value={oldPid}
              onChange={(e) => setOldPid(sanitizeHoldingNoInput(e.target.value))}
              placeholder="Fill in if later matched to an existing digitized MUNG- record"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Khesra no. (optional)</label>
            <input value={khesraNo} onChange={(e) => setKhesraNo(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Survey sheet no. (optional)</label>
            <input value={surveySheetNo} onChange={(e) => setSurveySheetNo(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Khata no. (optional)</label>
            <input value={khataNo} onChange={(e) => setKhataNo(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Owner&apos;s Aadhaar number (optional)</label>
            <input
              value={aadhaarNumber}
              onChange={(e) => setAadhaarNumber(e.target.value.replace(/\D/g, "").slice(0, 12))}
              placeholder="12 digits - use 999999999999 for a trust/society/company"
              inputMode="numeric"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Owner name</label>
            <input required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Mobile number</label>
            <input value={mobileNo} onChange={(e) => setMobileNo(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Ward</label>
            <input value={ward} onChange={(e) => setWard(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Address</label>
            <input required value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Total plot area (sqft)</label>
            <input required type="number" min="0" value={areaSqft} onChange={(e) => setAreaSqft(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Holding creation year</label>
            <FinancialYearSelect
              value={holdingCreationYear}
              onChange={setHoldingCreationYear}
              startYear={1950}
              endYear={currentYear + 1}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Current assessment year</label>
            <FinancialYearSelect
              value={assessmentYear}
              onChange={setAssessmentYear}
              startYear={currentYear - 1}
              endYear={currentYear + 1}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Tax paid till year (optional)</label>
            <FinancialYearSelect
              value={taxPaidTillYear}
              onChange={setTaxPaidTillYear}
              startYear={1990}
              endYear={currentYear + 1}
              allowBlank
              blankLabel="Not paid / unknown"
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Solid waste charge</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Charge type</label>
            <select
              value={solidWasteChargeType}
              onChange={(e) => setSolidWasteChargeType(e.target.value)}
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
              value={solidWasteMonths}
              onChange={(e) => setSolidWasteMonths(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-400">
              Enter more than 12 to include multiple pending years (e.g. 36 for 3 years) as part of arrears.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Known ARV by historical phase</h2>
            <p className="text-xs text-slate-500">Enter ARV only for the phases you actually know — leave the rest out.</p>
          </div>
          <button
            type="button"
            onClick={addPhase}
            className="inline-flex items-center gap-1.5 rounded-md border border-nnm-blue px-3 py-1.5 text-xs font-semibold text-nnm-blue hover:bg-blue-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add period
          </button>
        </div>
        <div className="space-y-3">
          {phases.map((phase, i) => (
            <PhaseArvRow
              key={phase.key}
              entry={phase}
              periodsOfAssessment={formOptions.periodsOfAssessment}
              onChange={(next) => updatePhase(i, next)}
              onRemove={() => removePhase(i)}
              removable={phases.length > 1}
            />
          ))}
        </div>
      </section>

      <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <input
          type="checkbox"
          checked={markForSurvey}
          onChange={(e) => setMarkForSurvey(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
        />
        <span>
          Mark for physical survey - the area above is only back-calculated from ARV, not measured. Leave this checked
          unless this holding has already been physically surveyed.
        </span>
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-nnm-blue py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {submitting ? "Saving…" : "Create Partially-Known Property"}
      </button>
    </form>
  );
}