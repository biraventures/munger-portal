"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Printer } from "lucide-react";
import logoImg from "@/public/logo.png";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { dmy, fetchCremationTicket, rupees, type CremationTicket } from "@/lib/crematorium-api";

/** One copy of the ticket. */
function Copy({ t, copy }: { t: CremationTicket; copy: string }) {
  const row = (k: string, v: React.ReactNode) => (
    <tr>
      <td className="w-44 py-0.5 pr-2 align-top text-slate-600">{k}</td>
      <td className="py-0.5 font-medium">{v}</td>
    </tr>
  );
  return (
    <div className="border-2 border-black p-4">
      <div className="flex items-center gap-3 border-b-2 border-black pb-2">
        <Image src={logoImg} alt="" width={48} height={48} className="h-12 w-12" />
        <div className="flex-1">
          <p className="text-base font-bold">MUNGER NAGAR NIGAM / मुंगेर नगर निगम</p>
          <p className="text-sm font-semibold">Electric Crematorium - Cremation Ticket / विद्युत शवदाह गृह - टिकट</p>
        </div>
        <span className="rounded border border-black px-2 py-0.5 text-xs font-semibold">{copy}</span>
      </div>
      <div className="mt-2 flex gap-4">
        <table className="flex-1 text-[13px]">
          <tbody>
            {row("Ticket No.", <span className="font-mono">{t.ticketNo}</span>)}
            {row("Name of the deceased", t.deceasedName)}
            {row("Date & time of cremation", `${dmy(t.cremationDate)}, ${t.cremationTime}`)}
            {row("Informant", `${t.informantName} (${t.informantRelation})`)}
            {row("Informant's address", t.informantAddress)}
            {row("Informant's mobile", t.informantPhone)}
            {row("Fee paid", `${rupees(t.amount)} - ${t.paymentModeLabel}${t.posReference ? ` (Ref ${t.posReference})` : ""}`)}
            {t.remarks && row("Remarks", t.remarks)}
            {row("Issued", `${t.issuedAtText} by ${t.issuedByName ?? t.issuedBy}`)}
          </tbody>
        </table>
        <div className="flex flex-col items-center">
          <QRCodeSVG value={t.verifyUrl} size={96} level="M" />
          <p className="mt-1 text-center text-[10px] leading-tight text-slate-600">Scan to verify</p>
        </div>
      </div>
      {t.status === "cancelled" && (
        <p className="mt-2 border-2 border-red-700 p-1 text-center text-sm font-bold text-red-700">CANCELLED - {t.cancelReason}</p>
      )}
      <div className="mt-6 flex justify-between text-xs text-slate-600">
        <span>Signature of informant</span>
        <span>Signature of counter staff</span>
      </div>
    </div>
  );
}

function TicketPrint() {
  const admin = useAdminGuard();
  const { id } = useParams<{ id: string }>();
  const autoPrint = useSearchParams().get("print") === "1";
  const [t, setT] = useState<CremationTicket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (admin)
      fetchCremationTicket(Number(id))
        .then(setT)
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load the ticket."));
  }, [admin, id]);
  useEffect(() => {
    if (t && autoPrint) setTimeout(() => window.print(), 400);
  }, [t, autoPrint]);

  if (error) return <p className="p-10 text-center text-sm text-red-700">{error}</p>;
  if (!t) return <Loader2 className="mx-auto mt-20 h-6 w-6 animate-spin text-slate-400" />;
  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[780px] justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white"
        >
          <Printer className="h-4 w-4" /> Print
        </button>
      </div>
      {/* printable-area: the site-wide print style prints only this (globals.css). Two copies on one A4 sheet. */}
      <div className="printable-area mx-auto max-w-[780px] space-y-6 bg-white p-6 text-black print:p-6">
        <Copy t={t} copy="Informant's copy" />
        <p className="border-t border-dashed border-slate-500 pt-1 text-center text-[10px] text-slate-500">✂ cut here</p>
        <Copy t={t} copy="Office copy" />
      </div>
    </div>
  );
}

export default function CremationTicketPage() {
  return (
    <Suspense fallback={null}>
      <TicketPrint />
    </Suspense>
  );
}
