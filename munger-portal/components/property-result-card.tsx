"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Users, User, AlertCircle } from "lucide-react";
import { formatINR, totalPayable, type PropertyRecord } from "@/lib/property-tax";
import { initiateOnlinePayment } from "@/lib/online-payment";
import { verifyTaxCollectorCode } from "@/lib/tax-collector";

// Mirrors the backend's ONLINE_PAYMENT_ENABLED kill switch (see
// nnm-property-tax-api/src/config/env.ts) - kept in sync manually since
// this is a separate deployment with its own env vars. Even if this
// somehow drifted out of sync, the backend check is the one that
// actually matters; this just avoids showing a button that would fail.
const ONLINE_PAYMENT_ENABLED = process.env.NEXT_PUBLIC_ONLINE_PAYMENT_ENABLED === "true";

export interface PropertyResultCardProps {
  record: PropertyRecord;
}

type PayerChoice = "public" | "tax_collector" | null;

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

  // Clicking "Pay Property Tax" reveals this chooser rather than
  // paying immediately - who's paying determines whether a Tax
  // Collector code is collected and verified first.
  const [choosingPayer, setChoosingPayer] = useState(false);
  const [payerChoice, setPayerChoice] = useState<PayerChoice>(null);

  const [taxCollectorCodeInput, setTaxCollectorCodeInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifiedCollector, setVerifiedCollector] = useState<{ code: string; name: string } | null>(null);

  function resetPayerChoice() {
    setChoosingPayer(false);
    setPayerChoice(null);
    setTaxCollectorCodeInput("");
    setVerifyError(null);
    setVerifiedCollector(null);
    setError(null);
  }

  function choosePayer(choice: PayerChoice) {
    setPayerChoice(choice);
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
      setVerifyError(err instanceof Error ? err.message : "Could not verify this code. Please try again.");
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
      );
      window.location.href = redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment. Please try again.");
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
            Tax paid/cleared up to <b>{record.paidThroughYear ?? "current year"}</b>. The current-year amount below
            is shown for reference — it is not currently due.
          </span>
        </div>
      )}

      <div className="perforation" />

      <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:justify-between sm:p-7">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <span className="block font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft">
              {record.currentCyclePaid ? "Current year tax (paid)" : "Current tax due"}
            </span>
            <span className={`block font-mono text-base ${record.currentCyclePaid ? "text-green-700" : "text-ink"}`}>
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
              {record.currentCyclePaid ? "Solid waste charge (paid)" : "Solid waste charge"}
            </span>
            <span className={`block font-mono text-base ${record.currentCyclePaid ? "text-green-700" : "text-ink"}`}>
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

        <div className="flex w-full flex-col items-end gap-3 sm:w-auto sm:max-w-xs">
          {nothingDue ? (
            <span className="inline-flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-6 py-2.5 text-sm font-semibold text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              No dues pending
            </span>
          ) : !ONLINE_PAYMENT_ENABLED ? (
            <span className="max-w-xs rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-right text-sm text-amber-800">
              Online payment is temporarily unavailable. Please pay at the Nagar Nigam office counter.
            </span>
          ) : !choosingPayer ? (
            <button
              onClick={() => setChoosingPayer(true)}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-nnm-gold px-6 py-2.5 text-sm font-semibold text-[#20240a] shadow-[0_3px_0_#96791b] transition-transform hover:-translate-y-px"
            >
              Pay Property Tax
            </button>
          ) : (
            <div className="w-full rounded-md border border-line bg-white p-4">
              {!payerChoice ? (
                <>
                  <p className="mb-3 text-right text-xs font-medium text-ink-soft">Who is paying?</p>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => choosePayer("tax_collector")}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-slate-50"
                    >
                      <Users className="h-4 w-4" />
                      Tax Collector
                    </button>
                    <button
                      onClick={() => choosePayer("public")}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-slate-50"
                    >
                      <User className="h-4 w-4" />
                      Public
                    </button>
                  </div>
                  <button onClick={resetPayerChoice} className="mt-3 w-full text-right text-xs text-ink-soft hover:underline">
                    Cancel
                  </button>
                </>
              ) : payerChoice === "tax_collector" ? (
                <>
                  <label className="mb-1 block text-right font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft">
                    Tax Collector Code
                  </label>
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
                      {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
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
                      Verified: {verifiedCollector.name} ({verifiedCollector.code})
                    </p>
                  )}

                  {verifiedCollector && (
                    <button
                      onClick={handlePay}
                      disabled={paying}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-nnm-gold px-6 py-2.5 text-sm font-semibold text-[#20240a] shadow-[0_3px_0_#96791b] transition-transform hover:-translate-y-px disabled:opacity-60"
                    >
                      {paying && <Loader2 className="h-4 w-4 animate-spin" />}
                      {paying ? "Redirecting to bank…" : `Pay ${formatINR(total)}`}
                    </button>
                  )}
                  <button onClick={resetPayerChoice} className="mt-2 w-full text-right text-xs text-ink-soft hover:underline">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <p className="mb-3 text-right text-xs text-ink-soft">Paying as a member of the public.</p>
                  <button
                    onClick={handlePay}
                    disabled={paying}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-nnm-gold px-6 py-2.5 text-sm font-semibold text-[#20240a] shadow-[0_3px_0_#96791b] transition-transform hover:-translate-y-px disabled:opacity-60"
                  >
                    {paying && <Loader2 className="h-4 w-4 animate-spin" />}
                    {paying ? "Redirecting to bank…" : `Pay ${formatINR(total)}`}
                  </button>
                  <button onClick={resetPayerChoice} className="mt-2 w-full text-right text-xs text-ink-soft hover:underline">
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
          {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </article>
  );
}
