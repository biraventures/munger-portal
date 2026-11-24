"use client";

import { QRCodeSVG } from "qrcode.react";
import { dmy, rupees, type Ticket } from "@/lib/garden-api";

/**
 * A garden entry ticket: garden, date, time, persons, amount and the QR code the gatekeeper scans (valid once, on the
 * ticket's own date). Shown on the counter screen - the visitor can scan it with their phone to keep the e-ticket -
 * and on the e-ticket page itself.
 */
export function TicketCard({ t, showStaffDetails = false }: { t: Ticket; showStaffDetails?: boolean }) {
  const state =
    t.status === "cancelled"
      ? { text: "CANCELLED", tone: "bg-red-600" }
      : t.status !== "paid"
        ? { text: "NOT PAID", tone: "bg-red-600" }
        : t.usedAt
          ? { text: "USED - ENTRY DONE", tone: "bg-slate-500" }
          : { text: "VALID FOR ENTRY", tone: "bg-green-600" };
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-nnm-blue px-5 py-3 text-center text-white">
        <p className="text-[11px] uppercase tracking-wider text-white/80">Munger Nagar Nigam · Entry Ticket</p>
        <p className="text-lg font-semibold leading-tight">{t.gardenName}</p>
        {t.gardenNameHi && <p className="text-sm text-white/90">{t.gardenNameHi}</p>}
      </div>
      <div className="flex justify-center bg-white px-5 pt-5">
        <div className={t.status !== "paid" ? "opacity-30" : ""}>
          <QRCodeSVG value={t.url} size={200} level="M" marginSize={2} />
        </div>
      </div>
      <p className={`mx-5 mt-3 rounded-md py-1.5 text-center text-sm font-bold tracking-wide text-white ${state.tone}`}>{state.text}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-4 text-sm">
        <div className="col-span-2 text-center">
          <dt className="text-xs text-slate-500">Persons</dt>
          <dd className="text-4xl font-bold text-slate-900">{t.persons}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Date</dt>
          <dd className="font-semibold text-slate-800">{dmy(t.visitDate)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Time</dt>
          <dd className="font-semibold text-slate-800">{t.issuedAtText.split(", ")[1] ?? t.issuedAtText}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Amount</dt>
          <dd className="font-semibold text-slate-800">
            {rupees(t.amount)}{" "}
            <span className="text-xs font-normal text-slate-500">
              ({t.persons} × {rupees(t.feePerPerson)})
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Paid by</dt>
          <dd className="font-semibold text-slate-800">{t.paymentModeLabel}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-slate-500">Ticket no.</dt>
          <dd className="font-mono text-slate-800">{t.ticketNo}</dd>
        </div>
        {t.usedAtText && (
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">Entry</dt>
            <dd className="text-slate-800">
              {t.usedAtText}
              {showStaffDetails && t.usedBy ? ` · ${t.usedBy}` : ""}
            </dd>
          </div>
        )}
        {showStaffDetails && t.posReference && (
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">POS slip ref.</dt>
            <dd className="font-mono text-slate-800">{t.posReference}</dd>
          </div>
        )}
        {t.status === "cancelled" && t.cancelReason && (
          <div className="col-span-2 text-red-700">
            <dt className="text-xs">Cancelled</dt>
            <dd>{t.cancelReason}</dd>
          </div>
        )}
      </dl>
      <p className="border-t border-dashed border-slate-200 px-5 py-2.5 text-center text-[11px] text-slate-500">
        Valid on {dmy(t.visitDate)} only, for one entry. Show this QR code at the gate.
      </p>
    </div>
  );
}
