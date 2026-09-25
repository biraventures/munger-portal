"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, CheckCircle2, FileWarning, Receipt, Search, ShieldAlert } from "lucide-react";
import { sanitizeHoldingNoInput } from "@/lib/holding-no";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchPropertyForCollector,
  fetchUnsettledDemandNoticesAdmin,
  submitPaymentAdmin,
  requestCancellationAdmin,
  reportCollectionIssue,
  COLLECTION_ISSUE_TYPE_LABELS,
  type TaxCollectorPropertySearchResult,
  type UnsettledDemandNoticeAdmin,
  type CollectionIssueType,
} from "@/lib/admin-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const PAYMENT_MODES = ["Cash", "Cheque", "Online / UPI", "Card", "Demand Draft"];

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
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);

  const [requestingCancel, setRequestingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  const [issueType, setIssueType] = useState<CollectionIssueType>("refused_to_pay");
  const [issueNotes, setIssueNotes] = useState("");
  const [reportingIssue, setReportingIssue] = useState(false);
  const [issueSuccess, setIssueSuccess] = useState(false);

  function resetForNewSearch() {
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
                <p>
                  <span className="text-slate-500">Owner:</span> {displayVal(property.owner_name)}
                </p>
                <p>
                  <span className="text-slate-500">Address:</span> {displayVal(property.address)}
                </p>
                <p>
                  <span className="text-slate-500">Ward:</span> {displayVal(property.ward)}
                </p>
                <p>
                  <span className="text-slate-500">Road type:</span> {displayVal(property.road_type)}
                </p>
                <p>
                  <span className="text-slate-500">Total area (sqft):</span> {displayVal(property.area_sqft)}
                </p>
                <p>
                  <span className="text-slate-500">Assessment year:</span> {displayVal(property.assessment_year)}
                </p>
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
                      disabled={collecting}
                      className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                    >
                      {collecting ? "Recording…" : "Collect Payment & Issue Receipt"}
                    </button>
                  </>
                )}
              </div>
            )}

            {receipt && (
              <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-5">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-green-800">
                  <CheckCircle2 className="h-4 w-4" />
                  Payment recorded
                </div>
                <p className="text-sm text-green-700">Receipt No: {String(receipt.receiptNo)}</p>

                {cancelSuccess ? (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-green-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Cancellation requested - it will go to Tax Daroga for review.
                  </p>
                ) : !requestingCancel ? (
                  <button
                    onClick={() => setRequestingCancel(true)}
                    className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Generated by mistake? Request cancellation
                  </button>
                ) : (
                  <div className="mt-3 rounded-md border border-red-200 bg-white p-3">
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
      </main>
    </div>
  );
}
