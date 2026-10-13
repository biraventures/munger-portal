"use client";

import { HindiTaxTerms } from "./hindi-tax-terms";
import { DeclarationAcceptedOnReceipt } from "../online-declaration";
import { useRef, useState } from "react";
import { Printer } from "lucide-react";
import type { ReceiptData } from "@/lib/payment-api";
import { DocumentVerificationQR } from "./document-verification-qr";
import { NoticeView } from "./notice-view";
import { printElementInNewWindow } from "@/lib/print-in-new-window";

function money(v: string | number | undefined | null): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

export function ReceiptView({ receipt, onNewPayment }: { receipt: ReceiptData; onNewPayment: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const [showBalanceNotice, setShowBalanceNotice] = useState(false);
  const p = receipt.property;
  const calc = receipt.taxCalc;

  // After a part payment the balance demand notice (remaining years) is generated automatically - show it on request.
  if (showBalanceNotice && receipt.followUpNotice) {
    return <NoticeView notice={receipt.followUpNotice} onClose={() => setShowBalanceNotice(false)} closeLabel="Back to receipt" />;
  }

  return (
    <div>
      {receipt.followUpNotice && (
        <div className="no-print mb-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900">
          <b>Part payment received.</b> A demand notice for the remaining dues (₹{money(receipt.followUpNotice.totals.grandTotal)}, Demand No{" "}
          {receipt.followUpNotice.formattedDemandNo}) has been generated so the owner can verify what is still pending.{" "}
          <button onClick={() => setShowBalanceNotice(true)} className="font-semibold text-nnm-blue underline">
            View / print balance demand notice
          </button>
        </div>
      )}
      {receipt.followUpNoticeError && (
        <div role="alert" className="no-print mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Part payment received, but the balance demand notice could not be generated automatically ({receipt.followUpNoticeError}). Generate it
          from the property page.
        </div>
      )}
      <div className="no-print mb-4 flex items-center justify-between">
        <button
          onClick={() => printRef.current && printElementInNewWindow(printRef.current)}
          className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark"
        >
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </button>
        <button onClick={onNewPayment} className="text-sm font-medium text-nnm-blue hover:underline">
          Collect another payment
        </button>
      </div>

      <div ref={printRef}
        className="printable-area rounded-xl border border-slate-200 bg-white p-8 text-[12px] text-[#222]" style={{ fontFamily: "Arial, sans-serif" }}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b-2 border-nnm-blue pb-2">
          <DocumentVerificationQR url={receipt.verificationUrl} />
          <div className="flex-1 text-center">
            <h1 className="m-0 text-xl font-bold text-nnm-blue">MUNGER NAGAR NIGAM</h1>
            <div className="text-[13px] text-slate-500">HOLDING TAX RECEIPT</div>
          </div>
          <div className="w-[170px] shrink-0 text-right text-[11px]">
            <div>
              <b className="text-nnm-blue">Property Tax Receipt No -</b> {receipt.formattedReceiptNo}
            </div>
            <div>
              <b className="text-nnm-blue">Assessment Year -</b> {str(p.assessment_year)}
            </div>
            <div>
              <b className="text-nnm-blue">Receipt Date -</b> {receipt.date}
            </div>
            {receipt.demandNo && (
              <div>
                <b className="text-nnm-blue">Against Demand Notice -</b> {receipt.demandNo}
              </div>
            )}
          </div>
        </div>

        {/* Info grid */}
        <div className="mt-3.5 flex gap-5">
          <div className="flex-1 space-y-0.5">
            <div>
              <b className="inline-block w-[130px]">Owner Name</b> {str(p.owner_name)}
            </div>
            <div>
              <b className="inline-block w-[130px]">{str(p.relation_type)}</b> {str(p.relation_name)}
            </div>
            <div>
              <b className="inline-block w-[130px]">Mobile No</b> {str(p.mobile_no)}
            </div>
            <div>
              <b className="inline-block w-[130px]">Area (Total Plot)</b> {str(p.area_sqft)} sqft
            </div>
            <div>
              <b className="inline-block w-[130px]">Address</b> {str(p.address)}
            </div>
            <div>
              <b className="inline-block w-[130px]">Ward</b> {str(p.ward)}
            </div>
            <div>
              <b className="inline-block w-[130px]">Zone</b> {str(p.zone)}
            </div>
            <div>
              <b className="inline-block w-[130px]">Holding No</b> {str(p.holding_no)}
            </div>
            {p.old_holding_no ? (
              <div>
                <b className="inline-block w-[130px]">Old Holding No</b> {str(p.old_holding_no)}
              </div>
            ) : null}
          </div>
          <div className="flex-1 space-y-0.5">
            <div>
              <b className="inline-block w-[130px]">Road Type</b> {str(p.road_type)}
            </div>
            <div>
              <b className="inline-block w-[130px]">Rain Water Harvesting</b> {p.rain_water_harvesting ? "Yes" : "No"}
            </div>
            <div>
              <b className="inline-block w-[130px]">Assessment Year</b> {str(p.assessment_year)}
            </div>
            <div>
              <b className="inline-block w-[130px]">Vacant Area (taxable)</b> {calc.vacant.taxableArea} sqft
            </div>
          </div>
        </div>

        {/* Floor breakdown */}
        <table className="mt-2.5 w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-400 p-1.5 text-left">Floor</th>
              <th className="border border-slate-400 p-1.5 text-left">Area</th>
              <th className="border border-slate-400 p-1.5 text-left">Const.</th>
              <th className="border border-slate-400 p-1.5 text-left">Usage</th>
              <th className="border border-slate-400 p-1.5 text-left">Occ.</th>
              <th className="border border-slate-400 p-1.5 text-right">Rate</th>
              <th className="border border-slate-400 p-1.5 text-right">ARV</th>
              <th className="border border-slate-400 p-1.5 text-right">Tax @ 9%</th>
            </tr>
          </thead>
          <tbody>
            {Number(calc.vacant.groundFloorBuiltArea) > Number(p.area_sqft) ? (
              // Reverse-solved floor area (from a known ARV, for a partially-known
              // property) came out larger than the plot itself — physically
              // impossible to show as a per-floor breakdown without looking like
              // an error to whoever reads the receipt. Same total ARV/Tax either
              // way (unaffected below); just collapsed to one line here.
              <tr>
                <td className="border border-slate-400 p-1.5" colSpan={2}>
                  <b>Total Built-up Area</b>
                </td>
                <td className="border border-slate-400 p-1.5" colSpan={6}>
                  {calc.vacant.groundFloorBuiltArea} sqft
                </td>
              </tr>
            ) : (
              calc.breakdown.map((row, i) =>
                row.error ? (
                  <tr key={i}>
                    <td colSpan={8} className="border border-slate-400 p-1.5 text-red-700">
                      {row.floor}: {row.error}
                    </td>
                  </tr>
                ) : row.demolished ? (
                  <tr key={i} className="italic text-slate-400">
                    <td className="border border-slate-400 p-1.5">{row.floor} (Demolished)</td>
                    <td colSpan={4} className="border border-slate-400 p-1.5">
                      Not part of current total
                    </td>
                    <td className="border border-slate-400 p-1.5 text-right">—</td>
                    <td className="border border-slate-400 p-1.5 text-right">N/A</td>
                    <td className="border border-slate-400 p-1.5 text-right">N/A</td>
                  </tr>
                ) : (
                  <tr key={i}>
                    <td className="border border-slate-400 p-1.5">{row.floor}</td>
                    <td className="border border-slate-400 p-1.5">{row.area}</td>
                    <td className="border border-slate-400 p-1.5">{row.constType}</td>
                    <td className="border border-slate-400 p-1.5">{row.usage}</td>
                    <td className="border border-slate-400 p-1.5">{row.occupancy}</td>
                    <td className="border border-slate-400 p-1.5 text-right">{row.rate}</td>
                    <td className="border border-slate-400 p-1.5 text-right">{row.floorArv}</td>
                    <td className="border border-slate-400 p-1.5 text-right">{row.floorTax}</td>
                  </tr>
                ),
              )
            )}
            <tr className={Number(calc.vacant.tax) <= 0 ? "text-slate-400" : ""}>
              <td className="border border-slate-400 p-1.5">Vacant Land</td>
              <td className="border border-slate-400 p-1.5">{calc.vacant.taxableArea}</td>
              <td colSpan={3} className="border border-slate-400 p-1.5">
                —
              </td>
              <td className="border border-slate-400 p-1.5 text-right">{calc.vacant.rate}</td>
              <td className="border border-slate-400 p-1.5 text-right text-[10px]">direct rate</td>
              <td className="border border-slate-400 p-1.5 text-right">{calc.vacant.tax}</td>
            </tr>
            <tr>
              <td colSpan={6} className="border border-slate-400 p-1.5">
                <b>Total ARV / Current Year Tax (before rebate)</b>
              </td>
              <td className="border border-slate-400 p-1.5 text-right">
                <b>{calc.arv}</b>
              </td>
              <td className="border border-slate-400 p-1.5 text-right">
                <b>{calc.currentTax}</b>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Amount line */}
        <div className="mt-3 text-[12px]">
          A sum of <b>Rs- {money(receipt.amountReceived)} (In words - Rupees {receipt.amountInWords} only)</b> has
          been received from Mr/Mrs <b>{str(p.owner_name)}</b> towards the payment of tax on the Assessment Year{" "}
          <b>{str(p.assessment_year)}</b> as per the details below.
        </div>

        {/* Totals table */}
        <table className="mt-2.5 w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-slate-400 bg-slate-100 p-1.5 text-left" colSpan={5}>
                Particulars
              </th>
              <th className="border border-slate-400 bg-slate-100 p-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {Number(receipt.totals.yearWiseArrears) > 0 && (
              <tr>
                <td colSpan={5} className="border-x border-slate-400 p-1.5">
                  Pending Arrears (Outstanding Demand)
                </td>
                <td className="border-x border-slate-400 p-1.5 text-right">{receipt.totals.yearWiseArrears}</td>
              </tr>
            )}
            {Number(receipt.totals.penalty) > 0 && (
              <tr>
                <td colSpan={5} className="border-x border-slate-400 p-1.5">
                  + Penalty (late fee on arrears, per pending year)
                </td>
                <td className="border-x border-slate-400 p-1.5 text-right">{receipt.totals.penalty}</td>
              </tr>
            )}
            <tr>
              <td colSpan={5} className="border-x border-slate-400 p-1.5">
                {str(p.assessment_year)} (Current)
              </td>
              <td className="border-x border-slate-400 p-1.5 text-right">{receipt.totals.currentTax}</td>
            </tr>
            {Number(receipt.totals.rebate) > 0 && (
              <tr>
                <td colSpan={5} className="border-x border-slate-400 p-1.5">
                  − Plinth Area / Rain Water Harvesting Rebate
                </td>
                <td className="border-x border-slate-400 p-1.5 text-right">{receipt.totals.rebate}</td>
              </tr>
            )}
            {Number(receipt.totals.currentTaxLateFee) > 0 && (
              <tr>
                <td colSpan={5} className="border-x border-slate-400 p-1.5">
                  + Late Fee on Current Year Tax
                </td>
                <td className="border-x border-slate-400 p-1.5 text-right">{receipt.totals.currentTaxLateFee}</td>
              </tr>
            )}
            {Number(receipt.totals.currentTaxRebate) > 0 && (
              <tr>
                <td colSpan={5} className="border-x border-slate-400 p-1.5">
                  − Early-Payment Rebate
                </td>
                <td className="border-x border-slate-400 p-1.5 text-right">{receipt.totals.currentTaxRebate}</td>
              </tr>
            )}
            <tr>
              <td colSpan={5} className="border-x border-slate-400 p-1.5">
                <b>Current Year Net Payable</b>
              </td>
              <td className="border-x border-slate-400 p-1.5 text-right">
                <b>{receipt.totals.currentTotal}</b>
              </td>
            </tr>
            <tr>
              <td colSpan={5} className="border-x border-slate-400 p-1.5">
                Solid Waste User Charge
              </td>
              <td className="border-x border-slate-400 p-1.5 text-right">{str(p.solid_waste_charge)}</td>
            </tr>
            <tr>
              <td colSpan={5} className="border-x border-b border-slate-400 p-1.5">
                <b>Total</b>
              </td>
              <td className="border-x border-b border-slate-400 p-1.5 text-right">
                <b>{receipt.totals.grandTotal}</b>
              </td>
            </tr>
          </tbody>
        </table>

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

        {/* Payment box */}
        <div className="mt-3 border border-slate-400">
          <table className="w-full text-[11px]">
            <tbody>
              <tr>
                <td className="w-[130px] p-1.5">Payee Name</td>
                <td className="p-1.5">{str(p.owner_name)}</td>
                <td className="w-[130px] p-1.5">Payment Mode</td>
                <td className="p-1.5">{receipt.paymentMode}</td>
              </tr>
              <tr>
                <td className="p-1.5">Collected By</td>
                <td className="p-1.5">{receipt.collectedBy}</td>
                <td className="p-1.5">Amount Received</td>
                <td className="p-1.5">
                  <b>{money(receipt.amountReceived)}</b>
                </td>
              </tr>
              {receipt.taxCollectorName && (
                <tr>
                  <td className="p-1.5">Tax Collector</td>
                  <td className="p-1.5" colSpan={3}>
                    {receipt.taxCollectorName} ({receipt.taxCollectorCode})
                  </td>
                </tr>
              )}
              {receipt.tvNumber && (
                <tr>
                  <td className="p-1.5">T.V. No.</td>
                  <td className="p-1.5">{receipt.tvNumber}</td>
                  <td className="p-1.5">T.V. Date</td>
                  <td className="p-1.5">{receipt.tvDate}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 border-t border-slate-300 pt-2 text-[9.5px] text-slate-500">
          Please keep this payment receipt for future reference.
          <br />
          Holding Tax payment receipt is not valid as proof of ownership of the property.
          <br />
          <b>This payment receipt will be valid only after getting it duly stamped and signed from Nagar Nigam Munger Office.</b>
          <br />
          Receipt Generated on {receipt.date}
        </div>

        <div className="mt-2.5 rounded border border-slate-400 bg-slate-50 p-2.5 text-[10px] leading-snug text-slate-700">
          This tax payment receipt is generated against demand notice{" "}
          <b>{receipt.demandNo ? `No. ${receipt.demandNo}` : "(demand notice number not recorded)"}</b>. By paying the mentioned tax
          amount you have agreed to the contents of the demand notice and have no objection with respect to the measurements, the
          holding parameters and other charges.
        </div>

        <HindiTaxTerms />

        {receipt.onlineDeclarationAcceptedAt && <DeclarationAcceptedOnReceipt acceptedAt={receipt.onlineDeclarationAcceptedAt} />}
      </div>
    </div>
  );
}