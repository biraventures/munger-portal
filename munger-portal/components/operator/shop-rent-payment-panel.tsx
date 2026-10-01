"use client";

import { useEffect, useState } from "react";
import { AlertCircle, FileWarning, Loader2, Printer, Receipt } from "lucide-react";
import {
  fetchUnsettledShopDemands,
  generateRentDemand,
  submitShopRentPayment,
  fetchPrintableDemandNotice,
  type UnsettledShopDemand,
  type ShopRentPaymentResult,
  type PrintableShopDemand,
} from "@/lib/shop-api";
import { ShopNoticeView } from "./shop-notice-view";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";
const PAYMENT_MODES = ["Cash", "Cheque", "Online / UPI", "Card", "Demand Draft", "District Treasury"];

const TV_NUMBER_MIN = 15;
const TV_NUMBER_MAX = 40;

export function ShopRentPaymentPanel({
  shopNo,
  hasPendingRent,
  onPaymentSuccess,
}: {
  shopNo: string;
  hasPendingRent: boolean;
  onPaymentSuccess: (receipt: ShopRentPaymentResult) => void;
}) {
  const [demands, setDemands] = useState<UnsettledShopDemand[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [monthsToCover, setMonthsToCover] = useState(1);
  const [selectedDemandNo, setSelectedDemandNo] = useState("");
  const [paymentMode, setPaymentMode] = useState(PAYMENT_MODES[0]);
  const [counter, setCounter] = useState("");
  const [tvNumber, setTvNumber] = useState("");
  const [tvDate, setTvDate] = useState("");
  const isDistrictTreasury = paymentMode === "District Treasury";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printingNotice, setPrintingNotice] = useState<PrintableShopDemand | null>(null);
  const [noticeLoading, setNoticeLoading] = useState(false);

  async function handlePrintNotice(demandNo: string) {
    setNoticeLoading(true);
    try {
      const notice = await fetchPrintableDemandNotice(demandNo);
      setPrintingNotice(notice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the notice.");
    } finally {
      setNoticeLoading(false);
    }
  }

  function loadDemands() {
    fetchUnsettledShopDemands(shopNo)
      .then((list) => {
        setDemands(list);
        if (list.length > 0 && !selectedDemandNo) setSelectedDemandNo(list[0]!.demandNo);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load demands."));
  }

  useEffect(() => {
    loadDemands();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopNo]);

  async function handleGenerateDemand() {
    setGenerating(true);
    setError(null);
    try {
      await generateRentDemand(shopNo, monthsToCover);
      loadDemands();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate demand.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmitPayment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedDemandNo) {
      setError("Select a rent demand to collect payment against.");
      return;
    }
    if (isDistrictTreasury) {
      const tv = tvNumber.trim();
      if (!tv) {
        setError("T.V. number is required for District Treasury payments.");
        return;
      }
      if (tv.length < TV_NUMBER_MIN || tv.length > TV_NUMBER_MAX) {
        setError(`T.V. number must be between ${TV_NUMBER_MIN} and ${TV_NUMBER_MAX} characters.`);
        return;
      }
      if (/\s/.test(tv)) {
        setError("T.V. number cannot contain spaces.");
        return;
      }
      if (!tvDate) {
        setError("T.V. date is required for District Treasury payments.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const receipt = await submitShopRentPayment(shopNo, {
        demandNo: selectedDemandNo,
        paymentMode,
        counter: counter || undefined,
        tvNumber: isDistrictTreasury ? tvNumber.trim() : undefined,
        tvDate: isDistrictTreasury ? tvDate : undefined,
      });
      onPaymentSuccess(receipt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const selected = demands?.find((d) => d.demandNo === selectedDemandNo) ?? null;

  if (printingNotice) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <ShopNoticeView notice={printingNotice} onClose={() => setPrintingNotice(null)} />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-base font-semibold text-slate-900">Rent Demand &amp; Payment</h2>

      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {hasPendingRent && (
        <div className="mb-5 flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
          <div>
            <label className={labelClass}>Generate demand for</label>
            <select value={monthsToCover} onChange={(e) => setMonthsToCover(Number(e.target.value))} className={inputClass}>
              <option value={1}>1 month</option>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months (annual)</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleGenerateDemand}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileWarning className="h-4 w-4" />}
            {generating ? "Generating…" : "Generate Demand"}
          </button>
        </div>
      )}

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      {!demands && !loadError && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading demands…
        </div>
      )}

      {demands && demands.length === 0 && (
        <p className="text-sm text-slate-500">
          No unsettled rent demand for this shop{hasPendingRent ? " yet — generate one above." : "."}
        </p>
      )}

      {demands && demands.length > 0 && (
        <form onSubmit={handleSubmitPayment} className="space-y-4">
          <div>
            <label className={labelClass}>Rent demand</label>
            <select value={selectedDemandNo} onChange={(e) => setSelectedDemandNo(e.target.value)} className={inputClass}>
              {demands.map((d) => (
                <option key={d.demandNo} value={d.demandNo}>
                  {d.formattedDemandNo} — {d.periodStartMonth} to {d.periodEndMonth} — ₹
                  {Number(d.totalAmountDemanded).toLocaleString("en-IN")}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="flex items-center justify-between rounded-lg border border-nnm-blue bg-blue-50 p-4">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-nnm-blue">
                  Amount to collect (frozen from the demand)
                </span>
                <span className="block font-mono text-2xl font-semibold text-nnm-blue">
                  ₹{Number(selected.totalAmountDemanded).toLocaleString("en-IN")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handlePrintNotice(selected.demandNo)}
                disabled={noticeLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-nnm-blue px-3 py-1.5 text-xs font-semibold text-nnm-blue hover:bg-blue-100 disabled:opacity-60"
              >
                <Printer className="h-3.5 w-3.5" />
                {noticeLoading ? "Loading…" : "Print Notice"}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Payment mode</label>
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={inputClass}>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Counter (optional)</label>
              <input value={counter} onChange={(e) => setCounter(e.target.value)} className={inputClass} />
            </div>
            {isDistrictTreasury && (
              <>
                <div>
                  <label className={labelClass}>T.V. Number</label>
                  <input
                    value={tvNumber}
                    onChange={(e) => setTvNumber(e.target.value)}
                    minLength={TV_NUMBER_MIN}
                    maxLength={TV_NUMBER_MAX}
                    placeholder="Treasury voucher number"
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {TV_NUMBER_MIN}–{TV_NUMBER_MAX} characters, letters/numbers/symbols, no spaces.
                  </p>
                </div>
                <div>
                  <label className={labelClass}>T.V. Date</label>
                  <input
                    type="date"
                    value={tvDate}
                    onChange={(e) => setTvDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-nnm-gold px-6 py-3 text-sm font-semibold text-[#20240a] hover:brightness-95 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            <Receipt className="h-4 w-4" />
            {submitting ? "Recording…" : "Record Payment"}
          </button>
        </form>
      )}
    </section>
  );
}