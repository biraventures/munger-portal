"use client";

import { BANK_NAMES, reconciliationRule } from "@/lib/payment-modes";

/** Payment details entered with every collection; which fields show (and are required) depends on the mode. */
export interface InstrumentValue {
  bankChoice: string;
  otherBank: string;
  branchName: string;
  instrumentNo: string;
  instrumentDate: string;
  cardType: string;
  cardHolderName: string;
  cardLast4: string;
  amountReceivedActual: string;
}

export const EMPTY_INSTRUMENT: InstrumentValue = {
  bankChoice: "",
  otherBank: "",
  branchName: "",
  instrumentNo: "",
  instrumentDate: "",
  cardType: "",
  cardHolderName: "",
  cardLast4: "",
  amountReceivedActual: "",
};

const OTHER = "Other";

function bankOf(v: InstrumentValue): string {
  return v.bankChoice === OTHER ? v.otherBank.trim() : v.bankChoice;
}

interface ModeSpec {
  bank: "required" | "optional" | null;
  branch: boolean;
  no: { label: string; required: boolean } | null;
  date: { label: string; required: boolean } | null;
  card: "required" | "optional" | null;
}

function specFor(mode: string): ModeSpec {
  switch (mode) {
    case "Cheque":
      return { bank: "required", branch: true, no: { label: "Cheque number", required: true }, date: { label: "Cheque date", required: true }, card: null };
    case "Demand Draft":
      return { bank: "required", branch: true, no: { label: "DD number", required: true }, date: { label: "DD date", required: true }, card: null };
    case "UPI":
      return { bank: "optional", branch: false, no: { label: "UPI URN / UTR number", required: true }, date: null, card: null };
    case "Online Banking":
      return { bank: "required", branch: false, no: { label: "Transaction reference (UTR)", required: true }, date: { label: "Transfer date", required: false }, card: null };
    case "Card":
      return { bank: "optional", branch: false, no: { label: "Approval code / txn ID", required: false }, date: null, card: "required" };
    case "Cash / Prepaid Card":
      return { bank: null, branch: false, no: null, date: null, card: "optional" };
    default:
      return { bank: null, branch: false, no: null, date: null, card: null };
  }
}

/** Null when complete, otherwise what is missing. */
export function instrumentError(paymentMode: string, v: InstrumentValue, amountDemanded: number): string | null {
  const s = specFor(paymentMode);
  const missing: string[] = [];
  if (s.bank === "required" && !bankOf(v)) missing.push("bank name");
  if (v.bankChoice === OTHER && !v.otherBank.trim()) missing.push("the bank's name");
  if (s.no?.required && !v.instrumentNo.trim()) missing.push(s.no.label.toLowerCase());
  if (s.date?.required && !v.instrumentDate) missing.push(s.date.label.toLowerCase());
  if (s.card === "required" && !v.cardHolderName.trim()) missing.push("card holder name");
  if (s.card === "required" && !v.cardLast4.trim()) missing.push("last 4 digits of the card");
  if (missing.length) return `Enter the ${missing.join(", ")}.`;
  if (s.card && v.cardLast4.trim() && !/^\d{4}$/.test(v.cardLast4.trim())) return "Enter exactly the last 4 digits of the card.";
  if (!v.amountReceivedActual.trim()) return "Enter the actual amount received.";
  const actual = Number(v.amountReceivedActual);
  if (Number.isNaN(actual) || Math.round(actual * 100) !== Math.round(amountDemanded * 100)) {
    return `The amount received must equal the money demanded (₹${amountDemanded.toLocaleString("en-IN")}). For less, generate a part-payment notice first.`;
  }
  return null;
}

/** The request fields for the API. */
export function instrumentPayload(paymentMode: string, v: InstrumentValue) {
  const s = specFor(paymentMode);
  return {
    amountReceivedActual: Number(v.amountReceivedActual),
    ...(s.bank ? { bankName: bankOf(v) || undefined } : {}),
    ...(s.branch ? { branchName: v.branchName.trim() || undefined } : {}),
    ...(s.no ? { instrumentNo: v.instrumentNo.trim() || undefined } : {}),
    ...(s.date ? { instrumentDate: v.instrumentDate || undefined } : {}),
    ...(s.card
      ? {
          cardType: paymentMode === "Card" ? v.cardType || undefined : undefined,
          cardHolderName: v.cardHolderName.trim() || undefined,
          cardLast4: v.cardLast4.trim() || undefined,
        }
      : {}),
  };
}

