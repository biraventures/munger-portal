"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { dmy, rupees, verifyCremationTicket, type VerifiedCremation } from "@/lib/crematorium-api";

/** Opened from the QR code on a printed cremation ticket: shows whether it is a genuine ticket of Munger Nagar Nigam. */
function Verify() {
  const { ticketNo } = useParams<{ ticketNo: string }>();
  const sig = useSearchParams().get("sig") ?? "";
  const [t, setT] = useState<VerifiedCremation | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    verifyCremationTicket(decodeURIComponent(ticketNo), sig)
      .then(setT)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not check the ticket."));
  }, [ticketNo, sig]);
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
        <h1 className="mb-4 text-xl font-semibold text-slate-900">Cremation Ticket Verification</h1>
        {error ? (
          <p className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <XCircle className="h-5 w-5 shrink-0" /> {error}
          </p>
        ) : !t ? (
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        ) : (
          <div className={`rounded-xl border p-5 ${t.status === "issued" ? "border-green-200 bg-white" : "border-red-200 bg-red-50"}`}>
            <p className={`mb-3 flex items-center gap-2 font-semibold ${t.status === "issued" ? "text-green-700" : "text-red-700"}`}>
              {t.status === "issued" ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              {t.status === "issued" ? "Genuine ticket of Munger Nagar Nigam" : "This ticket was cancelled"}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-500">Ticket No.</dt>
              <dd className="font-mono">{t.ticketNo}</dd>
              <dt className="text-slate-500">Deceased</dt>
              <dd>{t.deceasedName}</dd>
              <dt className="text-slate-500">Cremation</dt>
              <dd>
                {dmy(t.cremationDate)}, {t.cremationTime}
              </dd>
              <dt className="text-slate-500">Fee paid</dt>
              <dd>{rupees(t.amount)}</dd>
              <dt className="text-slate-500">Issued</dt>
              <dd>{t.issuedAtText}</dd>
            </dl>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

export default function VerifyCremationPage() {
  return (
    <Suspense fallback={null}>
      <Verify />
    </Suspense>
  );
}
