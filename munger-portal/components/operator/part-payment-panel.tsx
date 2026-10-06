"use client";

import { useState } from "react";
import { Loader2, Scissors } from "lucide-react";
import { fetchPartPaymentOptions, type PartPaymentOption } from "@/lib/demand-notice-api";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/**
 * Part payment: the owner can only afford the oldest dues today. The operator picks how many unpaid
 * years (counted from the year after "tax paid till") to clear; tax + penalty as of today are shown,
 * and a demand notice for just that amount is generated. Once paid, "tax paid till" moves forward and
 * the next full demand covers the remaining years up to the current year.
 */
export function PartPaymentPanel({
  holdingNo,
  busy,
  onGenerate,
}: {
  holdingNo: string;
  busy: boolean;
  onGenerate: (years: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidTill, setPaidTill] = useState<string | null>(null);
  const [options, setOptions] = useState<PartPaymentOption[] | null>(null);
  const [years, setYears] = useState(1);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const r = await fetchPartPaymentOptions(holdingNo);
      setPaidTill(r.paidTillYear);
      setOptions(r.options);
      setYears(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load part-payment options.");
    } finally {
      setLoading(false);
    }
  }

  const chosen = options?.find((o) => o.years === years) ?? null;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-2 rounded-md border border-amber-500 px-6 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50"
      >
        <Scissors className="h-4 w-4" />
        Part Payment
      </button>

      {open && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          {loading && (
            <span className="inline-flex items-center gap-2 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculating…
            </span>
          )}
          {error && <p className="text-red-700">{error}</p>}
          {!loading && !error && options && options.length === 0 && (
            <p className="text-slate-700">
              Part payment is not available for this holding - there are no earlier unpaid years
              {paidTill ? ` (paid till ${paidTill})` : ", or its “tax paid till” year is not recorded"}. Use the normal demand notice.
            </p>
          )}
          {!loading && options && options.length > 0 && (
            <div className="space-y-3">
              <p className="text-slate-700">
                Tax paid till <b>{paidTill}</b>. Choose how many unpaid years to clear now, counted from{" "}
                <b>{options[0]!.fromYear}</b>. Penalty is calculated as on today.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="font-medium text-slate-700" htmlFor="part-years">
                  Years to clear
                </label>
                <select
                  id="part-years"
                  value={years}
                  onChange={(e) => setYears(Number(e.target.value))}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2"
                >
                  {options.map((o) => (
                    <option key={o.years} value={o.years}>
                      {o.years} year{o.years > 1 ? "s" : ""} (up to {o.toYear})
                    </option>
                  ))}
                </select>
              </div>
              {chosen && (
                <table className="w-full max-w-md border-collapse text-sm">
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 bg-white p-2">Tax for {chosen.fromYear} to {chosen.toYear}</td>
                      <td className="border border-slate-300 bg-white p-2 text-right">{rupees(chosen.taxAmount)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 bg-white p-2">Penalty (as on today)</td>
                      <td className="border border-slate-300 bg-white p-2 text-right">{rupees(chosen.penaltyAmount)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 bg-white p-2 font-semibold">Amount payable now</td>
                      <td className="border border-slate-300 bg-white p-2 text-right font-semibold">{rupees(chosen.total)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              <p className="text-xs text-slate-600">
                After this is paid, “tax paid till” becomes <b>{chosen?.toYear}</b> and the next demand notice will cover the
                remaining years up to the current year. Current-year tax and other charges are not part of this part payment. Generating it replaces any earlier unpaid demand notice for this holding.
              </p>
              <button
                type="button"
                disabled={busy || !chosen}
                onClick={() => onGenerate(years)}
                className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Generate Part-Payment Demand Notice
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
