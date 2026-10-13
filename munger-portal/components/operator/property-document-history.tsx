"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, Printer, Receipt, XCircle } from "lucide-react";
import {
  fetchDemandNoticeHistory,
  fetchDemandNoticeReprint,
  fetchPaymentHistory,
  fetchReceiptReprint,
  requestCancellation,
  type DemandNoticeHistoryEntry,
  type PaymentHistoryEntry,
  type PrintableReceiptHistory,
} from "@/lib/operator-api";
import type { DemandNoticeReprintData } from "@/lib/demand-notice-api";
import { NoticeView } from "./notice-view";
import { ReceiptReprintView } from "./receipt-reprint-view";

export function PropertyDocumentHistory({ holdingNo }: { holdingNo: string }) {
  const [noticeHistory, setNoticeHistory] = useState<DemandNoticeHistoryEntry[] | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingItem, setLoadingItem] = useState<string | null>(null);
  const [noticeReprint, setNoticeReprint] = useState<DemandNoticeReprintData | null>(null);
  const [receiptReprint, setReceiptReprint] = useState<PrintableReceiptHistory | null>(null);

  const [cancelling, setCancelling] = useState<{ type: "demand_notice" | "receipt"; id: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);

  // Loads both lists. The lists are re-read whenever the page comes back into view, a document is closed, or Refresh is
  // pressed - a cancellation approved by the Tax Daroga in another login otherwise leaves this list showing the old
  // status (a cancelled receipt still offering "Cancel", its notice still "settled").
  const loadHistory = useCallback(() => {
    fetchDemandNoticeHistory(holdingNo)
      .then(setNoticeHistory)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load demand notice history."));
    fetchPaymentHistory(holdingNo)
      .then(setPaymentHistory)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load payment history."));
  }, [holdingNo]);

  useEffect(() => {
    setNoticeHistory(null);
    setPaymentHistory(null);
    loadHistory();
  }, [holdingNo, loadHistory]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") loadHistory();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", loadHistory);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", loadHistory);
    };
  }, [loadHistory]);

  // Back from viewing a notice / receipt: show the latest status.
  const viewingDocument = noticeReprint !== null || receiptReprint !== null;
  useEffect(() => {
    if (!viewingDocument) loadHistory();
  }, [viewingDocument, loadHistory]);

  async function handleOpenNotice(demandNo: string) {
    setLoadingItem(`notice-${demandNo}`);
    try {
      setNoticeReprint(await fetchDemandNoticeReprint(demandNo));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this notice.");
    } finally {
      setLoadingItem(null);
    }
  }

  async function handleOpenReceipt(receiptNo: string) {
    setLoadingItem(`receipt-${receiptNo}`);
    try {
      setReceiptReprint(await fetchReceiptReprint(receiptNo));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this receipt.");
    } finally {
      setLoadingItem(null);
    }
  }

  function openCancel(type: "demand_notice" | "receipt", id: string) {
    setCancelling({ type, id });
    setCancelReason("");
    setCancelError(null);
  }

  async function handleCancelSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cancelling) return;
    if (!cancelReason.trim()) {
      setCancelError("A reason is required.");
      return;
    }
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      await requestCancellation(cancelling.type, cancelling.id, cancelReason);
      setCancelSuccess(`Cancellation request submitted for ${cancelling.type === "demand_notice" ? "demand notice" : "receipt"} #${cancelling.id} - it will take effect once Tax Daroga approves it.`);
      setCancelling(null);
      loadHistory();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Could not submit cancellation request.");
    } finally {
      setCancelSubmitting(false);
    }
  }

  if (noticeReprint) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <NoticeView notice={noticeReprint} onClose={() => setNoticeReprint(null)} closeLabel="Close" />
      </section>
    );
  }
  if (receiptReprint) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <ReceiptReprintView receipt={receiptReprint} onClose={() => setReceiptReprint(null)} />
      </section>
    );
  }

  return (
    <>
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Document History</h2>
        <button onClick={loadHistory} className="text-xs font-semibold text-nnm-blue hover:underline">
          Refresh
        </button>
      </div>
      <p className="mb-4 text-xs text-slate-500">Past demand notices and payment receipts. Cancellation requires Tax Daroga approval and a stated reason.</p>

      {cancelSuccess && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {cancelSuccess}
        </div>
      )}

      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <FileText className="h-4 w-4" />
            Demand Notices
          </h3>
          {!noticeHistory ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : noticeHistory.length === 0 ? (
            <p className="text-sm text-slate-400">None generated yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {noticeHistory.map((n) => (
                <li key={n.demandNo} className="flex items-center justify-between rounded-md border border-slate-200 p-2.5 text-xs">
                  <div>
                    <span className="block font-mono font-semibold text-slate-800">{n.date}</span>
                    <span className="text-slate-500">
                      ₹{Number(n.totalAmountDemanded).toLocaleString("en-IN")} — {n.cancelled ? <span className="font-semibold text-red-600">cancelled</span> : n.settled ? "settled" : n.superseded ? "superseded" : "unsettled"}
                      {n.cancellationPending && <span className="ml-1 font-semibold text-amber-600">(cancellation pending approval)</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenNotice(n.demandNo)}
                      disabled={loadingItem === `notice-${n.demandNo}`}
                      className="inline-flex items-center gap-1 rounded border border-nnm-blue px-2 py-1 font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60"
                    >
                      {loadingItem === `notice-${n.demandNo}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                      View
                    </button>
                    {!n.settled && !n.cancelled && !n.cancellationPending && (
                      <button
                        onClick={() => openCancel("demand_notice", n.demandNo)}
                        className="inline-flex items-center gap-1 rounded border border-red-300 px-2 py-1 font-semibold text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="h-3 w-3" />
                        Cancel
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Receipt className="h-4 w-4" />
            Payment Receipts
          </h3>
          {!paymentHistory ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : paymentHistory.length === 0 ? (
            <p className="text-sm text-slate-400">No payments recorded yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {paymentHistory.map((p) => (
                <li key={p.receiptNo} className="flex items-center justify-between rounded-md border border-slate-200 p-2.5 text-xs">
                  <div>
                    <span className="block font-mono font-semibold text-slate-800">{p.date}</span>
                    <span className="text-slate-500">
                      ₹{Number(p.amountReceived).toLocaleString("en-IN")} — {p.paymentMode}
                      {p.cancelled && <span className="ml-1 font-semibold text-red-600">· cancelled</span>}
                      {p.cancellationPending && <span className="ml-1 font-semibold text-amber-600">· cancellation pending approval</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenReceipt(p.receiptNo)}
                      disabled={loadingItem === `receipt-${p.receiptNo}`}
                      className="inline-flex items-center gap-1 rounded border border-nnm-blue px-2 py-1 font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60"
                    >
                      {loadingItem === `receipt-${p.receiptNo}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                      View
                    </button>
                    {!p.cancelled && !p.cancellationPending && (
                      <button
                        onClick={() => openCancel("receipt", p.receiptNo)}
                        className="inline-flex items-center gap-1 rounded border border-red-300 px-2 py-1 font-semibold text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="h-3 w-3" />
                        Cancel
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>

    {cancelling && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
          <h2 className="mb-1 text-sm font-semibold text-slate-800">
            Request Cancellation - {cancelling.type === "demand_notice" ? "Demand Notice" : "Receipt"} #{cancelling.id}
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            This won&apos;t take effect immediately - it needs Tax Daroga&apos;s approval first.
            {cancelling.type === "receipt" && " If approved, the linked demand notice will reopen for payment."}
          </p>

          {cancelError && (
            <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {cancelError}
            </div>
          )}

          <form onSubmit={handleCancelSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Reason for cancellation</label>
              <textarea
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelling(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={cancelSubmitting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {cancelSubmitting ? "Submitting…" : "Submit Request"}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  );
}