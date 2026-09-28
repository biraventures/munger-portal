"use client";

import { useRef } from "react";
import { Printer, X } from "lucide-react";
import { printElementInNewWindow } from "@/lib/print-in-new-window";
import type { GeneratedCollectionIssueNotice } from "@/lib/admin-api";

function money(v: unknown): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Static chrome around the generated body text - the body itself already comes pre-translated from the backend template, but these surrounding labels are only ever in English, so they need their own Hindi wording. */
const CHROME_LABELS = {
  en: {
    corporationName: "MUNGER NAGAR NIGAM",
    noticeNo: "Notice No -",
    noticeDate: "Notice Date -",
    holdingNo: "Holding No",
    demandNoticeNo: "Demand Notice No",
    notYetGenerated: "Not yet generated",
    legalBasis: "Legal Basis:",
    cityManager: "City Manager",
    demandNoticeAttached: "PROPERTY TAX - DEMAND NOTICE (ATTACHED)",
    particulars: "Particulars",
    amount: "Amount (₹)",
    arv: "Annual Rental Value (ARV)",
    currentYearTax: "Current Year Tax (net)",
    previousYearsOutstanding: "Previous Years' Outstanding Demand",
    fine: "Fine / Penalty",
    otherCharges: "Other Charges (SW, water, boring, form fee, misc)",
    totalDemanded: "Total Amount Demanded",
    settled: (receiptNo: string) => `This demand has been settled - Receipt No ${receiptNo}.`,
    notSettled: "This demand has not yet been settled.",
  },
  hi: {
    corporationName: "मुंगेर नगर निगम",
    noticeNo: "सूचना क्रमांक -",
    noticeDate: "सूचना दिनांक -",
    holdingNo: "धारक क्रमांक",
    demandNoticeNo: "मांग सूचना क्रमांक",
    notYetGenerated: "अभी जारी नहीं की गई",
    legalBasis: "विधिक आधार:",
    cityManager: "नगर आयुक्त (सिटी मैनेजर)",
    demandNoticeAttached: "संपत्ति कर - मांग सूचना (संलग्न)",
    particulars: "विवरण",
    amount: "राशि (₹)",
    arv: "वार्षिक भाड़ा मूल्य (ARV)",
    currentYearTax: "चालू वर्ष कर (शुद्ध)",
    previousYearsOutstanding: "पूर्व वर्षों की बकाया मांग",
    fine: "जुर्माना / शास्ति",
    otherCharges: "अन्य प्रभार (ठोस अपशिष्ट, जल, बोरिंग, फॉर्म फीस, विविध)",
    totalDemanded: "कुल मांगित राशि",
    settled: (receiptNo: string) => `यह मांग निपटाई जा चुकी है - रसीद क्रमांक ${receiptNo}।`,
    notSettled: "यह मांग अभी तक निपटाई नहीं गई है।",
  },
} as const;

export function CollectionIssueNoticeView({ notice, onClose }: { notice: GeneratedCollectionIssueNotice; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const dn = notice.demandNotice;
  const t = CHROME_LABELS[notice.language];

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
        style={{ fontFamily: notice.language === "hi" ? "Mangal, 'Noto Sans Devanagari', Arial, sans-serif" : "Arial, sans-serif" }}
      >
        {/* --- Legal notice --- */}
        <div className="border-b-2 border-nnm-blue pb-2 text-center">
          <h1 className="m-0 text-xl font-bold text-nnm-blue">{t.corporationName}</h1>
          <div className="text-[13px] font-semibold uppercase text-slate-700">{notice.title}</div>
        </div>

        <div className="mt-3 flex justify-between text-[11px]">
          <div>
            <b className="text-nnm-blue">{t.noticeNo}</b> {notice.record.notice_no}
          </div>
          <div>
            <b className="text-nnm-blue">{t.noticeDate}</b> {notice.noticeDate}
          </div>
        </div>

        <div className="mt-3 space-y-0.5">
          <div>
            <b className="inline-block w-[140px]">{t.holdingNo}</b> {notice.issue.holding_no}
          </div>
          <div>
            <b className="inline-block w-[140px]">{t.demandNoticeNo}</b> {notice.record.demand_no ?? t.notYetGenerated}
          </div>
        </div>

        <div className="mt-4 space-y-2.5 whitespace-pre-line text-justify leading-relaxed">{notice.bodyText}</div>

        <div className="mt-4 rounded border border-slate-300 bg-slate-50 p-2.5 text-[10px] text-slate-600">
          <b>{t.legalBasis}</b> {notice.legalBasis}
        </div>

        <div className="mt-8 flex justify-end">
          <div className="text-center text-[11px]">
            <div className="mb-8">&nbsp;</div>
            <div className="border-t border-slate-400 pt-1">
              {t.cityManager}
              <br />
              {t.corporationName}
            </div>
          </div>
        </div>

        {/* --- Attached demand notice --- */}
        {dn && (
          <div className="mt-8 border-t-4 border-double border-slate-400 pt-4" style={{ pageBreakBefore: "always" }}>
            <div className="border-b-2 border-nnm-blue pb-2 text-center">
              <h2 className="m-0 text-lg font-bold text-nnm-blue">{t.corporationName}</h2>
              <div className="text-[13px] text-slate-500">{t.demandNoticeAttached}</div>
            </div>
            <div className="mt-3 flex justify-between text-[11px]">
              <div>
                <b className="text-nnm-blue">{t.demandNoticeNo} -</b> {String(dn.demand_no)}
              </div>
              <div>
                <b className="text-nnm-blue">{t.noticeDate}</b> {dn.notice_date ? new Date(String(dn.notice_date)).toLocaleDateString("en-IN") : "-"}
              </div>
            </div>
            <table className="mt-3.5 w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-400 p-1.5 text-left">{t.particulars}</th>
                  <th className="border border-slate-400 p-1.5 text-right">{t.amount}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-400 p-1.5">{t.arv}</td>
                  <td className="border border-slate-400 p-1.5 text-right">{money(dn.arv)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-400 p-1.5">{t.currentYearTax}</td>
                  <td className="border border-slate-400 p-1.5 text-right">{money(dn.current_year_tax_net)}</td>
                </tr>
                {Number(dn.previous_years_tax_base) > 0 && (
                  <tr>
                    <td className="border border-slate-400 p-1.5">{t.previousYearsOutstanding}</td>
                    <td className="border border-slate-400 p-1.5 text-right">{money(dn.previous_years_tax_base)}</td>
                  </tr>
                )}
                {Number(dn.total_fine_amount) > 0 && (
                  <tr>
                    <td className="border border-slate-400 p-1.5">{t.fine}</td>
                    <td className="border border-slate-400 p-1.5 text-right">{money(dn.total_fine_amount)}</td>
                  </tr>
                )}
                {Number(dn.other_charges) > 0 && (
                  <tr>
                    <td className="border border-slate-400 p-1.5">{t.otherCharges}</td>
                    <td className="border border-slate-400 p-1.5 text-right">{money(dn.other_charges)}</td>
                  </tr>
                )}
                <tr className="bg-slate-50 font-bold">
                  <td className="border border-slate-400 p-1.5">{t.totalDemanded}</td>
                  <td className="border border-slate-400 p-1.5 text-right">{money(dn.total_amount_demanded)}</td>
                </tr>
              </tbody>
            </table>
            {dn.settled ? (
              <p className="mt-3 text-[11px] font-semibold text-green-700">{t.settled(String(dn.settled_receipt_no))}</p>
            ) : (
              <p className="mt-3 text-[11px] font-semibold text-amber-700">{t.notSettled}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
