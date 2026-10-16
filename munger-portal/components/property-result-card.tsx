"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, AlertCircle, X } from "lucide-react";
import {
  formatINR,
  totalPayable,
  type PropertyRecord,
} from "@/lib/property-tax";
import { initiateOnlinePayment } from "@/lib/online-payment";
import { DeclarationCheckbox } from "@/components/online-declaration";
import { verifyTaxCollectorCode } from "@/lib/tax-collector";

// Mirrors the backend's ONLINE_PAYMENT_ENABLED kill switch (see
// nnm-property-tax-api/src/config/env.ts) - kept in sync manually since
// this is a separate deployment with its own env vars. Even if this
// somehow drifted out of sync, the backend check is the one that
// actually matters; this just avoids showing a button that would fail.
const ONLINE_PAYMENT_ENABLED =
  process.env.NEXT_PUBLIC_ONLINE_PAYMENT_ENABLED === "true";

export interface PropertyResultCardProps {
  record: PropertyRecord;
}

type PayerChoice = "public" | "tax_collector";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block font-mono text-[10.5px] uppercase tracking-[0.08em] text-ganga-teal">
        {label}
      </span>
      <span className="block text-sm text-ink">{value}</span>
    </div>
  );
}

export function PropertyResultCard({ record }: PropertyResultCardProps) {
  const total = totalPayable(record);
  const nothingDue = total <= 0;
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clicking "Pay Property Tax" reveals payment flow directly for public
  // payers by default, with an option to enter a Tax Collector code if needed.
  const [choosingPayer, setChoosingPayer] = useState(false);
  const [declared, setDeclared] = useState(false);
  const [payerChoice, setPayerChoice] = useState<PayerChoice>("public");
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [taxCollectorCodeInput, setTaxCollectorCodeInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifiedCollector, setVerifiedCollector] = useState<{
    code: string;
    name: string;
  } | null>(null);

  function resetPayerChoice() {
    setDeclared(false);
    setChoosingPayer(false);
    setPayerChoice("public");
    setTaxCollectorCodeInput("");
    setVerifyError(null);
    setVerifiedCollector(null);
    setError(null);
    setShowConfirmModal(false);
  }

  function choosePayer(choice: PayerChoice) {
    setPayerChoice(choice);
    setDeclared(false);
    setVerifyError(null);
    setVerifiedCollector(null);
    setTaxCollectorCodeInput("");
  }

  async function handleVerifyCode() {
    const code = taxCollectorCodeInput.trim();
    if (!code) {
      setVerifyError("Enter the tax collector's code.");
      return;
    }
    setVerifying(true);
    setVerifyError(null);
    try {
      const collector = await verifyTaxCollectorCode(code);
      setVerifiedCollector(collector);
    } catch (err) {
      setVerifiedCollector(null);
      setVerifyError(
        err instanceof Error
          ? err.message
          : "Could not verify this code. Please try again.",
      );
    } finally {
      setVerifying(false);
    }
  }

  async function handlePay() {
    setPaying(true);
    setError(null);
    try {
      const { redirectUrl } = await initiateOnlinePayment(
        record.holdingNumber,
        total,
        payerChoice === "tax_collector" ? verifiedCollector?.code : undefined,
        declared,
        record?.pendingDemandNotices.map((item) => String(item.demandNo)) || [],
      );
      window.location.href = redirectUrl;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not start payment. Please try again.",
      );
      setPaying(false);
    }
  }

  return (
    <article className="rounded-[10px] border border-line bg-card">
      <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 sm:p-7">
        <Field label="Property ID" value={record.propertyId} />
        <Field label="Holding Number" value={record.holdingNumber} />
        <Field label="Owner Name" value={record.ownerName} />
        <Field label="Property Address" value={record.address} />
      </div>

      {record.currentCyclePaid && (
        <div className="mx-6 mb-2 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800 sm:mx-7">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            Tax paid/cleared up to{" "}
            <b>{record.paidThroughYear ?? "current year"}</b>. The current-year
            amount below is shown for reference — it is not currently due.
          </span>
        </div>
      )}

      <div className="perforation" />

      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:justify-between sm:p-7">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <span className="block font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft">
              {record.currentCyclePaid
                ? "Current year tax (paid)"
                : "Current tax due"}
            </span>
            <span
              className={`block font-mono text-base ${record.currentCyclePaid ? "text-green-700" : "text-ink"}`}
            >
              {formatINR(record.currentTaxDue)}
            </span>
          </div>
          <div>
            <span className="block font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft">
              Arrears
            </span>
            <span className="block font-mono text-base text-ink">
              {formatINR(record.arrears)}
            </span>
          </div>
          <div>
            <span className="block font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft">
              {record.currentCyclePaid
                ? "Solid waste charge (paid)"
                : "Solid waste charge"}
            </span>
            <span
              className={`block font-mono text-base ${record.currentCyclePaid ? "text-green-700" : "text-ink"}`}
            >
              {formatINR(record.solidWasteCharge)}
            </span>
          </div>
          {record.penalty > 0 && (
            <div>
              <span className="block font-mono text-[10.5px] uppercase tracking-[0.08em] text-red-600">
                Penalty
              </span>
              <span className="block font-mono text-base text-red-700">
                {formatINR(record.penalty)}
              </span>
            </div>
          )}
          {record.rebate > 0 && (
            <div>
              <span className="block font-mono text-[10.5px] uppercase tracking-[0.08em] text-ganga-teal">
                Rebate applied
              </span>
              <span className="block font-mono text-base text-ganga-teal">
                − {formatINR(record.rebate)}
              </span>
            </div>
          )}
          <div>
            <span className="block font-mono text-[10.5px] uppercase tracking-[0.08em] text-ganga-teal">
              Total payable
            </span>
            <span className="block font-mono text-lg font-semibold text-nnm-blue">
              {formatINR(total)}
            </span>
          </div>
        </div>

        {record.solidWasteTypeMissing && (
          <div
            role="alert"
            className="w-full rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <p>
              This holding number&apos;s solid waste user type is not known.
              Contact Nagar Nigam Munger for entering missing details.
            </p>
            <p lang="hi" className="mt-1">
              इस होल्डिंग नंबर का ठोस अपशिष्ट उपयोगकर्ता प्रकार ज्ञात नहीं है।
              छूटी हुई जानकारी दर्ज कराने के लिए नगर निगम मुंगेर से संपर्क करें।
            </p>
          </div>
        )}

        <div className="flex w-full flex-col items-end gap-3 sm:w-auto sm:max-w-xs">
          {nothingDue && record.pendingDemandNotices.length > 0 ? (
            <span className="max-w-xs rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-right text-sm text-amber-800">
              A demand notice (₹
              {Number(
                record.pendingDemandNotices[0]!.totalAmountDemanded,
              ).toLocaleString("en-IN")}
              {record.pendingDemandNotices[0]!.assessmentYear
                ? `, ${record.pendingDemandNotices[0]!.assessmentYear}`
                : ""}
              ) is pending against this holding. Please contact the Nagar Nigam
              office to confirm the amount due.
            </span>
          ) : nothingDue ? (
            <span className="inline-flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-6 py-2.5 text-sm font-semibold text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              No dues pending
            </span>
          ) : !ONLINE_PAYMENT_ENABLED ? (
            <span className="max-w-xs rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-right text-sm text-amber-800">
              Online payment is temporarily unavailable. Please pay at the Nagar
              Nigam office counter.
            </span>
          ) : !choosingPayer ? (
            <button
              onClick={() => {
                setPayerChoice("public");
                setChoosingPayer(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-nnm-gold px-6 py-2.5 text-sm font-semibold text-[#20240a] shadow-[0_3px_0_#96791b] transition-transform hover:-translate-y-px"
            >
              Pay Property Tax
            </button>
          ) : (
            <div className="w-full rounded-md border border-line bg-white p-4">
              {payerChoice === "tax_collector" ? (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft">
                      Tax Collector Code
                    </label>
                    <button
                      type="button"
                      onClick={() => choosePayer("public")}
                      className="text-xs text-nnm-blue underline hover:text-blue-800"
                    >
                      Pay as Public
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={taxCollectorCodeInput}
                      onChange={(e) => {
                        setTaxCollectorCodeInput(e.target.value);
                        setVerifiedCollector(null);
                        setVerifyError(null);
                      }}
                      placeholder="e.g. K7X9PQ2"
                      disabled={verifying}
                      className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm uppercase text-ink outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
                    />
                    <button
                      onClick={handleVerifyCode}
                      disabled={verifying || !taxCollectorCodeInput.trim()}
                      className="shrink-0 rounded-md border border-line bg-slate-50 px-3 py-2 text-xs font-semibold text-ink hover:bg-slate-100 disabled:opacity-60"
                    >
                      {verifying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Verify"
                      )}
                    </button>
                  </div>
                  {verifyError && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-red-600">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      {verifyError}
                    </p>
                  )}
                  {verifiedCollector && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-green-700">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      Verified: {verifiedCollector.name} (
                      {verifiedCollector.code})
                    </p>
                  )}

                  {verifiedCollector && (
                    <DeclarationCheckbox
                      checked={declared}
                      onChange={setDeclared}
                      disabled={paying}
                    />
                  )}
                  {verifiedCollector && (
                    <button
                      type="button"
                      onClick={() => setShowConfirmModal(true)}
                      disabled={paying || !declared}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-nnm-gold px-6 py-2.5 text-sm font-semibold text-[#20240a] shadow-[0_3px_0_#96791b] transition-transform hover:-translate-y-px disabled:opacity-60"
                    >
                      Pay {formatINR(total)}
                    </button>
                  )}
                  <button
                    onClick={resetPayerChoice}
                    className="mt-2 w-full text-right text-xs text-ink-soft hover:underline"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between text-xs text-ink-soft">
                    <span>Paying as a member of the public.</span>
                    <button
                      type="button"
                      onClick={() => choosePayer("tax_collector")}
                      className="text-nnm-blue underline hover:text-blue-800"
                    >
                      Tax Collector?
                    </button>
                  </div>
                  <DeclarationCheckbox
                    checked={declared}
                    onChange={setDeclared}
                    disabled={paying}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(true)}
                    disabled={paying || !declared}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-nnm-gold px-6 py-2.5 text-sm font-semibold text-[#20240a] shadow-[0_3px_0_#96791b] transition-transform hover:-translate-y-px disabled:opacity-60"
                  >
                    Pay {formatINR(total)}
                  </button>
                  <button
                    onClick={resetPayerChoice}
                    className="mt-2 w-full text-right text-xs text-ink-soft hover:underline"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
          {error && !showConfirmModal && (
            <p className="max-w-xs text-right text-xs text-red-600">{error}</p>
          )}
        </div>
      </div>

      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="text-base font-semibold text-ink">
                Confirm Property Tax Payment
              </h3>
              <button
                type="button"
                onClick={() => !paying && setShowConfirmModal(false)}
                disabled={paying}
                aria-label="Close"
                className="rounded p-1 text-ink-soft hover:bg-slate-100 hover:text-ink disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-3 text-xs text-ink-soft">
              Please review the payment details below before being redirected to
              the bank gateway:
            </p>

            <div className="my-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-ink-soft">Holding No.:</span>
                <span className="font-mono font-medium text-ink">
                  {record.holdingNumber}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-soft">Owner Name:</span>
                <span className="font-medium text-ink text-right">
                  {record.ownerName}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-soft">Payer:</span>
                <span className="font-medium text-ink">
                  {payerChoice === "tax_collector" && verifiedCollector
                    ? `Tax Collector (${verifiedCollector.name} - ${verifiedCollector.code})`
                    : "Public"}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-2.5 flex justify-between items-baseline">
                <span className="text-xs font-semibold uppercase tracking-wider text-ganga-teal">
                  Total Payable:
                </span>
                <span className="font-mono text-lg font-bold text-nnm-blue">
                  {formatINR(total)}
                </span>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <p className="mb-5 text-[11px] text-ink-soft leading-relaxed">
              Upon clicking <b>Proceed to Pay</b>, you will be directed to the
              payment gateway to complete the transaction.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={paying}
                className="w-1/2 rounded-md border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePay}
                disabled={paying}
                className="w-1/2 inline-flex items-center justify-center gap-2 rounded-md bg-nnm-gold px-4 py-2.5 text-sm font-semibold text-[#20240a] shadow-[0_3px_0_#96791b] transition-transform hover:-translate-y-px disabled:opacity-60"
              >
                {paying && <Loader2 className="h-4 w-4 animate-spin" />}
                {paying ? "Redirecting…" : "Proceed to Pay"}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
