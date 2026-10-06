"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, CheckCircle2, FileWarning, Receipt, Search, ShieldAlert } from "lucide-react";
import { fetchFormOptions, type FormOptions } from "@/lib/operator-api";
import { sanitizeHoldingNoInput } from "@/lib/holding-no";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { FieldVerificationCapture } from "@/components/admin/field-verification-capture";
import { CollectionIssueList } from "@/components/admin/collection-issue-list";
import { ReceiptView } from "@/components/operator/receipt-view";
import type { ReceiptData } from "@/lib/payment-api";
import {
  fetchPropertyForCollector,
  fetchUnsettledDemandNoticesAdmin,
  submitPaymentAdmin,
  requestCancellationAdmin,
  reportCollectionIssue,
  fetchCollectionIssuesForHolding,
  fetchMyCollectionIssues,
  saveCollectorDetails,
  fetchLatestSolidWasteRequest,
  type SolidWasteRequest,
  WATER_CONNECTION_LABELS,
  type WaterConnectionStatus,
  type CollectionIssueWithNotices,
  COLLECTION_ISSUE_TYPE_LABELS,
  type TaxCollectorPropertySearchResult,
  type UnsettledDemandNoticeAdmin,
  type CollectionIssueType,
} from "@/lib/admin-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const PAYMENT_MODES = ["Cash", "Cheque", "Online / UPI", "Card", "Demand Draft"];

/** Every property field worth showing the collector, in reading order. Aadhaar is masked to the last 4 digits. */
const DETAIL_FIELDS: [string, string][] = [
  ["owner_name", "Owner"],
  ["relation_type", "Relation"],
  ["relation_name", "Relation name"],
  ["mobile_no", "Mobile no."],
  ["aadhaar_number", "Aadhaar"],
  ["address", "Address"],
  ["ward", "Ward"],
  ["zone", "Zone"],
  ["pincode", "Pincode"],
  ["old_holding_no", "Old holding no."],
  ["old_pid", "Old PID"],
  ["khesra_no", "Khesra no."],
  ["survey_sheet_no", "Survey sheet no."],
  ["khata_no", "Khata no."],
  ["road_type", "Road type"],
  ["area_sqft", "Total area (sqft)"],
  ["vacant_area_sqft", "Vacant area (sqft)"],
  ["present_holding_name", "Present holding name"],
  ["present_category", "Present category"],
  ["assessment_year", "Assessment year"],
  ["holding_creation_year", "Holding created in"],
  ["tax_paid_till_year", "Tax paid till year"],
  ["solid_waste_charge_type", "Solid waste type"],
  ["solid_waste_charge", "Solid waste charge (₹/yr)"],
  ["water_connection_status", "Tap water connection"],
  ["water_connection_count", "No. of water connections"],
  ["rain_water_harvesting", "Rain water harvesting"],
  ["solar_rooftop", "Solar rooftop"],
  ["is_bwg", "Bulk waste generator"],
  ["latitude", "Latitude"],
  ["longitude", "Longitude"],
];

function detailVal(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (key === "water_connection_status") return WATER_CONNECTION_LABELS[v as WaterConnectionStatus] ?? String(v);
  if (key === "aadhaar_number") {
    const d = String(v).replace(/\D/g, "");
    return d.length >= 4 ? `XXXX XXXX ${d.slice(-4)}` : "-";
  }
  return String(v);
}

function displayVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

