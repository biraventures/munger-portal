"use client";

/** Cheque / Demand Draft details - such a payment is provisional until the Project Manager and the Tax Daroga reconcile it. */
export interface InstrumentValue {
  instrumentNo: string;
  instrumentDate: string;
  bankName: string;
  branchName: string;
}

export const EMPTY_INSTRUMENT: InstrumentValue = { instrumentNo: "", instrumentDate: "", bankName: "", branchName: "" };

export function isInstrumentMode(paymentMode: string): boolean {
  const m = paymentMode.trim().toLowerCase();
  return m === "cheque" || m === "demand draft" || m === "dd";
}

/** Null when complete, otherwise what is missing. */
export function instrumentError(paymentMode: string, v: InstrumentValue): string | null {
  if (!isInstrumentMode(paymentMode)) return null;
  if (!v.instrumentNo.trim() || !v.instrumentDate || !v.bankName.trim()) return `${paymentMode} number, date and bank name are required.`;
  return null;
}

export function InstrumentFields({
  paymentMode,
  value,
  onChange,
  inputClassName,
  labelClassName = "mb-1 block text-xs font-medium text-slate-600",
}: {
  paymentMode: string;
  value: InstrumentValue;
  onChange: (v: InstrumentValue) => void;
  inputClassName: string;
  labelClassName?: string;
}) {
  if (!isInstrumentMode(paymentMode)) return null;
  const label = paymentMode === "Cheque" ? "Cheque" : "DD";
  const set = (k: keyof InstrumentValue) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid grid-cols-1 gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 sm:col-span-2 sm:grid-cols-2">
      <p className="text-xs text-amber-800 sm:col-span-2">
        {label} payments get a <b>provisional</b> receipt. The demand stays on hold until the Project Manager and the Tax Daroga
        confirm the amount is credited to the Nagar Nigam account; if it bounces, the demand becomes unpaid again.
      </p>
      <div>
        <label className={labelClassName}>{label} number</label>
        <input value={value.instrumentNo} onChange={set("instrumentNo")} maxLength={50} className={inputClassName} />
      </div>
      <div>
        <label className={labelClassName}>{label} date</label>
        <input type="date" value={value.instrumentDate} onChange={set("instrumentDate")} className={inputClassName} />
      </div>
      <div>
        <label className={labelClassName}>Bank name</label>
        <input value={value.bankName} onChange={set("bankName")} maxLength={50} className={inputClassName} />
      </div>
      <div>
        <label className={labelClassName}>Branch (optional)</label>
        <input value={value.branchName} onChange={set("branchName")} maxLength={50} className={inputClassName} />
      </div>
    </div>
  );
}
