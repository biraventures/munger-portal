"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Minus, Plus, Trees } from "lucide-react";
import { fetchPublicGarden, rupees, startPurchase, type PublicGarden } from "@/lib/garden-api";

/**
 * The page the garden's QR poster opens: the visitor enters the number of persons and pays online through the
 * garden's own gateway; the e-ticket with its QR code then opens on the phone. Until that gateway is live, the page
 * shows the fee and sends visitors to the counter.
 */
export default function GardenPublicPage() {
  const { code } = useParams<{ code: string }>();
  const [g, setG] = useState<PublicGarden | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [persons, setPersons] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchPublicGarden(code)
      .then(setG)
      .catch((e) => setErr(e instanceof Error ? e.message : "Garden not found."));
  }, [code]);

  async function pay() {
    if (!g) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await startPurchase(code, persons);
      if (r.redirectUrl) window.location.href = r.redirectUrl;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white px-4 py-8">
      <div className="mx-auto max-w-sm">
        <p className="mb-1 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Munger Nagar Nigam</p>
        {!g && !err && <p className="text-center text-sm text-slate-400">Loading…</p>}
        {!g && err && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">{err}</p>}
        {g && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-green-700 px-5 py-5 text-center text-white">
              <Trees className="mx-auto mb-1 h-8 w-8" />
              <h1 className="text-2xl font-semibold">{g.name}</h1>
              {g.name_hi && <p className="text-lg text-white/90">{g.name_hi}</p>}
              <p className="mt-2 text-sm text-white/90">
                Entry fee {rupees(g.fee_per_person)} per person · प्रवेश शुल्क {rupees(g.fee_per_person)} प्रति व्यक्ति
              </p>
            </div>
            {!g.active ? (
              <p className="p-5 text-center text-sm font-semibold text-red-700">Ticket sale is closed now. · अभी टिकट बिक्री बंद है।</p>
            ) : (
              <div className="space-y-5 p-5">
                <div className="text-center">
                  <p className="mb-2 text-sm font-medium text-slate-600">Number of persons · व्यक्तियों की संख्या</p>
                  <div className="flex items-center justify-center gap-5">
                    <button
                      onClick={() => setPersons((p) => Math.max(1, p - 1))}
                      className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-slate-300"
                      aria-label="One less"
                    >
                      <Minus className="h-6 w-6" />
                    </button>
                    <span className="w-16 text-center text-5xl font-bold text-slate-900">{persons}</span>
                    <button
                      onClick={() => setPersons((p) => Math.min(g.max_persons_per_ticket, p + 1))}
                      className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-green-700 text-green-700"
                      aria-label="One more"
                    >
                      <Plus className="h-6 w-6" />
                    </button>
                  </div>
                  <p className="mt-3 text-3xl font-bold text-green-700">{rupees(persons * g.fee_per_person)}</p>
                </div>
                {g.onlinePayment ? (
                  <button
                    onClick={pay}
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-700 py-3.5 text-base font-semibold text-white disabled:opacity-60"
                  >
                    {busy && <Loader2 className="h-5 w-5 animate-spin" />} Pay {rupees(persons * g.fee_per_person)} and get ticket
                  </button>
                ) : (
                  <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-900">
                    Online payment is starting soon. Please buy the ticket at the counter.
                    <br />
                    ऑनलाइन भुगतान जल्द शुरू होगा। कृपया काउंटर से टिकट लें।
                  </p>
                )}
                {err && <p className="text-center text-sm text-red-700">{err}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
