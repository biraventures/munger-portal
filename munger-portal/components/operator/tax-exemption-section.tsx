"use client";

import { useEffect, useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { FinancialYearSelect } from "./financial-year-select";
import {
  fetchTaxExemptionOptions,
  openExemptionOrder,
  type ExemptionLogin,
  type TaxExemptionFormState,
  type TaxExemptionOptions,
} from "@/lib/tax-exemption-api";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

/**
 * Holding tax exemption (government order, religious institution, etc.).
 * Only for an EXISTING holding - the change goes through the approval chain
 * (Tax Daroga, then Mutation Nodal Clerk) before it takes effect.
 */
export function TaxExemptionSection({
  value,
  onChange,
  wasExempt,
  as = "operator",
}: {
  value: TaxExemptionFormState;
  onChange: (next: TaxExemptionFormState) => void;
  /** Whether the holding is exempt on record right now (to explain what un-ticking does). */
  wasExempt: boolean;
  as?: ExemptionLogin;
}) {
  const [options, setOptions] = useState<TaxExemptionOptions | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const set = <K extends keyof TaxExemptionFormState>(k: K, v: TaxExemptionFormState[K]) => onChange({ ...value, [k]: v });
  const thisYear = new Date().getFullYear();

  useEffect(() => {
    fetchTaxExemptionOptions(as).then(setOptions).catch(() => setOptions(null));
  }, [as]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-900">
        <ShieldCheck className="h-4 w-4 text-nnm-blue" /> Holding Tax Exemption
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        For holdings exempted by a government order, religious institutions, and similar. An exempt holding pays no holding tax
        from the year given below; earlier years stay payable as arrears. <b>The solid waste user charge is still charged.</b> This
        change goes to Tax Daroga and Mutation Nodal Clerk for approval.
      </p>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={value.isExempt} onChange={(e) => set("isExempt", e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
        <span>
          This holding is exempt from holding tax
          {wasExempt && !value.isExempt && (
            <span className="block text-xs font-semibold text-amber-700">Un-ticking removes the exemption once approved - holding tax will be charged again.</span>
          )}
        </span>
      </label>

      {value.isExempt && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Category</label>
            <select value={value.category} onChange={(e) => set("category", e.target.value)} className={inputClass} required>
              <option value="">Select…</option>
              {(options?.categories ?? []).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Exempt from assessment year</label>
            <FinancialYearSelect value={value.fromYear} onChange={(v) => set("fromYear", v)} startYear={1990} endYear={thisYear} allowBlank blankLabel="Select year…" required />
            <p className="mt-1 text-xs text-slate-400">Tax for this year and later is waived. Earlier years remain due.</p>
          </div>
          <div>
            <label className={labelClass}>Order number</label>
            <input value={value.orderNo} onChange={(e) => set("orderNo", e.target.value)} className={inputClass} placeholder="e.g. 123/2022" required />
          </div>
          <div>
            <label className={labelClass}>Order date</label>
            <input type="date" value={value.orderDate} onChange={(e) => set("orderDate", e.target.value)} className={inputClass} required />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Remarks {value.category === "Other" ? "(required for Other)" : "(optional)"}</label>
            <input value={value.remarks} onChange={(e) => set("remarks", e.target.value)} className={inputClass} placeholder="Issuing authority, basis of exemption, etc." />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Copy of the exemption order (PDF / JPG / PNG, up to 5 MB)</label>
            <input
              type="file"
              accept={(options?.allowedExtensions ?? ["pdf", "jpg", "jpeg", "png"]).map((x) => `.${x}`).join(",")}
              onChange={(e) => set("newOrderFile", e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            {value.orderDocId && !value.newOrderFile && (
              <p className="mt-1 text-xs text-slate-500">
                Order copy already on file.{" "}
                <button type="button" onClick={() => openExemptionOrder(value.orderDocId, as).catch((e) => setOpenError(e.message))} className="inline-flex items-center gap-1 font-semibold text-nnm-blue hover:underline">
                  <ExternalLink className="h-3 w-3" /> Open
                </button>{" "}
                Choose a file only to replace it.
              </p>
            )}
            {openError && <p className="mt-1 text-xs text-red-600">{openError}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
