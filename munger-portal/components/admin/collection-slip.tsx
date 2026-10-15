"use client";

import { useRef } from "react";
import { Printer } from "lucide-react";
import type { ReceiptData } from "@/lib/payment-api";
import { DocumentVerificationQR } from "@/components/operator/document-verification-qr";
import { isProvisional } from "@/components/operator/cancelled-document-notice";
import { printElementInNewWindow } from "@/lib/print-in-new-window";

function money(v: string | number): string {
  return Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * What a Tax Collector hands over in the field. The receipt itself is already generated (same number as here); the
 * office prints the day's receipts in bulk, stamps them and delivers them.
 */
export function CollectionSlip({ receipt }: { receipt: ReceiptData }) {
  const ref = useRef<HTMLDivElement>(null);
  const p = receipt.property;
  const provisional = isProvisional(receipt.reconcileStatus);
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex gap-2 py-0.5">
      <span className="w-[120px] shrink-0 text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
  return (
    <div className="space-y-3">
      <button
        onClick={() => ref.current && printElementInNewWindow(ref.current)}
        className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark"
      >
        <Printer className="h-4 w-4" />
        Print / Share Slip
      </button>
      <div
        ref={ref}
        className="printable-area mx-auto max-w-[420px] rounded-xl border border-slate-300 bg-white p-5 text-[12px]"
        style={{ fontFamily: "Arial, sans-serif" }}
      >
        <div className="flex items-start gap-3 border-b border-slate-300 pb-2">
          <DocumentVerificationQR url={receipt.verificationUrl} />
          <div className="flex-1 text-center">
            <div className="text-base font-bold text-nnm-blue">MUNGER NAGAR NIGAM</div>
            <div className="text-[11px] font-semibold text-slate-600">PROPERTY TAX — COLLECTION SLIP</div>
            {provisional && (
              <div className="mt-1 rounded border border-amber-400 bg-amber-50 px-1 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                Temporary / Provisional — subject to realisation of {receipt.paymentMode.toLowerCase()}
              </div>
            )}
          </div>
        </div>
        <div className="mt-2">
          {row("Receipt No", receipt.formattedReceiptNo)}
          {row("Date", receipt.date)}
          {row("Holding No", String(p.holding_no ?? ""))}
          {row("Owner", String(p.owner_name ?? ""))}
          {row("Ward", String(p.ward ?? ""))}
          {row("Demand No", receipt.demandNo)}
          {row("Amount", <b>₹{money(receipt.amountReceived)}</b>)}
          {row("In words", receipt.amountInWords)}
          {row("Mode", receipt.paymentMode)}
          {receipt.instrument &&
            row(
              `${receipt.paymentMode} No.`,
              `${receipt.instrument.no} dt. ${receipt.instrument.date}, ${receipt.instrument.bank}${receipt.instrument.branch ? `, ${receipt.instrument.branch}` : ""}`,
            )}
          {row("Collected by", `${receipt.taxCollectorName ?? receipt.collectedBy}${receipt.taxCollectorCode ? ` (${receipt.taxCollectorCode})` : ""}`)}
        </div>
        <p className="mt-3 border-t border-slate-200 pt-2 text-[10px] text-slate-500">
          This slip acknowledges the payment. The official stamped receipt with the same Receipt No will be delivered by the
          Nagar Nigam. Scan the QR code to verify the receipt online.
        </p>
      </div>
    </div>
  );
}
