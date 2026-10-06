"use client";

import { useEffect, useState } from "react";
import { AlertCircle, FileWarning, Loader2, Receipt } from "lucide-react";
import { OperatorHeader } from "@/components/operator-header";
import { OperatorPropertySearch } from "@/components/operator/operator-property-search";
import { PropertyEditorForm } from "@/components/operator/property-editor-form";
import { PaymentForm } from "@/components/operator/payment-form";
import { ReceiptView } from "@/components/operator/receipt-view";
import { NoticeView } from "@/components/operator/notice-view";
import { PartPaymentPanel } from "@/components/operator/part-payment-panel";
import { PropertyDocumentHistory } from "@/components/operator/property-document-history";
import { EntryModeLauncher } from "@/components/operator/entry-mode-launcher";
import { PartiallyKnownForm } from "@/components/operator/partially-known-form";
import { makeBlankFloor, type FloorFormState } from "@/components/operator/floor-row";
import { useOperatorGuard } from "@/lib/use-operator-guard";
import { fetchFormOptions, fetchFullProperty, type FormOptions } from "@/lib/operator-api";
import { generateDemandNotice, type DemandNoticeData } from "@/lib/demand-notice-api";
import type { ReceiptData } from "@/lib/payment-api";

type Mode =
  | { kind: "idle" }
  | { kind: "known-number"; holdingNo: string }
  | { kind: "new-auto" }
  | { kind: "partiallyKnown" }
  | { kind: "edit"; holdingNo: string; data: ReturnType<typeof mapToFormState> };

function mapToFormState(property: Record<string, unknown>, floors: Record<string, unknown>[]) {
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    master: {
      ownerName: str(property.owner_name),
      relationType: str(property.relation_type),
      relationName: str(property.relation_name),
      mobileNo: str(property.mobile_no),
      areaSqft: str(property.area_sqft),
      address: str(property.address),
      ward: str(property.ward),
      zone: str(property.zone),
      pincode: str(property.pincode),
      assessmentYear: str(property.assessment_year),
      roadType: (property.road_type as "PMR" | "MR" | "OR") ?? "PMR",
      vacantAreaSqft: str(property.vacant_area_sqft),
      rainWaterHarvesting: Boolean(property.rain_water_harvesting),
      solidWasteChargeType: str(property.solid_waste_charge_type),
      solidWasteMonths: str(property.solid_waste_months || "12"),
      isBwg: Boolean(property.is_bwg),
      holdingCreationYear: str(property.holding_creation_year),
      taxPaidTillYear: str(property.tax_paid_till_year),
      miscCost: str(property.misc_cost),
      miscCostReason: str(property.misc_cost_reason),
      miscRebate: str(property.misc_rebate),
      miscRebateReason: str(property.misc_rebate_reason),
      oldHoldingNo: str(property.old_holding_no),
      oldPid: str(property.old_pid),
      khesraNo: str(property.khesra_no),
      surveySheetNo: str(property.survey_sheet_no),
      khataNo: str(property.khata_no),
      aadhaarNumber: str(property.aadhaar_number),
      presentHoldingName: str(property.present_holding_name),
      presentCategory: str(property.present_category),
      changeBasis: "",
      changeReference: "",
    },
    floors: floors.map(
      (f, i): FloorFormState => ({
        key: `existing-${i}`,
        floorLabel: str(f.floor_label),
        buildupSqft: str(f.buildup_sqft),
        constType: (f.const_type as FloorFormState["constType"]) ?? "RCC",
        usageType: str(f.usage_type),
        occupancy: (f.occupancy as FloorFormState["occupancy"]) ?? "self",
        yearBuilt: str(f.year_built),
        closingYear: str(f.closing_year),
      }),
    ),
    existingArrears: {
      totalPending: str(property.pendingArrearsTotal),
      penalty: str(property.autoPenalty),
    },
  };
}

