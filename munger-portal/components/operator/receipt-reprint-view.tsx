"use client";

import { useRef } from "react";
import { Printer, X } from "lucide-react";
import type { PrintableReceiptHistory } from "@/lib/operator-api";
import { DocumentVerificationQR } from "./document-verification-qr";
import { CancelledWatermark, CancelledBanner } from "./cancelled-document-notice";
import { printElementInNewWindow } from "@/lib/print-in-new-window";

function money(v: string | number | undefined | null): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ReceiptReprintView({ receipt, onClose }: { receipt: PrintableReceiptHistory; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <button
          onClick={() => printRef.current && printElementInNewWindow(printRef.current)}
          className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark"
        >
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </button>
        <button onClick={onClose} className="inline-flex items-center gap-1.5 text-sm font-medium text-nnm-blue hover:underline">
          <X className="h-4 w-4" />
          Close
        </button>
      </div>

      <div
        ref={printRef}
        className="printable-area rounded-xl border border-slate-200 bg-white p-8 text-[12px] text-[#222]"
        style={{ fontFamily: "Arial, sans-serif", position: "relative" }}
      >
        {receipt.cancelled && <CancelledWatermark />}
        <div className="flex items-start justify-between gap-3 border-b-2 border-nnm-blue pb-2">
          <DocumentVerificationQR url={receipt.verificationUrl} />
          <div className="flex-1 text-center">
            <h1 className="m-0 text-xl font-bold text-nnm-blue">MUNGER NAGAR NIGAM</h1>
            <div className="text-[13px] text-slate-500">PROPERTY TAX — PAYMENT RECEIPT (REPRINT)</div>
          </div>
          <div className="w-[170px] shrink-0 text-right text-[11px]">
            <div>
              <b className="text-nnm-blue">Receipt No -</b> {receipt.formattedReceiptNo}
            </div>
            <div>
              <b className="text-nnm-blue">Receipt Date -</b> {receipt.date}
            </div>
            {receipt.demandNo && (
              <div>
                <b className="text-nnm-blue">Against Demand No -</b> {receipt.demandNo}
              </div>
            )}
          </div>
        </div>

        {receipt.cancelled && <CancelledBanner reason={receipt.cancelledReason} />}

        <div className="mt-3.5 flex gap-5">
          <div className="flex-1 space-y-0.5">
            <div>
              <b className="inline-block w-[140px]">Holding No</b> {receipt.holdingNo}
            </div>
            {receipt.oldHoldingNo ? (
              <div>
                <b className="inline-block w-[140px]">Old Holding No</b> {receipt.oldHoldingNo}
              </div>
            ) : null}
            <div>
              <b className="inline-block w-[140px]">Owner Name</b> {receipt.ownerName}
            </div>
            <div>
              <b className="inline-block w-[140px]">Address</b> {receipt.address}
            </div>
          </div>
          <div className="flex-1 space-y-0.5">
            <div>
              <b className="inline-block w-[140px]">Payment Mode</b> {receipt.paymentMode}
            </div>
            <div>
              <b className="inline-block w-[140px]">Counter</b> {receipt.counter ?? "—"}
            </div>
          </div>
        </div>

        {receipt.breakdown && (
          <table className="mt-3.5 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-400 p-1.5 text-left">Particulars</th>
                <th className="border border-slate-400 p-1.5 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-400 p-1.5">Annual Rental Value (ARV)</td>
                <td className="border border-slate-400 p-1.5 text-right">{money(receipt.breakdown.arv)}</td>
              </tr>
              <tr>
                <td className="border border-slate-400 p-1.5">Current Year Tax (net)</td>
                <td className="border border-slate-400 p-1.5 text-right">{money(receipt.breakdown.currentYearTaxNet)}</td>
              </tr>
              {Number(receipt.breakdown.previousYearsTaxBase) > 0 && (
                <tr>
                  <td className="border border-slate-400 p-1.5">Previous Years&apos; Outstanding Demand</td>
                  <td className="border border-slate-400 p-1.5 text-right">{money(receipt.breakdown.previousYearsTaxBase)}</td>
                </tr>
              )}
              {Number(receipt.breakdown.totalFineAmount) > 0 && (
                <tr>
                  <td className="border border-slate-400 p-1.5">Fine / Penalty</td>
                  <td className="border border-slate-400 p-1.5 text-right">{money(receipt.breakdown.totalFineAmount)}</td>
                </tr>
              )}
              {Number(receipt.breakdown.otherCharges) > 0 && (
                <tr>
                  <td className="border border-slate-400 p-1.5">Other Charges</td>
                  <td className="border border-slate-400 p-1.5 text-right">{money(receipt.breakdown.otherCharges)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {receipt.arrearStagesPaid.length > 0 && (
          <>
            <div className="mt-3 text-[11px] font-bold">Arrear Period(s) Cleared by This Payment</div>
            <table className="mt-1 w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-400 p-1.5 text-left">Period</th>
                  <th className="border border-slate-400 p-1.5 text-left">Years</th>
                  <th className="border border-slate-400 p-1.5 text-right">Annual (avg)</th>
                  <th className="border border-slate-400 p-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {receipt.arrearStagesPaid.map((s, i) => (
                  <tr key={i}>
                    <td className="border border-slate-400 p-1.5">{s.period}</td>
                    <td className="border border-slate-400 p-1.5">{s.years}</td>
                    <td className="border border-slate-400 p-1.5 text-right">{s.annualCharge}</td>
                    <td className="border border-slate-400 p-1.5 text-right">{s.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div
          className={`relative z-20 mt-3.5 flex items-center justify-between rounded-md p-3 ${
            receipt.cancelled ? "border-2 border-red-600 bg-red-50" : "bg-slate-50"
          }`}
        >
          <span className="text-[11px] font-semibold">
            Total Received {receipt.cancelled && <span className="font-extrabold text-red-700">(CANCELLED - NOT VALID)</span>}
          </span>
          <span className={`font-mono text-lg font-semibold ${receipt.cancelled ? "text-red-700 line-through" : "text-nnm-blue"}`}>
            ₹{money(receipt.amountReceived)}
          </span>
        </div>
        <p className="mt-1.5 text-[10.5px] italic text-slate-600">{receipt.amountInWords}</p>

        <p className="mt-6 text-[10px] text-slate-500">
          This is a reprint of a computer generated receipt, exactly as originally issued. Collected by{" "}
          {receipt.collectedBy}
          {receipt.taxCollectorName ? ` via tax collector ${receipt.taxCollectorName} (${receipt.taxCollectorCode})` : ""}.
          No figure on this reprint has been recalculated or altered.
        </p>
      </div>
    </div>
  );
}