export default function TaxCollectorPage() {
  const admin = useAdminGuard();
  const [holdingNoInput, setHoldingNoInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TaxCollectorPropertySearchResult | null>(null);

  const [notices, setNotices] = useState<UnsettledDemandNoticeAdmin[] | null>(null);
  const [selectedDemandNo, setSelectedDemandNo] = useState("");
  const [paymentMode, setPaymentMode] = useState(PAYMENT_MODES[0]);
  const [collecting, setCollecting] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const [requestingCancel, setRequestingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  const [issueType, setIssueType] = useState<CollectionIssueType>("refused_to_pay");
  const [issueNotes, setIssueNotes] = useState("");
  const [reportingIssue, setReportingIssue] = useState(false);
  const [issueSuccess, setIssueSuccess] = useState(false);

  const [holdingIssues, setHoldingIssues] = useState<CollectionIssueWithNotices[] | null>(null);
  const [myIssues, setMyIssues] = useState<CollectionIssueWithNotices[] | null>(null);

  useEffect(() => {
    if (admin?.role !== "tax_collector") return;
    fetchMyCollectionIssues()
      .then(setMyIssues)
      .catch(() => setMyIssues([]));
  }, [admin]);

  const [formOptions, setFormOptions] = useState<FormOptions | null>(null);
  const [swType, setSwType] = useState("");
  const [waterStatus, setWaterStatus] = useState<WaterConnectionStatus | "">("");
  const [waterCount, setWaterCount] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [swRequest, setSwRequest] = useState<SolidWasteRequest | null>(null);
  const [detailsMsg, setDetailsMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchFormOptions().then(setFormOptions).catch(() => undefined);
  }, []);

  async function reloadProperty(holdingNo: string) {
    const res = await fetchPropertyForCollector(holdingNo);
    setResult(res);
    setSwRequest(await fetchLatestSolidWasteRequest(holdingNo));
  }

  async function handleSaveDetails() {
    if (!result?.property) return;
    const p = result.property;
    const needSw = !!p.solidWasteTypeMissing && !swOpen;
    const needWater = !p.water_connection_status;
    const input: { solidWasteChargeType?: string; waterConnectionStatus?: WaterConnectionStatus; waterConnectionCount?: number } = {};
    if (needSw) {
      if (!swType) return setError("Select the solid waste user type.");
      input.solidWasteChargeType = swType;
    }
    if (needWater) {
      if (!waterStatus) return setError("Select the tap water connection status.");
      input.waterConnectionStatus = waterStatus;
      if (waterStatus === "multiple") {
        const n = Number(waterCount);
        if (!Number.isInteger(n) || n < 2) return setError("Enter the number of connections (2 or more).");
        input.waterConnectionCount = n;
      }
    }
    setSavingDetails(true);
    setError(null);
    try {
      await saveCollectorDetails(p.holding_no, input);
      setDetailsMsg("Details saved.");
      await reloadProperty(p.holding_no);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save these details.");
    } finally {
      setSavingDetails(false);
    }
  }

  function resetForNewSearch() {
    setSwType("");
    setSwRequest(null);
    setWaterStatus("");
    setWaterCount("");
    setDetailsMsg(null);
    setHoldingIssues(null);
    setResult(null);
    setNotices(null);
    setReceipt(null);
    setRequestingCancel(false);
    setCancelReason("");
    setCancelSuccess(false);
    setIssueSuccess(false);
    setIssueNotes("");
    setError(null);
  }

  async function handleReportIssue() {
    if (!result?.property) return;
    setReportingIssue(true);
    setError(null);
    try {
      await reportCollectionIssue(result.property.holding_no, issueType, issueNotes.trim() || undefined);
      setIssueSuccess(true);
      setIssueNotes("");
      fetchCollectionIssuesForHolding(result.property.holding_no).then(setHoldingIssues).catch(() => undefined);
      fetchMyCollectionIssues().then(setMyIssues).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit this report.");
    } finally {
      setReportingIssue(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!holdingNoInput.trim()) return;
    resetForNewSearch();
    setSearching(true);
    try {
      const res = await fetchPropertyForCollector(holdingNoInput.trim());
      setResult(res);
      if (res.found) {
        fetchLatestSolidWasteRequest(res.property!.holding_no).then(setSwRequest).catch(() => undefined);
        fetchCollectionIssuesForHolding(res.property!.holding_no)
          .then(setHoldingIssues)
          .catch(() => setHoldingIssues([]));
        const list = await fetchUnsettledDemandNoticesAdmin(holdingNoInput.trim());
        setNotices(list);
        if (list.length > 0) setSelectedDemandNo(list[0]!.demandNo);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search for this holding.");
    } finally {
      setSearching(false);
    }
  }

  async function handleCollectPayment() {
    if (!result?.property || !selectedDemandNo) return;
    const selected = notices?.find((n) => n.demandNo === selectedDemandNo);
    if (!selected) return;
    setCollecting(true);
    setError(null);
    try {
      const res = await submitPaymentAdmin(result.property.holding_no, {
        amount: Number(selected.totalAmountDemanded),
        paymentMode,
        demandNo: selectedDemandNo,
      });
      setReceipt(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this payment.");
    } finally {
      setCollecting(false);
    }
  }

  async function handleRequestCancellation() {
    if (!result?.property || !receipt || !cancelReason.trim()) return;
    setCancelSubmitting(true);
    setError(null);
    try {
      await requestCancellationAdmin("receipt", String(receipt.receiptNo), cancelReason.trim());
      setCancelSuccess(true);
      setRequestingCancel(false);
      setCancelReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit this cancellation request.");
    } finally {
      setCancelSubmitting(false);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role !== "tax_collector") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Tax Collector.
          </div>
        </main>
      </div>
    );
  }

  const property = result?.property;
  const swOpen = !!swRequest && (swRequest.stage === "tax_daroga" || swRequest.stage === "city_manager");
  const floors = result?.floors ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Receipt className="h-6 w-6" />
          Tax Collection
        </h1>
        <p className="mb-6 text-sm text-slate-500">Search a holding number to view full details and pendency, collect tax, and issue a receipt.</p>

        <form onSubmit={handleSearch} className="mb-6 flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={holdingNoInput} onChange={(e) => setHoldingNoInput(sanitizeHoldingNoInput(e.target.value))} placeholder="Holding number" className="flex-1 text-sm outline-none" autoFocus />
          <button type="submit" disabled={searching} className="rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60">
            {searching ? "Searching…" : "Search"}
          </button>
        </form>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {result && !result.found && (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <FileWarning className="h-4 w-4 shrink-0" />
            {result.message || "No matching holding found."}
          </div>
        )}

        {property && (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-base font-semibold text-slate-900">{property.holding_no}</h2>
              <div className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                {DETAIL_FIELDS.map(([key, label]) => (
                  <p key={key}>
                    <span className="text-slate-500">{label}:</span> {detailVal(key, property[key])}
                  </p>
                ))}
                <p>
                  <span className="text-slate-500">Current annual tax:</span> ₹{displayVal(property.currentTax)}
                </p>
                {property.arrears && (
                  <p>
                    <span className="text-slate-500">Pending (arrears + penalty):</span> ₹
                    {(property.arrears.totalPending + property.arrears.penalty).toFixed(2)} ({property.arrears.stagesConsidered} year
                    {property.arrears.stagesConsidered === 1 ? "" : "s"} pending)
                  </p>
                )}
              </div>
            </div>

            {((!!property.solidWasteTypeMissing && !swOpen) || !property.water_connection_status || (!!property.solidWasteTypeMissing && swOpen)) && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
                <h3 className="mb-1 text-sm font-semibold text-amber-900">Mandatory details - needed before collecting payment</h3>
                <p className="mb-3 text-xs text-amber-800">These are missing for this holding. Please enter them from the field.</p>
                {!!property.solidWasteTypeMissing && swOpen && swRequest && (
                  <p className="mb-3 rounded-md border border-amber-200 bg-white p-3 text-xs text-amber-900">
                    Solid waste user type <b>{swRequest.requested_type}</b> submitted - {swRequest.stage === "tax_daroga" ? "waiting for Tax Daroga verification" : "verified by Tax Daroga, waiting for City Manager approval"}. Payment can be collected once it is approved.
                  </p>
                )}
                {!!property.solidWasteTypeMissing && !swOpen && swRequest?.stage === "rejected" && (
                  <p className="mb-3 rounded-md border border-red-200 bg-white p-3 text-xs text-red-700">
                    Earlier entry ({swRequest.requested_type}) was rejected by {swRequest.rejected_by}: {swRequest.reject_reason}. Please enter it again.
                  </p>
                )}
                {!!property.solidWasteTypeMissing && !swOpen && (
                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-medium text-slate-700">Solid waste user type (needs Tax Daroga + City Manager approval; amount is set automatically)</label>
                    <select value={swType} onChange={(e) => setSwType(e.target.value)} className={inputClass}>
                      <option value="">Select user type…</option>
                      {(formOptions?.solidWasteChargeTypes ?? []).map((t) => (
                        <option key={t} value={t}>
                          {t} - ₹{formOptions?.solidWasteRates[t] ?? 0}/month
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {!property.water_connection_status && (
                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-medium text-slate-700">Does the holding have a tap water connection?</label>
                    <select value={waterStatus} onChange={(e) => setWaterStatus(e.target.value as WaterConnectionStatus | "")} className={inputClass}>
                      <option value="">Select…</option>
                      {(Object.keys(WATER_CONNECTION_LABELS) as WaterConnectionStatus[]).map((k) => (
                        <option key={k} value={k}>
                          {WATER_CONNECTION_LABELS[k]}
                        </option>
                      ))}
                    </select>
                    {waterStatus === "multiple" && (
                      <input
                        type="number"
                        min={2}
                        value={waterCount}
                        onChange={(e) => setWaterCount(e.target.value)}
                        placeholder="Number of connections"
                        className={`${inputClass} mt-2`}
                      />
                    )}
                  </div>
                )}
                {detailsMsg && <p className="mb-2 text-xs text-green-700">{detailsMsg}</p>}
                {((!!property.solidWasteTypeMissing && !swOpen) || !property.water_connection_status) && (
                <button onClick={handleSaveDetails} disabled={savingDetails} className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60">
                  {savingDetails ? "Saving…" : "Save details"}
                </button>
                )}
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Collection issues &amp; notices for this holding</h3>
              <CollectionIssueList issues={holdingIssues} emptyText="No collection issue has been reported for this holding." />
            </div>

            <FieldVerificationCapture holdingNo={property.holding_no} />

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Floors on record</h3>
              {floors.length === 0 ? (
                <p className="text-sm text-slate-400">No floors on record.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 font-medium">Floor</th>
                        <th className="px-3 py-2 font-medium">Area</th>
                        <th className="px-3 py-2 font-medium">Usage</th>
                        <th className="px-3 py-2 font-medium">Occupancy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {floors.map((f, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2">{displayVal(f.floor_label)}</td>
                          <td className="px-3 py-2">{displayVal(f.buildup_sqft)}</td>
                          <td className="px-3 py-2">{displayVal(f.usage_type)}</td>
                          <td className="px-3 py-2">{displayVal(f.occupancy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {!receipt && (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">Demand &amp; Payment</h3>
                {!notices ? (
                  <p className="text-sm text-slate-400">Loading…</p>
                ) : notices.length === 0 ? (
                  <p className="text-sm text-slate-400">No demand notice generated yet for this holding - ask the operator to generate one before collecting.</p>
                ) : (
                  <>
                    <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <select value={selectedDemandNo} onChange={(e) => setSelectedDemandNo(e.target.value)} className={inputClass}>
                        {notices.map((n) => (
                          <option key={n.demandNo} value={n.demandNo}>
                            {n.formattedDemandNo} - ₹{n.totalAmountDemanded}
                          </option>
                        ))}
                      </select>
                      <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={inputClass}>
                        {PAYMENT_MODES.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={handleCollectPayment}
                      disabled={collecting || !!property.solidWasteTypeMissing || !property.water_connection_status}
                      title={property.solidWasteTypeMissing || !property.water_connection_status ? "Enter the mandatory details above first" : undefined}
                      className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                    >
                      {collecting ? "Recording…" : "Collect Payment & Issue Receipt"}
                    </button>
                  </>
                )}
              </div>
            )}

            {receipt && (
              <div className="space-y-4">
                <ReceiptView
                  receipt={receipt}
                  onNewPayment={() => {
                    setReceipt(null);
                    setCancelReason("");
                    setCancelSuccess(false);
                    setRequestingCancel(false);
                  }}
                />

                {cancelSuccess ? (
                  <p className="flex items-center gap-1.5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Cancellation requested - it will go to Tax Daroga for review.
                  </p>
                ) : !requestingCancel ? (
                  <button
                    onClick={() => setRequestingCancel(true)}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Generated by mistake? Request cancellation
                  </button>
                ) : (
                  <div className="rounded-md border border-red-200 bg-white p-3">
                    <textarea
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      rows={2}
                      placeholder="What went wrong?"
                      className={`${inputClass} mb-2`}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleRequestCancellation}
                        disabled={cancelSubmitting || !cancelReason.trim()}
                        className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {cancelSubmitting ? "Submitting…" : "Request Cancellation"}
                      </button>
                      <button onClick={() => setRequestingCancel(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <Link
              href={`/admin/report-property-discrepancy?holding=${encodeURIComponent(property.holding_no)}`}
              className="flex items-center gap-3 rounded-xl border border-amber-200 bg-white p-5 transition-shadow hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Something doesn&apos;t match?</h3>
                <p className="text-xs text-slate-500">
                  If what you find on the ground looks different from these details, submit the corrected details here - it will go through Tax
                  Surveyor, Tax Daroga, City Manager, and DMC review.
                </p>
              </div>
            </Link>

            <div className="rounded-xl border border-red-200 bg-white p-5">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <ShieldAlert className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Taxpayer creating a problem?</h3>
                  <p className="text-xs text-slate-500">Log what happened - visible to Tax Daroga and the Commissioner.</p>
                </div>
              </div>

              {issueSuccess && (
                <p className="mb-3 flex items-center gap-1.5 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Reported.
                </p>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select value={issueType} onChange={(e) => setIssueType(e.target.value as CollectionIssueType)} className={inputClass}>
                  {(Object.keys(COLLECTION_ISSUE_TYPE_LABELS) as CollectionIssueType[]).map((t) => (
                    <option key={t} value={t}>
                      {COLLECTION_ISSUE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleReportIssue}
                  disabled={reportingIssue}
                  className="rounded-md border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  {reportingIssue ? "Reporting…" : "Report Issue"}
                </button>
              </div>
              <input
                value={issueNotes}
                onChange={(e) => setIssueNotes(e.target.value)}
                placeholder="Notes (optional)"
                className={`${inputClass} mt-2`}
              />
            </div>
          </div>
        )}

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Issues I have reported &amp; notices raised</h3>
          <CollectionIssueList issues={myIssues} showHolding emptyText="You have not reported any collection issue yet." />
        </div>
      </main>
    </div>
  );
}