export function InstrumentFields({
  paymentMode,
  amountDemanded,
  value,
  onChange,
  inputClassName,
  labelClassName = "mb-1 block text-xs font-medium text-slate-600",
}: {
  paymentMode: string;
  amountDemanded: number | null;
  value: InstrumentValue;
  onChange: (v: InstrumentValue) => void;
  inputClassName: string;
  labelClassName?: string;
}) {
  const s = specFor(paymentMode);
  const rule = reconciliationRule(paymentMode);
  const set = (k: keyof InstrumentValue) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  const opt = (required: boolean) => (required ? "" : " (optional)");

  return (
    <div className="grid grid-cols-1 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:col-span-2 sm:grid-cols-2">
      <div>
        <label className={labelClassName}>Money demanded</label>
        <input value={amountDemanded !== null ? `₹${amountDemanded.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"} readOnly className={`${inputClassName} bg-slate-100`} />
      </div>
      <div>
        <label className={labelClassName}>Actual amount received (₹)</label>
        <input type="number" inputMode="decimal" min={0} step="0.01" value={value.amountReceivedActual} onChange={set("amountReceivedActual")} className={inputClassName} />
      </div>

      {s.bank && (
        <div>
          <label className={labelClassName}>Bank{opt(s.bank === "required")}</label>
          <select value={value.bankChoice} onChange={set("bankChoice")} className={inputClassName}>
            <option value="">Select bank</option>
            {BANK_NAMES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
            <option value={OTHER}>Other (type the name)</option>
          </select>
        </div>
      )}
      {s.bank && value.bankChoice === OTHER && (
        <div>
          <label className={labelClassName}>Bank name</label>
          <input value={value.otherBank} onChange={set("otherBank")} maxLength={50} className={inputClassName} />
        </div>
      )}
      {s.branch && (
        <div>
          <label className={labelClassName}>Branch (optional)</label>
          <input value={value.branchName} onChange={set("branchName")} maxLength={50} className={inputClassName} />
        </div>
      )}
      {s.no && (
        <div>
          <label className={labelClassName}>
            {s.no.label}
            {opt(s.no.required)}
          </label>
          <input value={value.instrumentNo} onChange={set("instrumentNo")} maxLength={50} className={inputClassName} />
        </div>
      )}
      {s.date && (
        <div>
          <label className={labelClassName}>
            {s.date.label}
            {opt(s.date.required)}
          </label>
          <input type="date" value={value.instrumentDate} onChange={set("instrumentDate")} className={inputClassName} />
        </div>
      )}
      {s.card && (
        <>
          {paymentMode === "Card" && (
            <div>
              <label className={labelClassName}>Card type (optional)</label>
              <select value={value.cardType} onChange={set("cardType")} className={inputClassName}>
                <option value="">—</option>
                <option value="Debit">Debit</option>
                <option value="Credit">Credit</option>
              </select>
            </div>
          )}
          <div>
            <label className={labelClassName}>Card holder name{opt(s.card === "required")}</label>
            <input value={value.cardHolderName} onChange={set("cardHolderName")} maxLength={50} className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName}>Card last 4 digits{opt(s.card === "required")}</label>
            <input
              value={value.cardLast4}
              onChange={(e) => onChange({ ...value, cardLast4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              inputMode="numeric"
              maxLength={4}
              className={inputClassName}
            />
          </div>
        </>
      )}

      {rule === "hold" && (
        <p className="text-xs text-amber-800 sm:col-span-2">
          A {paymentMode === "Cheque" ? "cheque" : "DD"} gets a <b>temporary / provisional</b> receipt. The demand stays on hold until the
          Project Manager and the Tax Daroga reconcile it; if it bounces, the demand becomes unpaid again.
        </p>
      )}
      {rule === "pending" && (
        <p className="text-xs text-slate-500 sm:col-span-2">Recorded as &quot;reconciliation pending&quot; until it is matched with the bank credit.</p>
      )}
    </div>
  );
}
