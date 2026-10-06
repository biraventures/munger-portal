"use client";

import { useRef } from "react";
import { Printer } from "lucide-react";
import type { DemandNoticeData, DemandNoticeReprintData } from "@/lib/demand-notice-api";
import { DocumentVerificationQR } from "./document-verification-qr";
import { printElementInNewWindow } from "@/lib/print-in-new-window";
import { CancelledWatermark, CancelledBanner, SupersededBanner } from "./cancelled-document-notice";

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/**
 * Renders a demand notice - used both right after generation (a
 * freshly-created DemandNoticeData, never settled/cancelled/
 * superseded yet) and for a reprint (a DemandNoticeReprintData, which
 * adds the notice's current lifecycle status). Same component either
 * way, so a reprint is word-for-word, line-for-line identical to the
 * notice as originally issued - the only addition for a reprint is
 * the lifecycle-status block at the very end (settled/cancelled/
 * superseded), which wasn't and couldn't have been on the original
 * printout since that status didn't exist yet at generation time.
 */
export function NoticeView({
  notice,
  onClose,
  closeLabel = "Back to property",
}: {
  notice: DemandNoticeData | DemandNoticeReprintData;
  onClose: () => void;
  closeLabel?: string;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const p = notice.property;
  const calc = notice.taxCalc;
  const t = notice.totals;
  // Present only on a reprint (see DemandNoticeReprintData) - absent on
  // a freshly-generated notice, which by definition is none of these yet.
  const status = "cancelled" in notice ? notice : null;

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
        <button onClick={onClose} className="text-sm font-medium text-nnm-blue hover:underline">
          {closeLabel}
        </button>
      </div>

      <div
        ref={printRef}
        className="printable-area rounded-xl border border-slate-200 bg-white p-8 text-[12px] text-[#222]"
        style={{ fontFamily: "Arial, sans-serif", position: "relative" }}
      >
        {status?.cancelled && <CancelledWatermark />}
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b-2 border-nnm-blue pb-2">
          <DocumentVerificationQR url={notice.verificationUrl} />
          <div className="flex-1 text-center">
            <h1 className="m-0 text-xl font-bold text-nnm-blue">MUNGER NAGAR NIGAM</h1>
            <div className="text-[13px] font-bold text-red-700">
              HOLDING TAX — DEMAND NOTICE{notice.reminderLabel ? ` (${notice.reminderLabel.toUpperCase()})` : ""}
            </div>
          </div>
          <div className="w-[170px] shrink-0 text-right text-[11px]">
            <div>
              <b className="text-nnm-blue">Demand Notice No -</b> {notice.formattedDemandNo}
            </div>
            <div>
              <b className="text-nnm-blue">Assessment Year -</b> {str(p.assessment_year)}
            </div>
            <div>
              <b className="text-nnm-blue">Notice Date -</b> {notice.date}
            </div>
          </div>
        </div>

        {/* Reprint-only lifecycle status - see the `status` comment above. Not part of the notice as originally issued. */}
        {status?.cancelled && <CancelledBanner reason={status.cancelledReason} />}
        {status && !status.cancelled && status.superseded && <SupersededBanner />}

        {notice.reminderLabel && (
          <div className="mt-2.5 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            <b>This is a {notice.reminderLabel} notice.</b> It supersedes and settles the previous unsettled
            notice(s):{" "}
            {notice.previousUnsettledDemandNos.join(", ")}. Those earlier notices are no longer separately payable —
            only this notice&apos;s amount is due.
          </div>
        )}

        {t.partPayment && (
          <div className="mt-2.5 rounded border border-blue-400 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
            <b>PART PAYMENT NOTICE.</b> This notice covers only {t.partPayment.years} year(s):{" "}
            {t.partPayment.fromYear} to {t.partPayment.toYear}. After payment, tax will be treated as paid till{" "}
            {t.partPayment.toYear}; the remaining years up to the current year will be demanded separately.
          </div>
        )}

        {/* Not-a-receipt banner */}
        <div className="mt-2.5 rounded border-2 border-red-700 bg-red-50 px-3 py-2.5 text-center text-[13px] font-bold text-red-700">
          THIS IS NOT THE PAYMENT RECEIPT. KINDLY COLLECT THE PAYMENT RECEIPT WHEN YOU PAY THE TAX.
        </div>

        {/* Info grid */}
        <div className="mt-3.5 flex gap-5">
          <div className="flex-1 space-y-0.5">
            <div>
              <b className="inline-block w-[150px]">Owner Name</b> {str(p.owner_name)}
            </div>
            <div>
              <b className="inline-block w-[150px]">{str(p.relation_type)}</b> {str(p.relation_name)}
            </div>
            <div>
              <b className="inline-block w-[150px]">Mobile No</b> {str(p.mobile_no)}
            </div>
            <div>
              <b className="inline-block w-[150px]">Area (Total Plot)</b> {str(p.area_sqft)} sqft
            </div>
            <div>
              <b className="inline-block w-[150px]">Address</b> {str(p.address)}
            </div>
            <div>
              <b className="inline-block w-[150px]">Ward</b> {str(p.ward)}
            </div>
            <div>
              <b className="inline-block w-[150px]">Zone</b> {str(p.zone)}
            </div>
            <div>
              <b className="inline-block w-[150px]">Pincode</b> {str(p.pincode)}
            </div>
            <div>
              <b className="inline-block w-[150px]">Holding No</b> {str(p.holding_no)}
            </div>
            <div>
              <b className="inline-block w-[150px]">Old Holding No</b> {str(p.old_holding_no)}
            </div>
            <div>
              <b className="inline-block w-[150px]">Old PID</b> {str(p.old_pid)}
            </div>
          </div>
          <div className="flex-1 space-y-0.5">
            <div>
              <b className="inline-block w-[150px]">Road Type</b> {str(p.road_type)}
            </div>
            <div>
              <b className="inline-block w-[150px]">Rain Water Harvesting</b> {p.rain_water_harvesting ? "Yes" : "No"}
            </div>
            <div>
              <b className="inline-block w-[150px]">Assessment Year</b> {str(p.assessment_year)}
            </div>
            <div>
              <b className="inline-block w-[150px]">Ground Floor Built-up Area</b> {calc.vacant.groundFloorBuiltArea} sqft
            </div>
            <div>
              <b className="inline-block w-[150px]">Vacant Area (declared)</b> {calc.vacant.declaredArea} sqft
            </div>
            <div>
              <b className="inline-block w-[150px]">Taxable Vacant Area</b> {calc.vacant.taxableArea} sqft{" "}
              <span className="text-[9px] text-slate-400">(= Total Plot Area − Ground Floor Built-up Area × 1.43)</span>
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
              // an error to whoever reads the notice. Same total ARV/Tax either
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
                      Not part of current total — historical reference only
                    </td>
                    <td className="border border-slate-400 p-1.5 text-right">—</td>
                    <td className="border border-slate-400 p-1.5 text-right">{row.floorArv || "N/A"}</td>
                    <td className="border border-slate-400 p-1.5 text-right">{row.floorTax || "N/A"}</td>
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
              <td className="border border-slate-400 p-1.5 text-right text-[10px]">
                — (direct tax rate, not ARV-based)
              </td>
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

        {t.partPayment && (
          <table className="mt-2.5 w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="border border-slate-400 bg-slate-100 p-1.5 text-left">Particulars</th>
                <th className="border border-slate-400 bg-slate-100 p-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-400 p-1.5">
                  Tax Amount — {t.partPayment.fromYear} to {t.partPayment.toYear} ({t.partPayment.years} year(s))
                </td>
                <td className="border border-slate-400 p-1.5 text-right">{t.arrearsBaseTax}</td>
              </tr>
              <tr>
                <td className="border border-slate-400 p-1.5">Penalty (late fee on the above years, as on {notice.date})</td>
                <td className="border border-slate-400 p-1.5 text-right">{t.penalty}</td>
              </tr>
              <tr>
                <td className="border border-slate-400 p-1.5">
                  <b>Total Amount Due (Part Payment)</b>
                </td>
                <td className="border border-slate-400 p-1.5 text-right">
                  <b>{t.grandTotal}</b>
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {/* Totals table */}
        {!t.partPayment && (
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
            <tr>
              <td colSpan={5} className="border-x border-slate-400 p-1.5">
                <b>A. Tax Amount — Current Year</b>
              </td>
              <td className="border-x border-slate-400 p-1.5 text-right">
                <b>{t.currentTaxBase}</b>
              </td>
            </tr>
            <tr>
              <td colSpan={5} className="border-x border-slate-400 p-1.5 pl-6 italic text-slate-500">
                — of which, Vacant Land Tax (Taxable Vacant Area: {calc.vacant.taxableArea} sqft @ ₹{calc.vacant.rate}/sqft)
              </td>
              <td className="border-x border-slate-400 p-1.5 text-right italic text-slate-500">{calc.vacant.tax}</td>
            </tr>
            {Number(t.currentTaxAreaRebate) > 0 && (
              <tr>
                <td colSpan={5} className="border-x border-slate-400 p-1.5 pl-6 italic text-slate-500">
                  — Plinth Area / Rain Water Harvesting Rebate already applied
                  {t.currentTaxAreaRebateReason ? ` (${t.currentTaxAreaRebateReason})` : ""} — this is why A is less than
                  the floorwise total above
                </td>
                <td className="border-x border-slate-400 p-1.5 text-right italic text-slate-500">
                  −{t.currentTaxAreaRebate}
                </td>
              </tr>
            )}
            {Number(t.yearWiseArrears) > 0 && (
              <tr>
                <td colSpan={5} className="border-x border-slate-400 p-1.5">
                  <b>B. Tax Amount — Previous Years (Outstanding Demand, before penalty)</b>
                </td>
                <td className="border-x border-slate-400 p-1.5 text-right">
                  <b>{t.arrearsBaseTax}</b>
                </td>
              </tr>
            )}
            {Number(t.penalty) > 0 && (
              <tr>
                <td colSpan={5} className="border-x border-slate-400 p-1.5 pl-6 italic text-slate-500">
                  — Penalty (late fee on arrears above, computed per pending year)
                </td>
                <td className="border-x border-slate-400 p-1.5 text-right italic text-slate-500">{t.penalty}</td>
              </tr>
            )}
            {Number(t.totalFineAmount) > 0 && (
              <tr>
                <td colSpan={5} className="border-x border-slate-400 p-1.5">
                  <b>C. Total Fine Amount</b> (2%/month up to 31 Mar 2013, 1.5%/month after, since 1 Oct, current year)
                </td>
                <td className="border-x border-slate-400 p-1.5 text-right">
                  <b>{t.totalFineAmount}</b>
                </td>
              </tr>
            )}
            {Number(t.currentTaxRebate) > 0 && (
              <tr>
                <td colSpan={5} className="border-x border-slate-400 p-1.5">
                  − Early-Payment Rebate on Current Year Tax
                </td>
                <td className="border-x border-slate-400 p-1.5 text-right">{t.currentTaxRebate}</td>
              </tr>
            )}
            <tr>
              <td colSpan={5} className="border-x border-slate-400 p-1.5">
                Solid Waste User Charge
              </td>
              <td className="border-x border-slate-400 p-1.5 text-right">{str(p.solid_waste_charge)}</td>
            </tr>
            {Number(p.penal_charge) > 0 && (
              <tr>
                <td colSpan={5} className="border-x border-slate-400 p-1.5">
                  Penal Charge
                </td>
                <td className="border-x border-slate-400 p-1.5 text-right">{str(p.penal_charge)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={5} className="border-x border-slate-400 p-1.5">
                Water Charge
              </td>
              <td className="border-x border-slate-400 p-1.5 text-right">{str(p.water_charge)}</td>
            </tr>
            {Number(p.boring_charge) > 0 && (
              <tr>
                <td colSpan={5} className="border-x border-slate-400 p-1.5">
                  Boring Charge
                </td>
                <td className="border-x border-slate-400 p-1.5 text-right">{str(p.boring_charge)}</td>
              </tr>
            )}
            {Number(p.form_fee) > 0 && (
              <tr>
                <td colSpan={5} className="border-x border-slate-400 p-1.5">
                  Form Fee
                </td>
                <td className="border-x border-slate-400 p-1.5 text-right">{str(p.form_fee)}</td>
              </tr>
            )}
            {Number(p.misc_cost) > 0 && (
              <tr>
                <td colSpan={5} className="border-x border-slate-400 p-1.5">
                  Miscellaneous Cost ({str(p.misc_cost_reason)})
                </td>
                <td className="border-x border-slate-400 p-1.5 text-right">{str(p.misc_cost)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={5} className="border-x border-slate-400 p-1.5">
                <b>D. Solid Waste + Other Charges (subtotal)</b>
              </td>
              <td className="border-x border-slate-400 p-1.5 text-right">
                <b>{t.otherCharges}</b>
              </td>
            </tr>
            {Number(p.misc_rebate) > 0 && (
              <tr>
                <td colSpan={5} className="border-x border-slate-400 p-1.5">
                  − Miscellaneous Rebate ({str(p.misc_rebate_reason)})
                </td>
                <td className="border-x border-slate-400 p-1.5 text-right">{str(p.misc_rebate)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={5} className="border-x border-b border-slate-400 p-1.5">
                <b>Total Amount Due (A + B + Penalty + C + D, less any rebate above)</b>
              </td>
              <td className="border-x border-b border-slate-400 p-1.5 text-right">
                <b>{t.grandTotal}</b>
              </td>
            </tr>
          </tbody>
        </table>
        )}

        {/* Demand line */}
        <div className="mt-3.5 rounded border border-amber-400 bg-amber-50 px-3 py-2.5">
          You are hereby notified that an amount of <b>Rs. {t.grandTotal}</b> is outstanding against Holding No{" "}
          <b>{str(p.holding_no)}</b>
          {t.partPayment ? ` as part payment for ${t.partPayment.fromYear} to ${t.partPayment.toYear}` : ""}. Please clear the dues at the
          earliest at the Nagar Nigam counter to avoid penal charges.
        </div>

        <div className="mt-4 border-t border-slate-300 pt-2 text-[9.5px] text-slate-500">
          This is a computer generated demand notice. This notice is not a payment receipt.
          <br />
          This demand notice is generated based on the measurements provided by holding owner or captured during
          survey in the presence of holding owner, usage category, occupancy type and construction type as also the
          road type. If holding owner has any concerns they can file a written objection in Nagar Nigam Munger. If no
          objection is filed in due time, this demand notice will be considered valid.
          <br />
          <b>
            By agreeing to pay against this demand notice you are agreeing to all the measurements and holding parameters as
            reflected in the demand notice.
          </b>
          <br />
          Generated by {notice.generatedBy} on {notice.date}
        </div>

        {/* Reprint-only lifecycle status - see the `status` comment above. Not part of the notice as originally issued. */}
        {status && (
          <div className="mt-2 text-[9.5px] font-semibold">
            {status.settled ? (
              <span className="text-green-700">This demand has been settled — Receipt No {status.settledReceiptNo}.</span>
            ) : status.superseded ? (
              <span className="text-slate-500">This demand was superseded by a later reminder notice and is no longer separately payable.</span>
            ) : status.cancelled ? null : (
              <span className="text-amber-700">This demand has not yet been settled.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}