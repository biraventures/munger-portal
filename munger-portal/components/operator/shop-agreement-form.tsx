"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Clock } from "lucide-react";
import { submitAgreementChange, type AgreementInput } from "@/lib/shop-api";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

type Source = "agreement" | "demand_register";

export function ShopAgreementForm({
  shopNo,
  isEditing,
  initial,
  onSubmitted,
}: {
  shopNo: string;
  isEditing: boolean;
  initial?: Partial<AgreementInput>;
  onSubmitted: (changeRequestId: number) => void;
}) {
  const [form, setForm] = useState<AgreementInput>({
    agreementNumber: initial?.agreementNumber ?? "",
    agreementHolderName: initial?.agreementHolderName ?? "",
    demandRegisterHolderName: initial?.demandRegisterHolderName ?? "",
    holderName: initial?.holderName ?? "",
    holderRelationType: initial?.holderRelationType ?? "",
    holderRelationName: initial?.holderRelationName ?? "",
    holderMobile: initial?.holderMobile ?? "",
    holderAddress: initial?.holderAddress ?? "",
    idProofNumber: initial?.idProofNumber ?? "",
    businessName: initial?.businessName ?? "",
    agreementRent: initial?.agreementRent ?? null,
    demandRegisterRent: initial?.demandRegisterRent ?? null,
    baseMonthlyRent: initial?.baseMonthlyRent ?? 0,
    rentPre2019: initial?.rentPre2019 ?? null,
    rent201920: initial?.rent201920 ?? null,
    rent202021Onwards: initial?.rent202021Onwards ?? null,
    agreementStartDate: initial?.agreementStartDate ?? "",
    agreementEndDate: initial?.agreementEndDate ?? "",
    securityDeposit: initial?.securityDeposit ?? 0,
    miscCost: initial?.miscCost ?? 0,
    miscCostReason: initial?.miscCostReason ?? "",
    miscRebate: initial?.miscRebate ?? 0,
    miscRebateReason: initial?.miscRebateReason ?? "",
    jointHolderName: initial?.jointHolderName ?? "",
    jointHolderRelation: initial?.jointHolderRelation ?? "",
    jointHolderIdProofNumber: initial?.jointHolderIdProofNumber ?? "",
    presentOccupantName: initial?.presentOccupantName ?? "",
    presentOccupantAadhaar: initial?.presentOccupantAadhaar ?? "",
    presentOccupantYearsApprox: initial?.presentOccupantYearsApprox ?? "",
    notes: initial?.notes ?? "",
    changeReason: "",
  });
  const [rentSource, setRentSource] = useState<Source>("demand_register");
  const [nameSource, setNameSource] = useState<Source>("demand_register");
  const [hasJointHolder, setHasJointHolder] = useState(Boolean(initial?.jointHolderName));
  const [hasPresentOccupant, setHasPresentOccupant] = useState(Boolean(initial?.presentOccupantName));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: number; tier: "full" | "data_completion" } | null>(null);

  function update<K extends keyof AgreementInput>(key: K, value: AgreementInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  useEffect(() => {
    const val = rentSource === "agreement" ? form.agreementRent : form.demandRegisterRent;
    if (val !== null && val !== undefined) update("baseMonthlyRent", val);
  }, [rentSource, form.agreementRent, form.demandRegisterRent]);

  useEffect(() => {
    const val = nameSource === "agreement" ? form.agreementHolderName : form.demandRegisterHolderName;
    if (val) update("holderName", val);
  }, [nameSource, form.agreementHolderName, form.demandRegisterHolderName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.changeReason.trim()) {
      setError("A reason for this change/creation is required — recorded in the approval audit trail.");
      return;
    }
    if (!form.holderName.trim()) {
      setError("Applicable holder name is required — fill in at least one of the two name fields above.");
      return;
    }
    if (!form.baseMonthlyRent) {
      setError("Applicable rent is required — fill in at least one of the two rent fields above.");
      return;
    }
    if (form.miscCost && !form.miscCostReason?.trim()) {
      setError("A reason is required when a misc cost is set.");
      return;
    }
    if (form.miscRebate && !form.miscRebateReason?.trim()) {
      setError("A reason is required when a rebate is set.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitAgreementChange(shopNo, {
        ...form,
        agreementNumber: form.agreementNumber || null,
        agreementHolderName: form.agreementHolderName || null,
        demandRegisterHolderName: form.demandRegisterHolderName || null,
        holderRelationType: form.holderRelationType || null,
        holderRelationName: form.holderRelationName || null,
        holderMobile: form.holderMobile || null,
        holderAddress: form.holderAddress || null,
        idProofNumber: form.idProofNumber || null,
        businessName: form.businessName || null,
        agreementEndDate: form.agreementEndDate || null,
        agreementStartDate: form.agreementStartDate || null,
        rentPre2019: form.rentPre2019 || null,
        rent201920: form.rent201920 || null,
        rent202021Onwards: form.rent202021Onwards || null,
        miscCostReason: form.miscCost ? form.miscCostReason || null : null,
        miscRebateReason: form.miscRebate ? form.miscRebateReason || null : null,
        jointHolderName: hasJointHolder ? form.jointHolderName || null : null,
        jointHolderRelation: hasJointHolder ? form.jointHolderRelation || null : null,
        jointHolderIdProofNumber: hasJointHolder ? form.jointHolderIdProofNumber || null : null,
        presentOccupantName: hasPresentOccupant ? form.presentOccupantName || null : null,
        presentOccupantAadhaar: hasPresentOccupant ? form.presentOccupantAadhaar || null : null,
        presentOccupantYearsApprox: hasPresentOccupant ? form.presentOccupantYearsApprox || null : null,
        notes: form.notes || null,
      });
      setResult({ id: res.changeRequestId, tier: res.approvalTier });
      onSubmitted(res.changeRequestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit agreement.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result !== null) {
    return (
      <div role="status" className="flex items-start gap-2.5 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">Submitted for approval (request #{result.id})</p>
          {result.tier === "data_completion" ? (
            <p className="text-blue-700">
              This record was migrated with known gaps, so completing it only needs approval up to Deputy
              Commissioner — not the full chain.
            </p>
          ) : (
            <p className="text-blue-700">
              This now goes through the full chain — Stall Prabhari → Tax Daroga (NOC) → City Manager → Deputy
              Commissioner → Commissioner — before it takes effect.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Agreement Holder</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Agreement number (optional)</label>
            <input value={form.agreementNumber ?? ""} onChange={(e) => update("agreementNumber", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>ID proof number (optional)</label>
            <input value={form.idProofNumber ?? ""} onChange={(e) => update("idProofNumber", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Business name (optional)</label>
            <input
              value={form.businessName ?? ""}
              onChange={(e) => update("businessName", e.target.value)}
              placeholder="e.g. Sharma Tea Stall"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Name as per agreement</label>
            <input value={form.agreementHolderName ?? ""} onChange={(e) => update("agreementHolderName", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Name as per demand register</label>
            <input value={form.demandRegisterHolderName ?? ""} onChange={(e) => update("demandRegisterHolderName", e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Applicable name</label>
            <select value={nameSource} onChange={(e) => setNameSource(e.target.value as Source)} className={inputClass}>
              <option value="agreement">As per agreement — {form.agreementHolderName || "(not entered)"}</option>
              <option value="demand_register">As per demand register — {form.demandRegisterHolderName || "(not entered)"}</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">Currently applicable: <b>{form.holderName || "—"}</b></p>
          </div>
          <div>
            <label className={labelClass}>Mobile number</label>
            <input value={form.holderMobile ?? ""} onChange={(e) => update("holderMobile", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Relation type</label>
            <select value={form.holderRelationType ?? ""} onChange={(e) => update("holderRelationType", e.target.value)} className={inputClass}>
              <option value="">—</option>
              <option value="S/O">S/O</option>
              <option value="D/O">D/O</option>
              <option value="W/O">W/O</option>
              <option value="C/O">C/O</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Relation name (father/husband)</label>
            <input value={form.holderRelationName ?? ""} onChange={(e) => update("holderRelationName", e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Address</label>
            <input value={form.holderAddress ?? ""} onChange={(e) => update("holderAddress", e.target.value)} className={inputClass} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Joint Holder</h2>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={hasJointHolder} onChange={(e) => setHasJointHolder(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Joint holder exists
          </label>
        </div>
        {hasJointHolder && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Joint holder name</label>
              <input value={form.jointHolderName ?? ""} onChange={(e) => update("jointHolderName", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Relation to primary holder</label>
              <input value={form.jointHolderRelation ?? ""} onChange={(e) => update("jointHolderRelation", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Joint holder ID proof (optional)</label>
              <input value={form.jointHolderIdProofNumber ?? ""} onChange={(e) => update("jointHolderIdProofNumber", e.target.value)} className={inputClass} />
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Present Occupant</h2>
            <p className="text-xs text-slate-500">Only if different from the holder above (e.g. an informal succession the paperwork hasn&apos;t caught up with).</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={hasPresentOccupant}
              onChange={(e) => setHasPresentOccupant(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Differs from holder
          </label>
        </div>
        {hasPresentOccupant && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Present occupant name</label>
              <input value={form.presentOccupantName ?? ""} onChange={(e) => update("presentOccupantName", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Aadhaar number (optional)</label>
              <input
                value={form.presentOccupantAadhaar ?? ""}
                onChange={(e) => update("presentOccupantAadhaar", e.target.value)}
                placeholder="1234 5678 9012"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Approx. years occupying (optional)</label>
              <input
                value={form.presentOccupantYearsApprox ?? ""}
                onChange={(e) => update("presentOccupantYearsApprox", e.target.value)}
                placeholder="e.g. around 8-9 years"
                className={inputClass}
              />
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Rent Terms</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Rent as per agreement (₹)</label>
            <input
              type="number"
              min="0"
              value={form.agreementRent ?? ""}
              onChange={(e) => update("agreementRent", e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Rent as per demand register (₹)</label>
            <input
              type="number"
              min="0"
              value={form.demandRegisterRent ?? ""}
              onChange={(e) => update("demandRegisterRent", e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Applicable rent</label>
            <select value={rentSource} onChange={(e) => setRentSource(e.target.value as Source)} className={inputClass}>
              <option value="agreement">As per agreement — ₹{form.agreementRent ?? "(not entered)"}</option>
              <option value="demand_register">As per demand register — ₹{form.demandRegisterRent ?? "(not entered)"}</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">Currently applicable: <b>₹{form.baseMonthlyRent || "—"}/month</b></p>
          </div>
          <div>
            <label className={labelClass}>Security deposit (₹)</label>
            <input
              type="number"
              min="0"
              value={form.securityDeposit || ""}
              onChange={(e) => update("securityDeposit", Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Agreement start date (if known)</label>
            <input
              type="date"
              value={form.agreementStartDate ?? ""}
              onChange={(e) => update("agreementStartDate", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Agreement end date (optional)</label>
            <input
              type="date"
              value={form.agreementEndDate ?? ""}
              onChange={(e) => update("agreementEndDate", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Escalation Period Rates</h2>
        <p className="mb-4 text-xs text-slate-500">
          Enter whichever ONE of these you actually know — the other two are calculated automatically (25% at
          2019-20, a further 50% from 2020-21 onwards). If you enter more than one and they don&apos;t agree with
          the formula, it&apos;s flagged for Deputy Municipal Commissioner review rather than silently picked.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Rent before 2019-20 (₹)</label>
            <input
              type="number"
              min="0"
              value={form.rentPre2019 ?? ""}
              onChange={(e) => update("rentPre2019", e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Rent for 2019-20 (₹)</label>
            <input
              type="number"
              min="0"
              value={form.rent201920 ?? ""}
              onChange={(e) => update("rent201920", e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Rent from 2020-21 onwards (₹)</label>
            <input
              type="number"
              min="0"
              value={form.rent202021Onwards ?? ""}
              onChange={(e) => update("rent202021Onwards", e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Misc Cost &amp; Rebate</h2>
        <p className="mb-4 text-xs text-slate-500">
          One-off adjustments, kept separate from rent and the automatic 2% overdue penalty so a bill is never
          ambiguous about what it includes. A reason is required whenever either is set.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Misc cost (₹)</label>
            <input
              type="number"
              min="0"
              value={form.miscCost || ""}
              onChange={(e) => update("miscCost", Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Reason for misc cost {form.miscCost ? "(required)" : ""}</label>
            <input
              value={form.miscCostReason ?? ""}
              onChange={(e) => update("miscCostReason", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Rebate (₹)</label>
            <input
              type="number"
              min="0"
              value={form.miscRebate || ""}
              onChange={(e) => update("miscRebate", Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Reason for rebate {form.miscRebate ? "(required)" : ""}</label>
            <input
              value={form.miscRebateReason ?? ""}
              onChange={(e) => update("miscRebateReason", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Notes</h2>
        <p className="mb-3 text-xs text-slate-500">Any context worth recording — e.g. informal succession, disputes, file status.</p>
        <textarea value={form.notes ?? ""} onChange={(e) => update("notes", e.target.value)} rows={2} className={inputClass} />
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="mb-1 text-base font-semibold text-amber-900">Reason for {isEditing ? "change" : "new agreement"}</h2>
        <p className="mb-4 text-xs text-amber-700">Required — recorded in the approval audit trail.</p>
        <textarea
          required
          value={form.changeReason}
          onChange={(e) => update("changeReason", e.target.value)}
          rows={3}
          className={inputClass}
        />
      </section>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-nnm-blue py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {submitting ? "Submitting…" : "Submit for Approval"}
      </button>
    </form>
  );
}