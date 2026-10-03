"use client";

import { useRef } from "react";
import { Printer, X } from "lucide-react";
import type { PrintableShopReceiptHistory } from "@/lib/shop-api";
import { DocumentVerificationQR } from "./document-verification-qr";
import { printElementInNewWindow } from "@/lib/print-in-new-window";

function money(v: string | number | undefined | null): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ShopReceiptReprintView({ receipt, onClose }: { receipt: PrintableShopReceiptHistory; onClose: () => void }) {
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

      <div ref={printRef}
        className="printable-area rounded-xl border border-slate-200 bg-white p-8 text-[12px] text-[#222]" style={{ fontFamily: "Arial, sans-serif" }}>
        <div className="flex items-start justify-between gap-3 border-b-2 border-nnm-blue pb-2">
          <DocumentVerificationQR url={receipt.verificationUrl} />
          <div className="flex-1 text-center">
            <h1 className="m-0 text-xl font-bold text-nnm-blue">MUNGER NAGAR NIGAM</h1>
            <div className="text-[13px] text-slate-500">MUNICIPAL SHOP RENT — PAYMENT RECEIPT (REPRINT)</div>
          </div>
          <div className="w-[170px] shrink-0 text-right text-[11px]">
            <div>
              <b className="text-nnm-blue">Receipt No -</b> {receipt.formattedReceiptNo}
            </div>
            <div>
              <b className="text-nnm-blue">Receipt Date -</b> {receipt.date}
            </div>
            {receipt.periodStartMonth && (
              <div>
                <b className="text-nnm-blue">Against Period -</b> {receipt.periodStartMonth} to {receipt.periodEndMonth}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3.5 flex gap-5">
          <div className="flex-1 space-y-0.5">
            <div>
              <b className="inline-block w-[140px]">Shop No</b> {receipt.shopNo}
            </div>
            <div>
              <b className="inline-block w-[140px]">Market</b> {receipt.marketName ?? "—"}
            </div>
            <div>
              <b className="inline-block w-[140px]">Location</b> {receipt.location}
            </div>
          </div>
          <div className="flex-1 space-y-0.5">
            <div>
              <b className="inline-block w-[140px]">Holder Name</b> {receipt.holderName}
            </div>
            <div>
              <b className="inline-block w-[140px]">Payment Mode</b> {receipt.paymentMode}
            </div>
            <div>
              <b className="inline-block w-[140px]">Counter</b> {receipt.counter ?? "—"}
            </div>
            {receipt.tvNumber && (
              <div>
                <b className="inline-block w-[140px]">T.V. No.</b> {receipt.tvNumber}
              </div>
            )}
            {receipt.tvDate && (
              <div>
                <b className="inline-block w-[140px]">T.V. Date</b> {receipt.tvDate}
              </div>
            )}
          </div>
        </div>

        {receipt.baseRentAmount && (
          <table className="mt-3.5 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-400 p-1.5 text-left">Particulars</th>
                <th className="border border-slate-400 p-1.5 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-400 p-1.5">
                  Rent ({receipt.periodStartMonth} to {receipt.periodEndMonth})
                </td>
                <td className="border border-slate-400 p-1.5 text-right">{money(receipt.baseRentAmount)}</td>
              </tr>
              {Number(receipt.penaltyAmount) > 0 && (
                <tr>
                  <td className="border border-slate-400 p-1.5">Late Fee / Penalty</td>
                  <td className="border border-slate-400 p-1.5 text-right">{money(receipt.penaltyAmount)}</td>
                </tr>
              )}
              {Number(receipt.miscCostAmount) > 0 && (
                <tr>
                  <td className="border border-slate-400 p-1.5">Misc Cost{receipt.miscCostReason ? ` (${receipt.miscCostReason})` : ""}</td>
                  <td className="border border-slate-400 p-1.5 text-right">{money(receipt.miscCostAmount)}</td>
                </tr>
              )}
              {Number(receipt.miscRebateAmount) > 0 && (
                <tr>
                  <td className="border border-slate-400 p-1.5">Rebate{receipt.miscRebateReason ? ` (${receipt.miscRebateReason})` : ""}</td>
                  <td className="border border-slate-400 p-1.5 text-right">-{money(receipt.miscRebateAmount)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        <div className="mt-3.5 flex items-center justify-between rounded-md bg-slate-50 p-3">
          <span className="text-[11px] font-semibold">Total Received</span>
          <span className="font-mono text-lg font-semibold text-nnm-blue">₹{money(receipt.amountReceived)}</span>
        </div>

        <p className="mt-6 text-[10px] text-slate-500">
          This is a reprint of a computer generated receipt, exactly as originally issued. Collected by{" "}
          {receipt.collectedBy}. No figure on this reprint has been recalculated or altered.
        </p>
      </div>
    </div>
  );
}
