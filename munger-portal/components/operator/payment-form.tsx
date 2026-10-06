"use client";

import { useEffect, useState } from "react";
import { AlertCircle, FileWarning, Loader2 } from "lucide-react";
import { submitPayment, type PaymentError, type ReceiptData } from "@/lib/payment-api";
import { fetchUnsettledDemandNotices, type UnsettledDemandNotice } from "@/lib/demand-notice-api";
import { TaxCollectorCodeInput } from "@/components/tax-collector-code-input";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

const PAYMENT_MODES = ["Cash", "Cheque", "Online / UPI", "Card", "Demand Draft", "District Treasury"];

const TV_NUMBER_MIN = 15;
const TV_NUMBER_MAX = 40;

export function PaymentForm({
  holdingNo,
  onSuccess,
}: {
  holdingNo: string;
  onSuccess: (receipt: ReceiptData) => void;
}) {
  const [notices, setNotices] = useState<UnsettledDemandNotice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDemandNo, setSelectedDemandNo] = useState("");
  const [paymentMode, setPaymentMode] = useState(PAYMENT_MODES[0]);
  const [counter, setCounter] = useState("");
  const [taxCollectorCode, setTaxCollectorCode] = useState("");
  const [tvNumber, setTvNumber] = useState("");
  const [tvDate, setTvDate] = useState("");
  const isDistrictTreasury = paymentMode === "District Treasury";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<PaymentError | null>(null);

  useEffect(() => {
    fetchUnsettledDemandNotices(holdingNo)
      .then((list) => {
        setNotices(list);
        if (list.length > 0) setSelectedDemandNo(list[0]!.demandNo);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load demand notices."));
  }, [holdingNo]);

  const selected = notices?.find((n) => n.demandNo === selectedDemandNo) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedDemandNo) {
      setError({ message: "Select a demand notice to collect payment against." });
      return;
    }

    if (isDistrictTreasury) {
      const tv = tvNumber.trim();
      if (!tv) {
        setError({ message: "T.V. number is required for District Treasury payments." });
        return;
      }
      if (tv.length < TV_NUMBER_MIN || tv.length > TV_NUMBER_MAX) {
        setError({ message: `T.V. number must be between ${TV_NUMBER_MIN} and ${TV_NUMBER_MAX} characters.` });
        return;
      }
      if (/\s/.test(tv)) {
        setError({ message: "T.V. number cannot contain spaces." });
        return;
      }
      if (!tvDate) {
        setError({ message: "T.V. date is required for District Treasury payments." });
        return;
      }
    }

    setSubmitting(true);
    try {
      const receipt = await submitPayment(holdingNo, {
        paymentMode,
        counter: counter || undefined,
        demandNo: selectedDemandNo,
        taxCollectorCode: taxCollectorCode.trim() || undefined,
        tvNumber: isDistrictTreasury ? tvNumber.trim() : undefined,
        tvDate: isDistrictTreasury ? tvDate : undefined,
      });
      onSuccess(receipt);
    } catch (err) {
      setError(err as PaymentError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-900">Collect Payment</h2>

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>{error.message}</p>
            {error.details && (
              <ul className="mt-1 list-disc pl-4">
                {Object.entries(error.details).map(([field, msgs]) => (
                  <li key={field}>
                    {field}: {msgs.join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {loadError && (
        <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {!notices && !loadError && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading demand notices…
        </div>
      )}

      {notices && notices.length === 0 && (
        <div className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            No unsettled demand notice for this property. Payment is always collected against a demand notice —
            generate one first using &ldquo;Generate Demand Notice&rdquo; above.
          </span>
        </div>
      )}

      {notices && notices.length > 0 && (
        <>
          <div>
            <label className={labelClass}>Demand notice</label>
            <select value={selectedDemandNo} onChange={(e) => setSelectedDemandNo(e.target.value)} className={inputClass}>
              {notices.map((n) => (
                <option key={n.demandNo} value={n.demandNo}>
                  {n.formattedDemandNo}{n.partPayment ? ` [PART PAYMENT up to ${n.paidThroughYear}]` : ""} — ₹{Number(n.totalAmountDemanded).toLocaleString("en-IN")} ({n.noticeDate})
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="rounded-lg border border-nnm-blue bg-blue-50 p-4">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-nnm-blue">
                Amount to collect (frozen from the demand notice)
              </span>
              <span className="block font-mono text-2xl font-semibold text-nnm-blue">
                ₹{Number(selected.totalAmountDemanded).toLocaleString("en-IN")}
              </span>
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
            <div className="sm:col-span-2">
              <TaxCollectorCodeInput
                value={taxCollectorCode}
                onChange={setTaxCollectorCode}
                inputClassName={inputClass}
                labelClassName={labelClass}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-nnm-gold py-3 text-sm font-semibold text-[#20240a] hover:brightness-95 disabled:opacity-60 sm:w-auto sm:px-8"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Recording payment…" : "Record Payment & Generate Receipt"}
          </button>
        </>
      )}
    </form>
  );
}