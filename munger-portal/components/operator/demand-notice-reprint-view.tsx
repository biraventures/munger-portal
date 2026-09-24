"use client";

import { useRef } from "react";
import { Printer, X } from "lucide-react";
import type { PrintableDemandNoticeHistory } from "@/lib/operator-api";
import { DocumentVerificationQR } from "./document-verification-qr";
import { printElementInNewWindow } from "@/lib/print-in-new-window";
import { CancelledWatermark, CancelledBanner } from "./cancelled-document-notice";

function money(v: string | number | undefined | null): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DemandNoticeReprintView({ notice, onClose }: { notice: PrintableDemandNoticeHistory; onClose: () => void }) {
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
        {notice.cancelled && <CancelledWatermark />}
        <div className="flex items-start justify-between gap-3 border-b-2 border-nnm-blue pb-2">
          <DocumentVerificationQR url={notice.verificationUrl} />
          <div className="flex-1 text-center">
            <h1 className="m-0 text-xl font-bold text-nnm-blue">MUNGER NAGAR NIGAM</h1>
            <div className="text-[13px] text-slate-500">
              PROPERTY TAX — DEMAND NOTICE (REPRINT){notice.reminderLabel ? ` — ${notice.reminderLabel.toUpperCase()}` : ""}
            </div>
          </div>
          <div className="w-[170px] shrink-0 text-right text-[11px]">
            <div>
              <b className="text-nnm-blue">Demand Notice No -</b> {notice.formattedDemandNo}
            </div>
            <div>
              <b className="text-nnm-blue">Notice Date -</b> {notice.date}
            </div>
            <div>
              <b className="text-nnm-blue">Assessment Year -</b> {notice.assessmentYear ?? "—"}
            </div>
          </div>
        </div>

        {notice.cancelled && <CancelledBanner reason={notice.cancelledReason} />}

        <div className="mt-3.5 flex gap-5">
          <div className="flex-1 space-y-0.5">
            <div>
              <b className="inline-block w-[140px]">Holding No</b> {notice.holdingNo}
            </div>
            <div>
              <b className="inline-block w-[140px]">Owner Name</b> {notice.ownerName}
            </div>
            <div>
              <b className="inline-block w-[140px]">Address</b> {notice.address}
            </div>
          </div>
        </div>

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
              <td className="border border-slate-400 p-1.5 text-right">{money(notice.arv)}</td>
            </tr>
            <tr>
              <td className="border border-slate-400 p-1.5">Current Year Tax (net)</td>
              <td className="border border-slate-400 p-1.5 text-right">{money(notice.currentYearTaxNet)}</td>
            </tr>
            {Number(notice.previousYearsTaxBase) > 0 && (
              <tr>
                <td className="border border-slate-400 p-1.5">Previous Years&apos; Outstanding Demand</td>
                <td className="border border-slate-400 p-1.5 text-right">{money(notice.previousYearsTaxBase)}</td>
              </tr>
            )}
            {Number(notice.totalFineAmount) > 0 && (
              <tr>
                <td className="border border-slate-400 p-1.5">Fine / Penalty</td>
                <td className="border border-slate-400 p-1.5 text-right">{money(notice.totalFineAmount)}</td>
              </tr>
            )}
            {Number(notice.otherCharges) > 0 && (
              <tr>
                <td className="border border-slate-400 p-1.5">Other Charges (SW, water, boring, form fee, misc)</td>
                <td className="border border-slate-400 p-1.5 text-right">{money(notice.otherCharges)}</td>
              </tr>
            )}
            <tr className={notice.cancelled ? "relative z-20 border-2 border-red-600 bg-red-50 font-bold" : "bg-slate-50 font-bold"}>
              <td className="border border-slate-400 p-1.5">
                Total Amount Demanded {notice.cancelled && <span className="font-extrabold text-red-700">(CANCELLED - NOT VALID)</span>}
              </td>
              <td className={`border border-slate-400 p-1.5 text-right ${notice.cancelled ? "text-red-700 line-through" : ""}`}>
                {money(notice.totalAmountDemanded)}
              </td>
            </tr>
          </tbody>
        </table>

        {notice.settled ? (
          <p className="mt-3 text-[11px] font-semibold text-green-700">
            This demand has been settled — Receipt No {notice.settledReceiptNo}.
          </p>
        ) : notice.superseded ? (
          <p className="mt-3 text-[11px] font-semibold text-slate-500">
            This demand was superseded by a later reminder notice and is no longer separately payable.
          </p>
        ) : (
          <p className="mt-3 text-[11px] font-semibold text-amber-700">This demand has not yet been settled.</p>
        )}

        {notice.reminderLabel && notice.previousUnsettledDemandNos && (
          <div className="mt-2.5 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            <b>This was a {notice.reminderLabel} notice.</b> It superseded and settled the previous unsettled
            notice(s): {notice.previousUnsettledDemandNos}.
          </div>
        )}

        <p className="mt-6 text-[10px] text-slate-500">
          This is a reprint of a computer generated demand notice, exactly as originally issued. Generated by{" "}
          {notice.generatedBy}. No figure on this reprint has been recalculated or altered.
        </p>
      </div>
    </div>
  );
}
