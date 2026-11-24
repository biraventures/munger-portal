"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { TicketCard } from "@/components/garden/ticket-card";
import { fetchPublicTicket, type Ticket } from "@/lib/garden-api";

/** The e-ticket, opened from the ticket's QR code: keep it on the phone and show it at the gate. */
function TicketContent() {
  const { ticketNo } = useParams<{ ticketNo: string }>();
  const sig = useSearchParams().get("sig") ?? "";
  const [t, setT] = useState<Ticket | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicTicket(decodeURIComponent(ticketNo), sig)
      .then(setT)
      .catch((e) => setErr(e instanceof Error ? e.message : "Ticket not found."));
  }, [ticketNo, sig]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      {!t && !err && <p className="text-center text-sm text-slate-400">Loading…</p>}
      {err && <p className="mx-auto max-w-sm rounded-md border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">{err}</p>}
      {t && (
        <>
          <TicketCard t={t} />
          <p className="mx-auto mt-4 max-w-sm text-center text-xs text-slate-500">
            Keep this page (bookmark it or take a screenshot) and show the QR code at the gate. टिकट का QR कोड गेट पर दिखाएँ।
          </p>
        </>
      )}
    </div>
  );
}

export default function GardenTicketPage() {
  return (
    <Suspense fallback={null}>
      <TicketContent />
    </Suspense>
  );
}