export default function OperatorPropertyTaxPage() {
  const operator = useOperatorGuard();
  const [formOptions, setFormOptions] = useState<FormOptions | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [searching, setSearching] = useState(false);
  const [notFoundHolding, setNotFoundHolding] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [notice, setNotice] = useState<DemandNoticeData | null>(null);
  const [generatingNotice, setGeneratingNotice] = useState(false);
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [dispute, setDispute] = useState<{ remarks: string } | null>(null);

  useEffect(() => {
    fetchFormOptions()
      .then(setFormOptions)
      .catch(() => setFormOptions(null));
  }, []);

  function resetTransient() {
    setNotFoundHolding(null);
    setShowPayment(false);
    setReceipt(null);
    setNotice(null);
    setNoticeError(null);
    setJustCreated(null);
    setDispute(null);
  }

  async function handleGenerateNotice(holdingNo: string, partYears?: number) {
    setGeneratingNotice(true);
    setNoticeError(null);
    try {
      const result = await generateDemandNotice(holdingNo, partYears);
      setNotice(result);
    } catch (err) {
      setNoticeError(err instanceof Error ? err.message : "Could not generate the demand notice.");
    } finally {
      setGeneratingNotice(false);
    }
  }

  async function handleSearch(holdingNo: string) {
    setSearching(true);
    resetTransient();
    try {
      const result = await fetchFullProperty(holdingNo);
      if (!result.found || !result.property) {
        setNotFoundHolding(holdingNo);
        setMode({ kind: "idle" });
        return;
      }
      setDispute(result.property.is_disputed ? { remarks: String(result.property.dispute_remarks ?? "") } : null);
      setMode({ kind: "edit", holdingNo, data: mapToFormState(result.property, result.floors ?? []) });
    } finally {
      setSearching(false);
    }
  }

  function handleChooseAuto(choice: "new" | "partiallyKnown") {
    resetTransient();
    setMode(choice === "new" ? { kind: "new-auto" } : { kind: "partiallyKnown" });
  }

  async function handleChooseKnownNumber(holdingNo: string) {
    resetTransient();
    // If this holding already exists, the backend will treat any save
    // as an EDIT (requiring Change Basis/Reference) — but the create
    // form never asks for those. Check first and route straight to the
    // real edit flow instead of hitting an unrecoverable error later.
    setSearching(true);
    try {
      const result = await fetchFullProperty(holdingNo);
      if (result.found && result.property) {
        setMode({ kind: "edit", holdingNo, data: mapToFormState(result.property, result.floors ?? []) });
        return;
      }
    } finally {
      setSearching(false);
    }
    setMode({ kind: "known-number", holdingNo });
  }

  if (!operator) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="no-print">
        <OperatorHeader operator={operator} />
      </div>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {receipt ? (
          <ReceiptView
            receipt={receipt}
            onNewPayment={() => {
              setReceipt(null);
              setShowPayment(false);
            }}
          />
        ) : notice ? (
          <NoticeView notice={notice} onClose={() => setNotice(null)} />
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-semibold text-slate-900">Property Tax</h1>
            <p className="mb-6 text-sm text-slate-500">Search a holding to edit it, or start a new entry below.</p>

            <div className="mb-6">
              <OperatorPropertySearch onSearch={handleSearch} onNew={handleChooseKnownNumber} loading={searching} />
            </div>

            {notFoundHolding && (
              <div className="mb-6 flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  No property found for &ldquo;{notFoundHolding}&rdquo;. If it&apos;s a known MUNG- number, use the
                  card below to create it — it&apos;s pre-filled.
                </span>
              </div>
            )}

            {!formOptions && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading form options…
              </div>
            )}

            {formOptions && mode.kind === "idle" && (
              <div>
                <h2 className="mb-3 text-base font-semibold text-slate-900">Start a new entry</h2>
                <EntryModeLauncher
                  onChooseAuto={handleChooseAuto}
                  onChooseKnownNumber={handleChooseKnownNumber}
                  initialKnownNumber={notFoundHolding ?? undefined}
                />
              </div>
            )}

            {formOptions && mode.kind === "known-number" && (
              <PropertyEditorForm
                key={mode.holdingNo}
                holdingNo={mode.holdingNo}
                isEditing={false}
                initialFloors={[makeBlankFloor(0)]}
                formOptions={formOptions}
                onSaved={(hn) => setJustCreated(hn)}
              />
            )}

            {formOptions && mode.kind === "new-auto" && (
              <PropertyEditorForm
                key="new-auto"
                autoAssign
                isEditing={false}
                initialFloors={[makeBlankFloor(0)]}
                formOptions={formOptions}
                onSaved={(hn) => setJustCreated(hn)}
              />
            )}

            {formOptions && mode.kind === "partiallyKnown" && (
              <PartiallyKnownForm formOptions={formOptions} onSaved={(result) => setJustCreated(result.holdingNo)} />
            )}

            {justCreated && (
              <p className="mt-3 text-sm text-slate-500">
                Saved as <b>{justCreated}</b>. Search that holding number above to edit it or collect a payment.
              </p>
            )}

            {formOptions && mode.kind === "edit" && (
              <div className="space-y-6">
                <PropertyEditorForm
                  key={mode.holdingNo}
                  holdingNo={mode.holdingNo}
                  isEditing={true}
                  initialMaster={mode.data.master}
                  initialFloors={mode.data.floors}
                  existingArrears={mode.data.existingArrears}
                  formOptions={formOptions}
                  onSaved={() => {}}
                />

                {noticeError && (
                  <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {noticeError}
                  </div>
                )}

                {dispute && (
                  <div role="alert" className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <b>This holding is marked as DISPUTED.</b> No demand notice can be generated and no payment can be accepted until the
                      Tax Daroga, City Manager or Commissioner clears the dispute.
                      {dispute.remarks ? <div className="mt-1 text-xs">Reason: {dispute.remarks}</div> : null}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  {!showPayment && !dispute && (
                    <button
                      onClick={() => setShowPayment(true)}
                      className="inline-flex items-center gap-2 rounded-md bg-nnm-gold px-6 py-3 text-sm font-semibold text-[#20240a] hover:brightness-95"
                    >
                      <Receipt className="h-4 w-4" />
                      Collect Payment
                    </button>
                  )}
                  <button
                    onClick={() => handleGenerateNotice(mode.holdingNo)}
                    disabled={generatingNotice || !!dispute}
                    className="inline-flex items-center gap-2 rounded-md border border-nnm-blue px-6 py-3 text-sm font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60"
                  >
                    {generatingNotice ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileWarning className="h-4 w-4" />
                    )}
                    {generatingNotice ? "Generating…" : "Generate Demand Notice"}
                  </button>
                </div>

                {!dispute && (
                  <PartPaymentPanel
                    key={`pp-${mode.holdingNo}`}
                    holdingNo={mode.holdingNo}
                    busy={generatingNotice}
                    onGenerate={(years) => handleGenerateNotice(mode.holdingNo, years)}
                  />
                )}

                {showPayment && !dispute && (
                  <PaymentForm holdingNo={mode.holdingNo} onSuccess={setReceipt} />
                )}

                <PropertyDocumentHistory holdingNo={mode.holdingNo} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}