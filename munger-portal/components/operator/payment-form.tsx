"use client";

import {
  EMPTY_INSTRUMENT,
  InstrumentFields,
  instrumentError,
  instrumentPayload,
  type InstrumentValue,
} from "./instrument-fields";
import { COUNTER_PAYMENT_MODES } from "@/lib/payment-modes";
import { useEffect, useState } from "react";
import { AlertCircle, FileWarning, Loader2, X } from "lucide-react";
import {
  submitPayment,
  type PaymentError,
  type PaymentInput,
  type ReceiptData,
} from "@/lib/payment-api";
import {
  fetchUnsettledDemandNotices,
  type UnsettledDemandNotice,
} from "@/lib/demand-notice-api";
import { TaxCollectorCodeInput } from "@/components/tax-collector-code-input";
import { PaymentResponsibilityWarning } from "@/components/payment-responsibility-warning";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

const PAYMENT_MODES: readonly string[] = COUNTER_PAYMENT_MODES;

const TV_NUMBER_MIN = 15;
const TV_NUMBER_MAX = 40;

/** Where the form loads notices from and records the payment - the counter operator's session by default. */
export interface PaymentFormApi {
  fetchUnsettled: (holdingNo: string) => Promise<UnsettledDemandNotice[]>;
  submit: (holdingNo: string, input: PaymentInput) => Promise<ReceiptData>;
}
const OPERATOR_API: PaymentFormApi = { fetchUnsettled: fetchUnsettledDemandNotices, submit: submitPayment };

