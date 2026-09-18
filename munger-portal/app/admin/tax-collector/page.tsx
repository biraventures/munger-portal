"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, FileWarning, Receipt, Search } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchPropertyForCollector,
  fetchUnsettledDemandNoticesAdmin,
  generateDemandNoticeAdmin,
  submitPaymentAdmin,
  flagPropertyForResurvey,
  requestCancellationAdmin,
  type TaxCollectorPropertySearchResult,
  type UnsettledDemandNoticeAdmin,
} from "@/lib/admin-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const PAYMENT_MODES = ["Cash", "Cheque", "Online / UPI", "Card", "Demand Draft"];

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

  const [generatingDemand, setGeneratingDemand] = useState(false);

  const [flagging, setFlagging] = useState(false);
  const [requestingCancel, setRequestingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [flagRemarks, setFlagRemarks] = useState("");
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagSuccess, setFlagSuccess] = useState(false);

  function resetForNewSearch() {
    setResult(null);
    setNotices(null);
    setReceipt(null);
    setFlagging(false);
    setFlagRemarks("");
    setFlagSuccess(false);
    setRequestingCancel(false);
    setCancelReason("");
    setCancelSuccess(false);
    setError(null);
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

  async function handleGenerateDemand() {
    if (!result?.property) return;
    setGeneratingDemand(true);
    setError(null);
    try {
      await generateDemandNoticeAdmin(result.property.holding_no);
      const list = await fetchUnsettledDemandNoticesAdmin(result.property.holding_no);
      setNotices(list);
      if (list.length > 0) setSelectedDemandNo(list[0]!.demandNo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a demand notice.");
    } finally {
      setGeneratingDemand(false);
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

  async function handleFlagSubmit() {
    if (!result?.property || !flagRemarks.trim()) return;
    setFlagSubmitting(true);
    setError(null);
    try {
      await flagPropertyForResurvey(result.property.holding_no, flagRemarks.trim());
      setFlagSuccess(true);
      setFlagging(false);
      setFlagRemarks("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not flag this holding.");
    } finally {
      setFlagSubmitting(false);
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

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Receipt className="h-6 w-6" />
          Tax Collection
        </h1>
        <p className="mb-6 text-sm text-slate-500">Search a holding number to view pendency, collect tax, and issue a receipt.</p>

        <form onSubmit={handleSearch} className="mb-6 flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={holdingNoInput} onChange={(e) => setHoldingNoInput(e.target.value)} placeholder="Holding number" className="flex-1 text-sm outline-none" autoFocus />
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
                  <span className="text-slate-500">Owner:</span> {property.owner_name}
                </p>
                <p>
                  <span className="text-slate-500">Address:</span> {property.address}
                </p>
                <p>
                  <span className="text-slate-500">Current annual tax:</span> ₹{property.currentTax}
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

            {!receipt && (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">Demand &amp; Payment</h3>
                {!notices ? (
                  <p className="text-sm text-slate-400">Loading…</p>
                ) : notices.length === 0 ? (
                  <button
                    onClick={handleGenerateDemand}
                    disabled={generatingDemand}
                    className="rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                  >
                    {generatingDemand ? "Generating…" : "Generate Demand Notice"}
                  </button>
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

            <div className="rounded-xl border border-amber-200 bg-white p-5">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Something doesn&apos;t match?</h3>
              <p className="mb-3 text-xs text-slate-500">
                If what you find on the ground looks different from these recorded details, flag this holding for re-survey.
              </p>
              {flagSuccess ? (
                <p className="flex items-center gap-1.5 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Flagged for re-survey.
                </p>
              ) : !flagging ? (
                <button onClick={() => setFlagging(true)} className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50">
                  Flag for Re-Survey
                </button>
              ) : (
                <div>
                  <textarea
                    value={flagRemarks}
                    onChange={(e) => setFlagRemarks(e.target.value)}
                    rows={3}
                    placeholder="What looks different?"
                    className={`${inputClass} mb-2`}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleFlagSubmit}
                      disabled={flagSubmitting || !flagRemarks.trim()}
                      className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                    >
                      {flagSubmitting ? "Submitting…" : "Submit Flag"}
                    </button>
                    <button onClick={() => setFlagging(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
