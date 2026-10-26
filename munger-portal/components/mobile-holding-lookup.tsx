"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp, Loader2, Lock, Phone, Search } from "lucide-react";
import { searchHoldingsByMobile, type MobileSearchHit } from "@/lib/holding-mobile-search";

/**
 * "Don't know the holding number?" - finds holdings by the owner's mobile number and hands the chosen holding
 * number back to the page's normal holding search. Collapsed by default so the holding-number search stays first.
 */
export function MobileHoldingLookup({ as, onPick }: { as: "operator" | "admin"; onPick: (holdingNo: string) => void }) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<MobileSearchHit[] | null>(null);

  async function search(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setError(null);
    setHits(null);
    try {
      setHits(await searchHoldingsByMobile(mobile, as));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-nnm-blue"
      >
        <span className="flex items-center gap-2">
          <Phone className="h-4 w-4" /> Holding number not known? Search by owner&apos;s mobile number
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4">
          <form onSubmit={search} className="flex flex-col gap-2 sm:flex-row">
            <input
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/[^\d+\s-]/g, "").slice(0, 16))}
              inputMode="numeric"
              placeholder="10-digit mobile number"
              aria-label="Owner's mobile number"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
            />
            <button
              type="submit"
              disabled={busy || mobile.replace(/\D/g, "").length < 10}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find holdings
            </button>
          </form>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {hits && hits.length === 0 && (
            <p className="mt-3 text-sm text-slate-500">No holding has this mobile number on record. Ask for the old receipt / demand notice, or search by holding number.</p>
          )}
          {hits && hits.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-500">
                {hits.length} holding{hits.length > 1 ? "s" : ""} found{hits.length === 50 ? " (first 50)" : ""}. Confirm the owner&apos;s name and address before choosing.
              </p>
              {hits.map((h) => (
                <button
                  key={h.holdingNo}
                  type="button"
                  disabled={!h.accessible}
                  onClick={() => {
                    onPick(h.holdingNo);
                    setOpen(false);
                  }}
                  className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-200 p-3 text-left text-sm hover:border-nnm-blue hover:bg-blue-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:hover:border-slate-200"
                >
                  <span>
                    <span className="font-semibold">{h.holdingNo}</span>
                    {h.oldHoldingNo ? <span className="text-xs text-slate-400"> (old {h.oldHoldingNo})</span> : null}
                    <span className="block">
                      {h.ownerName}
                      {h.relation ? <span className="text-slate-500"> {h.relation}</span> : null}
                    </span>
                    {h.address && <span className="block text-xs text-slate-500">{h.address}</span>}
                  </span>
                  <span className="shrink-0 text-xs">
                    {h.ward ? `Ward ${h.ward}` : "No ward"}
                    {!h.accessible && (
                      <span className="mt-1 flex items-center gap-1 text-amber-700">
                        <Lock className="h-3 w-3" /> not your ward
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