export function PaymentForm({
  holdingNo,
  ownerName,
  onSuccess,
  api = OPERATOR_API,
}: {
  holdingNo: string;
  ownerName?: string;
  onSuccess: (receipt: ReceiptData) => void;
  /** e.g. the Agency Operator's admin session (see app/admin/agency-collection). */
  api?: PaymentFormApi;
}) {
  const [notices, setNotices] = useState<UnsettledDemandNotice[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDemandNo, setSelectedDemandNo] = useState("");
  const [paymentMode, setPaymentMode] = useState(PAYMENT_MODES[0]);
  const [counter, setCounter] = useState("");
  const [taxCollectorCode, setTaxCollectorCode] = useState("");
  const [selectedCollector, setSelectedCollector] = useState<{
    code: string;
    name: string;
  } | null>(null);
  const [tvNumber, setTvNumber] = useState("");
  const [tvDate, setTvDate] = useState("");
  const isDistrictTreasury = paymentMode === "District Treasury";
  const [instrument, setInstrument] =
    useState<InstrumentValue>(EMPTY_INSTRUMENT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<PaymentError | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    api
      .fetchUnsettled(holdingNo)
      .then((list) => {
        setNotices(list);
        if (list.length > 0) setSelectedDemandNo(list[0]!.demandNo);
      })
      .catch((err) =>
        setLoadError(
          err instanceof Error ? err.message : "Could not load demand notices.",
        ),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdingNo]);

  const selected =
    notices?.find((n) => n.demandNo === selectedDemandNo) ?? null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedDemandNo) {
      setError({
        message: "Select a demand notice to collect payment against.",
      });
      return;
    }

    if (isDistrictTreasury) {
      const tv = tvNumber.trim();
      if (!tv) {
        setError({
          message: "T.V. number is required for District Treasury payments.",
        });
        return;
      }
      if (tv.length < TV_NUMBER_MIN || tv.length > TV_NUMBER_MAX) {
        setError({
          message: `T.V. number must be between ${TV_NUMBER_MIN} and ${TV_NUMBER_MAX} characters.`,
        });
        return;
      }
      if (/\s/.test(tv)) {
        setError({ message: "T.V. number cannot contain spaces." });
        return;
      }
      if (!tvDate) {
        setError({
          message: "T.V. date is required for District Treasury payments.",
        });
        return;
      }
    }

    const instErr = instrumentError(
      paymentMode ?? "",
      instrument,
      Number(selected?.totalAmountDemanded ?? 0),
    );
    if (instErr) {
      setError({ message: instErr });
      return;
    }

    setShowConfirmModal(true);
  }

  async function handleConfirmPayment() {
    setSubmitting(true);
    setError(null);
    try {
      const receipt = await api.submit(holdingNo, {
        ...instrumentPayload(paymentMode ?? "", instrument),
        paymentMode,
        counter: counter || undefined,
        demandNo: selectedDemandNo,
        taxCollectorCode: taxCollectorCode.trim() || undefined,
        tvNumber: isDistrictTreasury ? tvNumber.trim() : undefined,
        tvDate: isDistrictTreasury ? tvDate : undefined,
      });
      setShowConfirmModal(false);
      onSuccess(receipt);
    } catch (err) {
      setError(err as PaymentError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6"
      >
        <h2 className="text-base font-semibold text-slate-900">
          Collect Payment
        </h2>

        {error && !showConfirmModal && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
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
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
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
              No unsettled demand notice for this property. Payment is always
              collected against a demand notice — generate one first using
              &ldquo;Generate Demand Notice&rdquo; above.
            </span>
          </div>
        )}

        {notices && notices.length > 0 && (
          <>
            <div>
              <label className={labelClass}>Demand notice</label>
              <select
                value={selectedDemandNo}
                onChange={(e) => setSelectedDemandNo(e.target.value)}
                className={inputClass}
              >
                {notices.map((n) => (
                  <option key={n.demandNo} value={n.demandNo}>
                    {n.formattedDemandNo}
                    {n.partPayment
                      ? ` [PART PAYMENT up to ${n.paidThroughYear}]`
                      : ""}{" "}
                    — ₹{Number(n.totalAmountDemanded).toLocaleString("en-IN")} (
                    {n.noticeDate})
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
                  ₹
                  {Number(selected.totalAmountDemanded).toLocaleString("en-IN")}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Payment mode</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className={inputClass}
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Counter (optional)</label>
                <input
                  value={counter}
                  onChange={(e) => setCounter(e.target.value)}
                  className={inputClass}
                />
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
                      {TV_NUMBER_MIN}–{TV_NUMBER_MAX} characters,
                      letters/numbers/symbols, no spaces.
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
              <InstrumentFields
                paymentMode={paymentMode ?? ""}
                amountDemanded={
                  selected ? Number(selected.totalAmountDemanded) : null
                }
                value={instrument}
                onChange={setInstrument}
                inputClassName={inputClass}
                labelClassName={labelClass}
              />
              <div className="sm:col-span-2">
                <TaxCollectorCodeInput
                  value={taxCollectorCode}
                  onChange={setTaxCollectorCode}
                  onCollectorChange={setSelectedCollector}
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
              {submitting
                ? "Recording payment…"
                : "Record Payment & Generate Receipt"}
            </button>
          </>
        )}
      </form>

      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                Confirm Property Tax Collection
              </h3>
              <button
                type="button"
                onClick={() => !submitting && setShowConfirmModal(false)}
                disabled={submitting}
                aria-label="Close"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Please review the payment details below before recording the
              transaction and generating the receipt:
            </p>

            <div className="my-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Holding No.:</span>
                <span className="font-mono font-medium text-slate-900">
                  {holdingNo}
                </span>
              </div>
              {ownerName && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Owner Name:</span>
                  <span className="font-medium text-slate-900 text-right">
                    {ownerName}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Demand Notice:</span>
                <span className="font-mono font-medium text-slate-900">
                  {selected?.formattedDemandNo || selectedDemandNo}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Payment Mode:</span>
                <span className="font-medium text-slate-900">
                  {paymentMode}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Tax Collector (name &amp; code):</span>
                <span className="font-medium text-slate-900 text-right">
                  {selectedCollector
                    ? `${selectedCollector.name} (${selectedCollector.code})`
                    : taxCollectorCode.trim() || "Not entered"}
                </span>
              </div>
              {counter.trim() && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Counter:</span>
                  <span className="font-medium text-slate-900">
                    {counter.trim()}
                  </span>
                </div>
              )}
              {isDistrictTreasury && tvNumber.trim() && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">T.V. Number:</span>
                  <span className="font-mono font-medium text-slate-900">
                    {tvNumber.trim()}
                  </span>
                </div>
              )}
              {instrument.instrumentNo && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Instrument No.:</span>
                  <span className="font-mono font-medium text-slate-900">
                    {instrument.instrumentNo}
                  </span>
                </div>
              )}
              {(instrument.bankChoice || instrument.otherBank) && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Bank:</span>
                  <span className="font-medium text-slate-900">
                    {instrument.bankChoice === "Other"
                      ? instrument.otherBank
                      : instrument.bankChoice}
                  </span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-2.5 flex justify-between items-baseline">
                <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">
                  Final Amount:
                </span>
                <span className="font-mono text-lg font-bold text-nnm-blue">
                  ₹
                  {Number(selected?.totalAmountDemanded ?? 0).toLocaleString(
                    "en-IN",
                  )}
                </span>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error.message}</span>
              </div>
            )}

            <PaymentResponsibilityWarning />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={submitting}
                className="w-1/2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={submitting}
                className="w-1/2 inline-flex items-center justify-center gap-2 rounded-md bg-nnm-gold px-4 py-2.5 text-sm font-semibold text-[#20240a] shadow-[0_3px_0_#96791b] transition-transform hover:-translate-y-px disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Recording…" : "Confirm & Record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
