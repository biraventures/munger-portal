"use client";

import { AlertTriangle, X } from "lucide-react";
import { PaymentResponsibilityWarning } from "@/components/payment-responsibility-warning";

/**
 * The warning shown the moment "Collect Payment" is pressed (counter operator and Agency Operator), before the payment
 * form opens - the same responsibility warning the Tax Collector and the online payment window show. The final
 * "Confirm & Record" box (amount, demand notice, tax collector) still follows once the form is filled.
 */
export function CollectPaymentWarningDialog({
  holdingNo,
  ownerName,
  amountDue,
  collectingAs,
  onContinue,
  onCancel,
}: {
  holdingNo: string;
  ownerName?: string | null;
  /** Total dues if known (the exact amount comes from the demand notice chosen in the form). */
  amountDue?: number | null;
  /** Who is recording, e.g. "Ramesh Kumar (Agency Operator)". */
  collectingAs?: string | null;
  onContinue: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-red-700">
            <AlertTriangle className="h-5 w-5" /> Collect payment - read before you continue
          </h3>
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="my-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Holding No.:</span>
            <span className="font-mono font-medium text-slate-900">{holdingNo}</span>
          </div>
          {ownerName && (
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Owner Name:</span>
              <span className="text-right font-medium text-slate-900">{ownerName}</span>
            </div>
          )}
          {amountDue != null && Number.isFinite(amountDue) && (
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Dues (approx.):</span>
              <span className="font-mono font-semibold text-slate-900">₹{Math.round(amountDue).toLocaleString("en-IN")}</span>
            </div>
          )}
          {collectingAs && (
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Recorded by:</span>
              <span className="text-right font-medium text-slate-900">{collectingAs}</span>
            </div>
          )}
        </div>

        <PaymentResponsibilityWarning />

        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="w-1/2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="w-1/2 rounded-md bg-nnm-gold px-4 py-2.5 text-sm font-semibold text-[#20240a] shadow-[0_3px_0_#96791b] transition-transform hover:-translate-y-px"
          >
            I understand - continue
          </button>
        </div>
      </div>
    </div>
  );
}
